/**
 * Guardian actions (FR-S6, docs/RUNBOOK.md "Pause and cancel"). The guardian is the season's
 * treasury address; it can only pause and unpause. If a pause outlives `pauseGraceSeconds`, any
 * player can call `emergencyWithdraw`, which returns their deposit and, if the season was still open,
 * cancels it permanently (unclaimed fragments are forfeited, the vault becomes sweepable).
 *
 *   GUARDIAN_KEY=0x… pnpm --filter @stock-miner/ops guardian pause
 *   GUARDIAN_KEY=0x… pnpm --filter @stock-miner/ops guardian unpause
 *   pnpm --filter @stock-miner/ops guardian status
 */
import { clients, loadDeployment, mineAbi, PHASES } from "./lib/season.js";

async function main() {
  const dep = loadDeployment();
  const { pub, wallet, account } = clients("GUARDIAN_KEY");
  const cmd = process.argv[2];
  const params = (await pub.readContract({ abi: mineAbi, address: dep.mine, functionName: "params" })) as { treasury: string; pauseGraceSeconds: number };
  const paused = (await pub.readContract({ abi: mineAbi, address: dep.mine, functionName: "paused" })) as boolean;
  const pausedAt = (await pub.readContract({ abi: mineAbi, address: dep.mine, functionName: "pausedAt" })) as bigint;
  const cancelled = (await pub.readContract({ abi: mineAbi, address: dep.mine, functionName: "cancelled" })) as boolean;
  const phase = (await pub.readContract({ abi: mineAbi, address: dep.mine, functionName: "phase" })) as number;
  const now = (await pub.getBlock()).timestamp;
  const graceEnds = Number(pausedAt) + params.pauseGraceSeconds;

  if (cmd === "status" || !cmd) {
    console.log(`[guardian] phase ${PHASES[phase]} paused=${paused} cancelled=${cancelled} guardian=${params.treasury}`);
    if (paused) console.log(`[guardian] paused at ${new Date(Number(pausedAt) * 1000).toISOString()}; grace ends ${new Date(graceEnds * 1000).toISOString()} (${Number(now) > graceEnds ? "ELAPSED: emergencyWithdraw is live" : `${graceEnds - Number(now)}s left`})`);
    return;
  }
  if (account.address.toLowerCase() !== params.treasury.toLowerCase()) {
    throw new Error(`GUARDIAN_KEY is ${account.address}, the season's guardian is ${params.treasury}`);
  }
  if (cmd === "pause") {
    if (paused) throw new Error("already paused");
    const hash = await wallet.writeContract({ abi: mineAbi, address: dep.mine, functionName: "pause" });
    await pub.waitForTransactionReceipt({ hash });
    console.log(`[guardian] PAUSED. Players cannot act; work still accrues by the clock. Unpause within ${params.pauseGraceSeconds}s or any player can cancel the season.`);
    return;
  }
  if (cmd === "unpause") {
    if (!paused) throw new Error("not paused");
    if (cancelled) throw new Error("season is cancelled; unpause is impossible");
    const hash = await wallet.writeContract({ abi: mineAbi, address: dep.mine, functionName: "unpause" });
    await pub.waitForTransactionReceipt({ hash });
    console.log("[guardian] unpaused");
    return;
  }
  throw new Error("usage: guardian pause | unpause | status");
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
