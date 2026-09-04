/**
 * Keeper (docs/06 §6): calls poke() when a shift boundary has passed or the stored state is stale, so
 * no player pays for a long catch-up loop, and once more when the mine is logically closed but the
 * close is not yet persisted (audit B2). Correctness never depends on it. Stops after close.
 *
 *   KEEPER_KEY=0x… RPC_URL=… pnpm --filter @stock-miner/ops keeper [--interval 30]
 */
import { clients, loadDeployment, mineAbi, readState } from "./lib/season.js";
import { keeperDecision } from "./lib/keeper-logic.js";

const interval = Number(process.argv.includes("--interval") ? process.argv[process.argv.indexOf("--interval") + 1] : 30) * 1000;
const once = process.argv.includes("--once");

async function tick(): Promise<boolean> {
  const { mine } = loadDeployment();
  const { pub, wallet } = clients();
  const s = await readState(mine);
  const progress = (await pub.readContract({ abi: mineAbi, address: mine, functionName: "progress" })) as { shift: number };
  const staleSec = Number(s.now - s.lastX / 10n ** 18n);
  const action = keeperDecision({ phase: s.phase, storedShift: s.shift, simulatedShift: Number(progress.shift), storedCloseX: s.closeX, staleSec, idle: s.eta.idle });
  if (action === "stop") {
    console.log(`[keeper] mine closed (phase ${s.phase}); stopping`);
    return false;
  }
  if (action === "wait") {
    console.log(s.phase === 2 ? `[keeper] ok shift=${s.shift} next shift in ~${s.eta.toShiftEnd}s (stale ${staleSec}s)` : `[keeper] phase ${s.phase}; waiting`);
    return true;
  }
  const hash = await wallet.writeContract({ abi: mineAbi, address: mine, functionName: "poke" });
  const rcpt = await pub.waitForTransactionReceipt({ hash });
  if (rcpt.status !== "success") throw new Error(`poke ${hash} reverted`);
  console.log(`[keeper] poke ${hash.slice(0, 10)} gas=${rcpt.gasUsed} shift=${s.shift}->${progress.shift} stale=${staleSec}s${action === "poke-and-stop" ? " (close persisted; stopping)" : ""}`);
  return action !== "poke-and-stop";
}

(async () => {
  for (;;) {
    let go = true;
    try {
      go = await tick();
    } catch (e) {
      console.error("[keeper] error", (e as Error).message);
    }
    if (!go || once) break;
    await new Promise((r) => setTimeout(r, interval));
  }
})();
