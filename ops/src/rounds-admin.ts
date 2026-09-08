/**
 * Round-mine admin (docs/13 §2 "Halt", §5). Every broadcasting command prints exactly what it would
 * do and refuses to send without --yes: these are irreversible on-chain actions with client money
 * (the 2026-09-05 launch retro, docs/BUILD-LOG.md).
 *
 *   pnpm --filter @stock-miner/ops rounds-admin status
 *   OPERATOR_KEY=0x… pnpm --filter @stock-miner/ops rounds-admin halt [--yes]
 *   OPERATOR_KEY=0x… pnpm --filter @stock-miner/ops rounds-admin unschedule --stock NVDA|0 --from-round N [--yes]
 *   OPERATOR_KEY=0x… pnpm --filter @stock-miner/ops rounds-admin rescue [--yes]       # after halt
 *   GUARDIAN_KEY=0x… pnpm --filter @stock-miner/ops rounds-admin pause|unpause [--yes]
 */
import { decodeEventLog, formatUnits, type Address } from "viem";
import { loadRoundsDeployment, resolveStocks, roundClock, roundMineAbi, roundVaultAbi } from "./lib/rounds.js";
import { arg, clients, erc20Abi, hasFlag } from "./lib/season.js";

const TAG = "[rounds-admin]";
const MAX_FUND_ROUNDS = 720; // RoundMine.MAX_FUND_ROUNDS
const SCAN_BATCH = 24;

