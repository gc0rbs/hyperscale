/**
 * Watcher (docs/06 §6): logs the conditions ops must react to and forwards warn/page alerts to
 * ALERT_WEBHOOK_URL (Slack or Discord incoming webhook) when set.
 *
 *   ALERT_WEBHOOK_URL=https://… pnpm --filter @stock-miner/ops watch [--interval 60] [--planned-seconds 10800]
 */
import { createAlert } from "./lib/alert.js";
import { clients, loadDeployment, mineAbi, readState, vaultAbi } from "./lib/season.js";

const interval = Number(process.argv.includes("--interval") ? process.argv[process.argv.indexOf("--interval") + 1] : 60) * 1000;
const planned = Number(process.argv.includes("--planned-seconds") ? process.argv[process.argv.indexOf("--planned-seconds") + 1] : 86_400);
const once = process.argv.includes("--once");

// Alert levels, webhook forwarding (ALERT_WEBHOOK_URL, ALERT_MIN_LEVEL, ALERT_REPEAT_SECONDS): lib/alert.ts.
const alert = createAlert("watch");

let idleSince: number | null = null;

async function tick() {
  const { mine, vault } = loadDeployment();
  const { pub } = clients();
  const s = await readState(mine);
  const paused = (await pub.readContract({ abi: mineAbi, address: mine, functionName: "paused" })) as boolean;
  const cancelled = (await pub.readContract({ abi: mineAbi, address: mine, functionName: "cancelled" })) as boolean;
  if (paused) alert("page", "mine is PAUSED");
  if (cancelled) alert("page", "season CANCELLED");
  if (s.phase === 2) {
    if (s.eta.idle) {
      idleSince ??= Date.now();
      if (Date.now() - idleSince > 3_600_000) alert("warn", "totalHash == 0 for over an hour");
    } else {
      idleSince = null;
      const toClose = Number(s.eta.toClose);
      if (toClose > 5 * planned) alert("warn", `est. ${Math.round(toClose / 3600)}h to close, > 5x planned`);
      alert("info", `shift ${s.shift} hash=${s.totalHash / 10n ** 18n} next shift ~${s.eta.toShiftEnd}s close ~${Math.round(toClose / 3600)}h`);
    }
  } else if (s.phase === 3) {
    const reserve = (await pub.readContract({ abi: vaultAbi, address: vault, functionName: "reserve" })) as bigint;
    alert("info", `closed; vault USDC reserve ${reserve / 10n ** 6n}`);
    if (reserve < 1_000n * 10n ** 6n) alert("warn", "USDC reserve below 1,000");
  } else {
    alert("info", `phase ${s.phase}`);
  }
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
