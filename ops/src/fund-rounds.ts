/**
 * Fund the round mine (docs/13 §2 "Funding"): approves and calls RoundMine.fund for each requested
 * stock, which pulls the stock into the vault and adds it to the running round's pot. The pot is
 * locked when the round closes. Anyone may fund, as often as fees arrive (a bot every few minutes is
 * fine); `--loop <seconds>` keeps funding the wallet's whole balance of each stock on an interval.
 *
 *   FUNDER_KEY=0x… pnpm --filter @stock-miner/ops fund-rounds --stock NVDA|0|all --amount 0.5 [--dry-run] [--key-env FUNDER_KEY]
 *   FUNDER_KEY=0x… pnpm --filter @stock-miner/ops fund-rounds --stock all --amount balance --loop 300   # sweep the wallet into the pot every 5 min
 *   FUNDER_KEY=0x… pnpm --filter @stock-miner/ops fund-rounds --reserve 5000        # RoundVault.topUpReserve (USDG)
 *
 * --amount is whole Stock Tokens per stock (so `--stock all --amount 2` moves 2 of each of the four), or
 * `balance` for everything the wallet holds. The key comes from --key-env, else FUNDER_KEY, else
 * OPERATOR_KEY, else PRIVATE_KEY. The script refuses when the wallet does not hold the amount, and
 * prints the running round's pot per stock afterwards.
 */
import { formatUnits, parseUnits, type Address } from "viem";
import { arg, clients, erc20Abi, hasFlag } from "./lib/season.js";
import { catchUp, loadRoundsDeployment, resolveStocks, roundClock, roundMineAbi, roundsBehind, roundVaultAbi, syncLaunchFromChain } from "./lib/rounds.js";

const TAG = "[fund-rounds]";

function keyEnv(): string {
  const explicit = arg("--key-env");
  if (explicit) return explicit;
  if (process.env.FUNDER_KEY) return "FUNDER_KEY";
  if (process.env.OPERATOR_KEY) return "OPERATOR_KEY";
  return "PRIVATE_KEY";
}

async function main() {
  const loopSec = Number(arg("--loop", "0"));
  for (;;) {
    await runOnce();
    if (!(loopSec > 0)) return;
    await new Promise((r) => setTimeout(r, loopSec * 1000));
  }
}