async function main() {
  const cmd = process.argv[2];
  const dep = loadRoundsDeployment();
  const isGuardian = cmd === "pause" || cmd === "unpause";
  const { pub, wallet, account } = clients(isGuardian ? "GUARDIAN_KEY" : "OPERATOR_KEY");
  const yes = hasFlag("--yes");
  const mine = { abi: roundMineAbi, address: dep.mine } as const;
  const vault = { abi: roundVaultAbi, address: dep.vault } as const;
  const read = <T,>(fn: string, args: unknown[] = []) => pub.readContract({ ...mine, functionName: fn, args }) as Promise<T>;
  const readVault = <T,>(fn: string, args: unknown[] = []) => pub.readContract({ ...vault, functionName: fn, args }) as Promise<T>;

  const [operator, halted, paused, pausedAt, current, closed, params, block] = await Promise.all([
    read<Address>("operator"), read<boolean>("halted"), read<boolean>("paused"), read<bigint>("pausedAt"),
    read<bigint>("currentRound"), read<bigint>("closedRounds"),
    read<{ treasury: Address; pauseGraceSeconds: number }>("params"), pub.getBlock(),
  ]);
  const now = Number(block.timestamp);
  const cur = Number(current);
  const decimals: number[] = [];
  for (const t of dep.stocks) decimals.push((await pub.readContract({ abi: erc20Abi, address: t, functionName: "decimals" })) as number);
  const fmt = (s: number, v: bigint) => `${formatUnits(v, decimals[s])} ${dep.symbols[s]}`;

  async function broadcast(label: string, address: Address, abi: typeof roundMineAbi, fn: string, args: unknown[] = []) {
    // Simulate first so a revert is explained before anyone is asked to confirm.
    const sim = await pub.simulateContract({ abi, address, functionName: fn, args, account });
    if (!yes) {
      console.log(`${TAG} DRY: would send ${label} from ${account.address}. Re-run with --yes to broadcast.`);
      return { hash: undefined, result: sim.result, logs: [] as { data: `0x${string}`; topics: [`0x${string}`, ...`0x${string}`[]] | [] }[] };
    }
    const hash = await wallet.writeContract(sim.request);
    const r = await pub.waitForTransactionReceipt({ hash });
    if (r.status !== "success") throw new Error(`${fn} reverted (${hash})`);
    console.log(`${TAG} sent ${label}: ${hash} gas=${r.gasUsed}`);
    return { hash, result: sim.result, logs: r.logs };
  }
  function requireKey(expected: Address, role: string, env: string) {
    if (account.address.toLowerCase() !== expected.toLowerCase()) throw new Error(`${env} is ${account.address}, the mine's ${role} is ${expected}`);
  }

  if (cmd === "status" || !cmd) {
    const clock = roundClock(dep.genesis, dep.roundSeconds, dep.claimSeconds, now);
    const [totalHash, rigCount, reserve, udec] = await Promise.all([
      read<bigint>("totalHash"), read<bigint>("rigCount"), readVault<bigint>("reserve"),
      pub.readContract({ abi: erc20Abi, address: dep.usdc, functionName: "decimals" }) as Promise<number>,
    ]);
    console.log(`${TAG} chain ${dep.chainId} mine ${dep.mine} vault ${dep.vault}`);
    console.log(`${TAG} operator ${operator} guardian ${params.treasury}`);
    console.log(`${TAG} halted=${halted} paused=${paused}${paused ? ` (since ${new Date(Number(pausedAt) * 1000).toISOString()}, grace ends ${new Date((Number(pausedAt) + params.pauseGraceSeconds) * 1000).toISOString()})` : ""}`);
    console.log(`${TAG} now ${new Date(now * 1000).toISOString()}${now < dep.genesis ? ` (genesis in ${dep.genesis - now}s)` : ""} round ${cur} closes in ${clock.secondsToClose}s; closedRounds=${closed}${clock.inClaimWindow ? `; claim window for round ${cur - 1} open ${clock.claimOpenUntil - now}s` : ""}`);
    console.log(`${TAG} totalHash=${formatUnits(totalHash, 18)} rigs=${rigCount}`);
    for (let s = 0; s < dep.stocks.length; s++) {
      const pot = await read<bigint>("pot", [current, s]);
      const nextPot = await read<bigint>("pot", [current + 1n, s]);
      // Scheduled total from the next round on: scan in batches until a whole batch is empty (or 720 rounds).
      let scheduledTotal = 0n;
      let lastScheduled = -1;
      for (let from = cur + 1; from <= cur + MAX_FUND_ROUNDS; from += SCAN_BATCH) {
        const batch = await Promise.all(Array.from({ length: SCAN_BATCH }, (_, i) => read<bigint>("scheduled", [s, BigInt(from + i)])));
        let any = false;
        batch.forEach((v, i) => { if (v > 0n) { any = true; scheduledTotal += v; lastScheduled = from + i; } });
        if (!any) break;
      }
      const [bal, required] = await Promise.all([
        pub.readContract({ abi: erc20Abi, address: dep.stocks[s], functionName: "balanceOf", args: [dep.vault] }) as Promise<bigint>,
        readVault<bigint>("requiredOf", [BigInt(s)]),
      ]);
      console.log(`${TAG} ${dep.symbols[s].padEnd(6)} pot r${cur}=${formatUnits(pot, decimals[s])} r${cur + 1}=${formatUnits(nextPot, decimals[s])} scheduled=${formatUnits(scheduledTotal, decimals[s])}${lastScheduled >= 0 ? ` (through round ${lastScheduled})` : ""} vault=${formatUnits(bal, decimals[s])} requiredOf=${formatUnits(required, decimals[s])}`);
    }
    console.log(`${TAG} vault USDG reserve ${formatUnits(reserve, udec)}`);
    return;
  }

  if (cmd === "halt") {
    requireKey(operator, "operator", "OPERATOR_KEY");
    if (halted) throw new Error("already halted");
    console.log(`${TAG} HALT: the mine stops for good. No round closes after this (round ${cur} will never pay out); stakes come back in full via emergencyWithdraw; unclaimed pots and everything scheduled return to the operator through 'rounds-admin rescue'; claimed fragments stay redeemable. IRREVERSIBLE.`);
    await broadcast("halt()", dep.mine, roundMineAbi, "halt");
    return;
  }

  if (cmd === "unschedule") {
    requireKey(operator, "operator", "OPERATOR_KEY");
    const [s] = resolveStocks(arg("--stock"), dep.symbols);
    const fromArg = arg("--from-round");
    if (!fromArg) throw new Error("--from-round <N> is required");
    const from = Number(fromArg);
    if (now >= dep.genesis && from <= cur) throw new Error(`round ${from} has started (current round ${cur}); only rounds > ${cur} can be unscheduled`);
    const { result } = await broadcast(`unschedule(${s} ${dep.symbols[s]}, fromRound=${from})`, dep.mine, roundMineAbi, "unschedule", [s, BigInt(from)]);
    console.log(`${TAG} unschedule ${dep.symbols[s]} from round ${from}: ${fmt(s, result as bigint)} ${yes ? "moved" : "would move"} from the vault to the operator ${operator}`);
    return;
  }

  if (cmd === "rescue") {
    requireKey(operator, "operator", "OPERATOR_KEY");
    if (!halted) throw new Error("mine is not halted; rescue only works after 'rounds-admin halt'");
    const reserve = await readVault<bigint>("reserve");
    const excess: bigint[] = [];
    for (let s = 0; s < dep.stocks.length; s++) {
      const [bal, required] = await Promise.all([
        pub.readContract({ abi: erc20Abi, address: dep.stocks[s], functionName: "balanceOf", args: [dep.vault] }) as Promise<bigint>,
        readVault<bigint>("requiredOf", [BigInt(s)]),
      ]);
      excess.push(bal > required ? bal - required : 0n);
      console.log(`${TAG} ${dep.symbols[s].padEnd(6)} vault=${formatUnits(bal, decimals[s])} requiredOf=${formatUnits(required, decimals[s])} → rescue ${formatUnits(excess[s], decimals[s])}`);
    }
    console.log(`${TAG} RESCUE: moves the stock above requiredOf plus the whole USDG reserve (${formatUnits(reserve, 6)}) to the operator ${operator}. A stock whose hook refuses the operator stays and can be retried.`);
    const { logs } = await broadcast("rescue()", dep.vault, roundVaultAbi, "rescue");
    if (!yes) return;
    for (const log of logs) {
      try {
        const ev = decodeEventLog({ abi: roundVaultAbi, data: log.data, topics: log.topics });
        if (ev.eventName !== "Rescued") continue;
        const { tokens, usdc } = ev.args as unknown as { tokens: readonly bigint[]; usdc: bigint };
        for (let s = 0; s < dep.stocks.length; s++) {
          const moved = tokens[s] ?? 0n;
          const stayed = excess[s] - moved;
          console.log(`${TAG} ${dep.symbols[s].padEnd(6)} moved ${formatUnits(moved, decimals[s])}${stayed > 0n ? ` STAYED ${formatUnits(stayed, decimals[s])} (hook refused the operator; retry rescue later)` : ""}`);
        }
        console.log(`${TAG} USDG moved ${formatUnits(usdc, 6)}`);
      } catch { /* not a vault event */ }
    }
    return;
  }

  if (cmd === "pause" || cmd === "unpause") {
    requireKey(params.treasury, "guardian", "GUARDIAN_KEY");
    if (halted) throw new Error("mine is halted; pause/unpause are impossible");
    if (cmd === "pause") {
      if (paused) throw new Error("already paused");
      console.log(`${TAG} PAUSE: players cannot act; rounds still close on the clock. If the pause outlives ${params.pauseGraceSeconds}s any player can emergencyWithdraw, which HALTS the mine for good.`);
    } else {
      if (!paused) throw new Error("not paused");
      console.log(`${TAG} UNPAUSE: players can act again.`);
    }
    await broadcast(`${cmd}()`, dep.mine, roundMineAbi, cmd);
    return;
  }

  throw new Error("usage: rounds-admin status | halt | unschedule --stock X --from-round N | rescue | pause | unpause  [--yes]");
}

main().catch((e: Error) => { console.error(`${TAG} failed:`, e.message ?? e); process.exit(1); });
