/**
 * Watcher (docs/06 §6): logs the conditions ops must react to and forwards warn/page alerts to
 * ALERT_WEBHOOK_URL (Slack or Discord incoming webhook) when set.
 *
 *   ALERT_WEBHOOK_URL=https://… pnpm --filter @stock-miner/ops watch [--interval 60] [--planned-seconds 10800]
 */
import { clients, loadDeployment, mineAbi, readState, vaultAbi } from "./lib/season.js";

const interval = Number(process.argv.includes("--interval") ? process.argv[process.argv.indexOf("--interval") + 1] : 60) * 1000;
const planned = Number(process.argv.includes("--planned-seconds") ? process.argv[process.argv.indexOf("--planned-seconds") + 1] : 86_400);
const once = process.argv.includes("--once");

type Level = "info" | "warn" | "page";
const RANK: Record<Level, number> = { info: 0, warn: 1, page: 2 };
const webhook = process.env.ALERT_WEBHOOK_URL;
const minLevel = (process.env.ALERT_MIN_LEVEL ?? "warn") as Level;
const repeatMs = Number(process.env.ALERT_REPEAT_SECONDS ?? 900) * 1000;
const lastSent = new Map<string, number>();

/**
 * Logs every alert; forwards those at or above ALERT_MIN_LEVEL (default warn) to ALERT_WEBHOOK_URL as
 * JSON `{text, content}` (Slack incoming webhooks read `text`, Discord reads `content`). An identical
 * message is not resent within ALERT_REPEAT_SECONDS (default 900) so a standing condition pages once
 * per window instead of every tick.
 */
function alert(level: Level, msg: string) {
  const stamp = new Date().toISOString();
  console.log(`[watch] ${stamp} ${level.toUpperCase()} ${msg}`);
  if (!webhook || RANK[level] < (RANK[minLevel] ?? 1)) return;
  const now = Date.now();
  const prev = lastSent.get(msg);
  if (prev !== undefined && now - prev < repeatMs) return;
  lastSent.set(msg, now);
  const text = `[stock-miner watch] ${level.toUpperCase()} ${msg}`;
  fetch(webhook, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, content: text }) })
    .then((r) => { if (!r.ok) console.error(`[watch] webhook responded ${r.status}`); })
    .catch((e: Error) => console.error(`[watch] webhook error: ${e.message}`));
}

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