async function runOnce() {
  const dep = loadRoundsDeployment();
  const { pub, wallet, account } = clients(keyEnv());
  await syncLaunchFromChain(dep, pub);
  const dry = hasFlag("--dry-run");
  const stockSpec = arg("--stock");
  const amountArg = arg("--amount");
  const reserveArg = arg("--reserve");
  if (!stockSpec && !reserveArg) throw new Error("usage: fund-rounds --stock <symbol|index|all> --amount <tokens|balance> [--loop <seconds>] [--reserve <usdg>] [--dry-run]");

  const halted = (await pub.readContract({ abi: roundMineAbi, address: dep.mine, functionName: "halted" })) as boolean;
  if (halted) throw new Error("mine is halted; fund would revert");
  // fund reverts with NotCaughtUp while elapsed boundaries are unrecorded (docs/13 §2 "Catch-up").
  if (dry) {
    const { behind } = await roundsBehind(pub, dep.mine);
    if (behind > 0) console.log(`${TAG} mine is ${behind} rounds behind; the real run would poke first`);
  } else {
    await catchUp(pub, wallet, dep.mine, TAG);
  }
  const now = Number((await pub.getBlock()).timestamp);
  const current = Number((await pub.readContract({ abi: roundMineAbi, address: dep.mine, functionName: "currentRound" })) as bigint);
  const clock = roundClock(dep.genesis, dep.roundSeconds, dep.claimSeconds, now);
  console.log(`${TAG} chain ${dep.chainId} mine ${dep.mine} funder ${account.address}${dry ? " (dry run)" : ""}`);
  console.log(`${TAG} now ${new Date(now * 1000).toISOString()} round ${current} closes in ${clock.secondsToClose}s`);

  async function send(address: Address, abi: typeof erc20Abi, fn: string, args: unknown[], what: string) {
    if (dry) return console.log(`${TAG} would ${what}: ${fn}(${args.map(String).join(", ")}) on ${address}`);
    const hash = await wallet.writeContract({ abi, address, functionName: fn, args });
    const r = await pub.waitForTransactionReceipt({ hash });
    if (r.status !== "success") throw new Error(`${fn} reverted (${hash})`);
    console.log(`${TAG} ${what}: ${hash.slice(0, 10)} gas=${r.gasUsed}`);
  }

  if (stockSpec) {
    if (!amountArg) throw new Error("--amount <tokens> is required with --stock");
    const indices = resolveStocks(stockSpec, dep.symbols);
    for (const s of indices) {
      const token = dep.stocks[s];
      const sym = dep.symbols[s];
      const decimals = (await pub.readContract({ abi: erc20Abi, address: token, functionName: "decimals" })) as number;
      const fmt = (v: bigint) => formatUnits(v, decimals);
      const bal = (await pub.readContract({ abi: erc20Abi, address: token, functionName: "balanceOf", args: [account.address] })) as bigint;
      const amount = amountArg === "balance" ? bal : parseUnits(amountArg, decimals);
      if (amount === 0n) { console.log(`${TAG} ${sym}: nothing to fund`); continue; }
      console.log(`${TAG} ${sym} (${token}): ${fmt(amount)} into round ${current}; wallet holds ${fmt(bal)}`);
      if (bal < amount) {
        if (!dry) throw new Error(`${sym}: wallet holds ${fmt(bal)}, needs ${fmt(amount)}`);
        console.log(`${TAG} ${sym}: WARNING wallet would be short (dry run continues)`);
      }
      const allowance = (await pub.readContract({ abi: erc20Abi, address: token, functionName: "allowance", args: [account.address, dep.mine] })) as bigint;
      if (allowance < amount) await send(token, erc20Abi, "approve", [dep.mine, amount], `approve ${sym} ${fmt(amount)} to the mine`);
      await send(dep.mine, roundMineAbi, "fund", [s, amount], `fund ${sym} ${fmt(amount)} into round ${current}`);
    }
  }

  if (reserveArg) {
    const udec = (await pub.readContract({ abi: erc20Abi, address: dep.usdc, functionName: "decimals" })) as number;
    const reserve = parseUnits(reserveArg, udec);
    const ubal = (await pub.readContract({ abi: erc20Abi, address: dep.usdc, functionName: "balanceOf", args: [account.address] })) as bigint;
    console.log(`${TAG} reserve top-up ${formatUnits(reserve, udec)} USDG; wallet holds ${formatUnits(ubal, udec)}`);
    if (ubal < reserve && !dry) throw new Error(`wallet holds ${formatUnits(ubal, udec)} USDG, needs ${formatUnits(reserve, udec)}`);
    const allowance = (await pub.readContract({ abi: erc20Abi, address: dep.usdc, functionName: "allowance", args: [account.address, dep.vault] })) as bigint;
    if (allowance < reserve) await send(dep.usdc, erc20Abi, "approve", [dep.vault, reserve], "approve USDG to the vault");
    await send(dep.vault, roundVaultAbi, "topUpReserve", [reserve], "topUpReserve");
    const after = (await pub.readContract({ abi: roundVaultAbi, address: dep.vault, functionName: "reserve" })) as bigint;
    console.log(`${TAG} vault reserve now ${formatUnits(after, udec)} USDG`);
  }

  // The running round's pot per stock (funded so far + rollover), locked at its close.
  console.log(`${TAG} round ${current} pot so far (closes in ${clock.secondsToClose}s):`);
  for (let s = 0; s < dep.stocks.length; s++) {
    const decimals = (await pub.readContract({ abi: erc20Abi, address: dep.stocks[s], functionName: "decimals" })) as number;
    const p = (await pub.readContract({ abi: roundMineAbi, address: dep.mine, functionName: "pot", args: [BigInt(current), s] })) as bigint;
    console.log(`${TAG}   ${dep.symbols[s].padEnd(6)} ${formatUnits(p, decimals)}`);
  }
}

main().catch((e: Error) => { console.error(`${TAG} failed:`, e.message ?? e); process.exit(1); });
