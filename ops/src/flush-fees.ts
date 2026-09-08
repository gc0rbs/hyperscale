/**
 * Fee flusher (docs/13 §2 "Funding"): the Pons tax lands as ETH on the FeeFunder; this loop turns it
 * into the four Stock Tokens on their WETH pools and funds the running round, in one transaction,
 * with a slippage bound quoted right before sending (simulate with zero minOut, then send with a
 * haircut). Runs from the flusher key, which holds nothing but gas.
 *
 *   FLUSHER_KEY=0x… pnpm --filter @stock-miner/ops flush-fees [--interval 300] [--min-eth 0.002] [--slippage-bps 100] [--once] [--dry-run]
 *
 * Alerts (ALERT_WEBHOOK_URL) when the flusher's ETH drops below FLUSHER_MIN_ETH (0.01 default), when a
 * flush keeps reverting on slippage (a pool moved or dried up: re-point it with rounds-admin set-legs),
 * and when the mine is halted (ETH keeps accumulating; the owner sweeps it).
 */
import { formatEther, parseEther } from "viem";
import { createAlert } from "./lib/alert.js";
import { feeFunderAbi, haircut, loadRoundsDeployment, roundMineAbi, syncLaunchFromChain } from "./lib/rounds.js";
import { arg, clients, hasFlag } from "./lib/season.js";

const TAG = "[flush-fees]";
const interval = Number(arg("--interval", "300")) * 1000;
const minEth = parseEther(arg("--min-eth", "0.002")!);
const slippageBps = Number(arg("--slippage-bps", "100"));
const once = hasFlag("--once");
const dry = hasFlag("--dry-run");
const minFlusherEth = parseEther(process.env.FLUSHER_MIN_ETH ?? "0.01");
const alert = createAlert("flush-fees");
let slippageStreak = 0;

function keyEnv(): string {
  if (process.env.FLUSHER_KEY) return "FLUSHER_KEY";
  if (process.env.KEEPER_KEY) return "KEEPER_KEY";
  return "PRIVATE_KEY";
}

async function tick() {
  const dep = loadRoundsDeployment();
  const { pub, wallet, account } = clients(keyEnv());
  await syncLaunchFromChain(dep, pub);
  if (!dep.feeFunder) throw new Error("no FeeFunder in the deployment (FEE_FUNDER_ADDRESS)");
  const funder = { abi: feeFunderAbi, address: dep.feeFunder } as const;
  const [pending, halted, allowed, gas, legCount] = await Promise.all([
    pub.readContract({ ...funder, functionName: "pending" }) as Promise<bigint>,
    pub.readContract({ abi: roundMineAbi, address: dep.mine, functionName: "halted" }) as Promise<boolean>,
    pub.readContract({ ...funder, functionName: "flushers", args: [account.address] }) as Promise<boolean>,
    pub.getBalance({ address: account.address }),
    pub.readContract({ ...funder, functionName: "legCount" }) as Promise<bigint>,
  ]);
  if (gas < minFlusherEth) alert("warn", `flusher ${account.address} has ${formatEther(gas)} ETH, below ${formatEther(minFlusherEth)}`);
  if (!allowed) throw new Error(`${account.address} is not a flusher on ${dep.feeFunder} (rounds-admin set-flusher)`);
  if (halted) { alert("page", `mine is HALTED; ${formatEther(pending)} ETH waits on the FeeFunder for the owner to sweep`); return; }
  if (pending < minEth) { alert("info", `pending ${formatEther(pending)} ETH < ${formatEther(minEth)}; waiting`); return; }

  // Quote: simulate with zero minOut, then send with the haircut. The simulation runs at the current
  // pool prices, so the haircut is the room a sandwich or a tick move gets, nothing more.
  const zeros = Array.from({ length: Number(legCount) }, () => 0n);
  let outs: bigint[];
  try {
    const sim = await pub.simulateContract({ ...funder, functionName: "flush", args: [zeros], account });
    outs = (sim.result as bigint[]).map(BigInt);
  } catch (e) {
    alert("warn", `flush simulation failed: ${(e as Error).message.split("\n")[0]}`);
    return;
  }
  const minOut = haircut(outs, slippageBps);
  const legs = await Promise.all(Array.from({ length: Number(legCount) }, (_, i) => pub.readContract({ ...funder, functionName: "leg", args: [BigInt(i)] }) as Promise<{ stock: number }>));
  const desc = outs.map((o, i) => `${dep.symbols[legs[i].stock]}≥${formatEther(minOut[i])} (quote ${formatEther(o)})`).join(" ");
  if (dry) { console.log(`${TAG} DRY: would flush ${formatEther(pending)} ETH → ${desc}`); return; }
  try {
    const { request } = await pub.simulateContract({ ...funder, functionName: "flush", args: [minOut], account });
    const hash = await wallet.writeContract(request);
    const r = await pub.waitForTransactionReceipt({ hash });
    if (r.status !== "success") throw new Error(`flush reverted (${hash})`);
    slippageStreak = 0;
    alert("info", `flushed ${formatEther(pending)} ETH → ${desc} (${hash.slice(0, 10)} gas=${r.gasUsed})`);
  } catch (e) {
    const msg = (e as Error).message;
    if (/Slippage/.test(msg)) {
      slippageStreak++;
      if (slippageStreak >= 3) alert("warn", `flush reverted on slippage ${slippageStreak}× in a row: a pool moved more than ${slippageBps} bps between quote and send, or is too thin; re-point it with rounds-admin set-legs or raise --slippage-bps`);
      else console.log(`${TAG} slippage revert (${slippageStreak}); retrying next tick`);
    } else {
      throw e;
    }
  }
}

(async () => {
  for (;;) {
    try {
      await tick();
    } catch (e) {
      alert("warn", `flusher error: ${(e as Error).message.split("\n")[0]}`);
    }
    if (once) break;
    await new Promise((r) => setTimeout(r, interval));
  }
})();
