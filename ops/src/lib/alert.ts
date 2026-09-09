/**
 * Alert helper shared by the watchers and keepers. Logs every alert; forwards those at or above
 * ALERT_MIN_LEVEL (default warn) to ALERT_WEBHOOK_URL (Slack or Discord incoming webhook) as JSON
 * `{text, content}` (Slack reads `text`, Discord reads `content`). An identical message is not resent
 * within ALERT_REPEAT_SECONDS (default 900) so a standing condition pages once per window instead of
 * every tick.
 */
export type Level = "info" | "warn" | "page";
const RANK: Record<Level, number> = { info: 0, warn: 1, page: 2 };

export type Alert = (level: Level, msg: string) => void;

/**
 * @param tag    console prefix, e.g. "watch" → `[watch] <stamp> WARN …`
 * @param label  webhook prefix, e.g. "stock-miner watch" → `[stock-miner watch] WARN …`
 */
export function createAlert(tag: string, label = `stock-miner ${tag}`): Alert {
  const webhook = process.env.ALERT_WEBHOOK_URL;
  const minLevel = (process.env.ALERT_MIN_LEVEL ?? "warn") as Level;
  const repeatMs = Number(process.env.ALERT_REPEAT_SECONDS ?? 900) * 1000;
  const lastSent = new Map<string, number>();
  return (level, msg) => {
    const stamp = new Date().toISOString();
    console.log(`[${tag}] ${stamp} ${level.toUpperCase()} ${msg}`);
    if (!webhook || RANK[level] < (RANK[minLevel] ?? 1)) return;
    const now = Date.now();
    const prev = lastSent.get(msg);
    if (prev !== undefined && now - prev < repeatMs) return;
    lastSent.set(msg, now);
    const text = `[${label}] ${level.toUpperCase()} ${msg}`;
    fetch(webhook, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, content: text }) })
      .then((r) => { if (!r.ok) console.error(`[${tag}] webhook responded ${r.status}`); })
      .catch((e: Error) => console.error(`[${tag}] webhook error: ${e.message}`));
  };
}
