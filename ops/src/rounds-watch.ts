/**
 * Round watcher (docs/13): logs the round mine's state every tick and forwards warn/page alerts to
 * ALERT_WEBHOOK_URL (Slack or Discord incoming webhook) when set.
 *
 *   ALERT_WEBHOOK_URL=https://… pnpm --filter @stock-miner/ops rounds-watch [--interval 60] [--once]
 *
 * Per tick: round, seconds to close, pot per stock for the current round, totalHash, rig count.
 * Warns when the next round's pot is zero for every stock ("nothing scheduled"), when a stock's
 * schedule runs out within 6 rounds, when the vault USDG reserve is below 1,000, and when
 * totalHash == 0 for over an hour. Pages when the mine is paused or halted.
 */
import { formatUnits } from "viem";
import { createAlert } from "./lib/alert.js";
import { loadRoundsDeployment, roundClock, roundMineAbi, roundVaultAbi, scheduleRunsOutIn } from "./lib/rounds.js";
import { arg, clients, erc20Abi, hasFlag } from "./lib/season.js";

const interval = Number(arg("--interval", "60")) * 1000;
const once = hasFlag("--once");
const LOOKAHEAD = 6;
const alert = createAlert("rounds-watch");
let idleSince: number | null = null;

async function tick() {
  const dep = loadRoundsDeployment();
  const { pub } = clients();
  const mine = { abi: roundMineAbi, address: dep.mine } as const;
  const [block, currentRound, closedRounds, totalHash, rigCount, paused, halted, reserve, udec] = await Promise.all([
    pub.getBlock(),
    pub.readContract({ ...mine, functionName: "currentRound" }) as Promise<bigint>,
    pub.readContract({ ...mine, functionName: "closedRounds" }) as Promise<bigint>,
    pub.readContract({ ...mine, functionName: "totalHash" }) as Promise<bigint>,
    pub.readContract({ ...mine, functionName: "rigCount" }) as Promise<bigint>,
    pub.readContract({ ...mine, functionName: "paused" }) as Promise<boolean>,
    pub.readContract({ ...mine, functionName: "halted" }) as Promise<boolean>,
    pub.readContract({ abi: roundVaultAbi, address: dep.vault, functionName: "reserve" }) as Promise<bigint>,
    pub.readContract({ abi: erc20Abi, address: dep.usdc, functionName: "decimals" }) as Promise<number>,
  ]);
  const now = Number(block.timestamp);
  const r = Number(currentRound);
  const clock = roundClock(dep.genesis, dep.roundSeconds, dep.claimSeconds, now);

  if (halted) alert("page", "mine is HALTED");
  if (paused) alert("page", "mine is PAUSED");
  const behind = now >= dep.genesis && !halted ? r - Number(closedRounds) : 0;
  if (behind > 1) alert("warn", `mine is ${behind} rounds behind (closedRounds=${closedRounds}, currentRound=${r}); players' actions revert with NotCaughtUp until the keeper pokes`);

  const pots: string[] = [];
  let nextPotAllZero = true;
  for (let s = 0; s < dep.stocks.length; s++) {
    const decimals = (await pub.readContract({ abi: erc20Abi, address: dep.stocks[s], functionName: "decimals" })) as number;
    const pot = (await pub.readContract({ ...mine, functionName: "pot", args: [BigInt(r), s] })) as bigint;
    const nextPot = (await pub.readContract({ ...mine, functionName: "pot", args: [BigInt(r + 1), s] })) as bigint;
    if (nextPot > 0n) nextPotAllZero = false;
    pots.push(`${dep.symbols[s]}=${formatUnits(pot, decimals)}`);
    const ahead: bigint[] = [];
    for (let k = 1; k <= LOOKAHEAD; k++) ahead.push((await pub.readContract({ ...mine, functionName: "scheduled", args: [s, BigInt(r + k)] })) as bigint);
    const runsOut = scheduleRunsOutIn(ahead);
    if (runsOut !== null && !halted) alert("warn", `${dep.symbols[s]}: nothing scheduled from round ${r + runsOut} (in ${runsOut} round${runsOut === 1 ? "" : "s"})`);
  }
  if (nextPotAllZero && !halted) alert("warn", `nothing scheduled: round ${r + 1} pot is zero for every stock`);

  if (reserve < 1_000n * 10n ** BigInt(udec)) alert("warn", `USDG reserve below 1,000 (${formatUnits(reserve, udec)})`);

  if (now >= dep.genesis && !halted) {
    if (totalHash === 0n) {
      idleSince ??= Date.now();
      if (Date.now() - idleSince > 3_600_000) alert("warn", "totalHash == 0 for over an hour");
    } else {
      idleSince = null;
    }
  }
  const pre = now < dep.genesis ? ` (genesis in ${dep.genesis - now}s)` : "";
  alert("info", `round ${r} closes in ${clock.secondsToClose}s${pre} closed=${closedRounds}${clock.inClaimWindow ? ` claim r${r - 1} open ${clock.claimOpenUntil - now}s` : ""} pot[${pots.join(" ")}] hash=${totalHash / 10n ** 18n} rigs=${rigCount} reserve=${formatUnits(reserve, udec)}`);
}

(async () => {
  for (;;) {
    try {
      await tick();
    } catch (e) {
      alert("warn", `watcher error: ${(e as Error).message}`);
    }
    if (once) break;
    await new Promise((r) => setTimeout(r, interval));
  }
})();
