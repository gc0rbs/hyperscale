/**
 * Keeper (docs/06 §6): calls poke() whenever the next shift boundary has passed, so no player pays
 * for a long catch-up loop. Correctness never depends on it. Runs until the mine closes.
 *
 *   KEEPER_KEY=0x… RPC_URL=… pnpm --filter @stock-miner/ops keeper [--interval 30]
 */
import { clients, loadDeployment, mineAbi, readState } from "./lib/season.js";

const interval = Number(process.argv.includes("--interval") ? process.argv[process.argv.indexOf("--interval") + 1] : 30) * 1000;
const once = process.argv.includes("--once");

async function tick(): Promise<boolean> {
  const { mine } = loadDeployment();
  const { pub, wallet } = clients();
  const s = await readState(mine);
  if (s.closeX !== 0n || s.phase === 3 || s.phase === 4) {
    console.log(`[keeper] mine closed (phase ${s.phase}); stopping`);
    return false;
  }
  if (s.phase !== 2) {
    console.log(`[keeper] phase ${s.phase}; waiting`);
    return true;
  }
  // The stored state is behind the clock by (now - lastX). Poke if a shift boundary is due or if
  // the stored view is more than a shift-fraction stale.
  const staleSec = Number(s.now - s.lastX / 10n ** 18n);
  const due = !s.eta.idle && (s.eta.toShiftEnd === 0n || staleSec >= Number(s.eta.toShiftEnd));
  if (due || staleSec > 600) {
    const hash = await wallet.writeContract({ abi: mineAbi, address: mine, functionName: "poke" });
    const rcpt = await pub.waitForTransactionReceipt({ hash });
    console.log(`[keeper] poke ${hash.slice(0, 10)} gas=${rcpt.gasUsed} shift=${s.shift} stale=${staleSec}s`);
  } else {
    console.log(`[keeper] ok shift=${s.shift} next shift in ~${s.eta.toShiftEnd}s (stale ${staleSec}s)`);
  }
  return true;
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
