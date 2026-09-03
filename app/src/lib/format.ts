/** Formatting helpers shared by the UI. Numbers are bigint in contract units unless noted. */

const WAD = 10n ** 18n;

/** Format a 1e18-scaled hash as "7.00M H"-style: three significant figures with a K/M/B suffix. */
export function formatHash(hashWad: bigint): string {
  const whole = Number(hashWad / WAD) + Number(hashWad % WAD) / 1e18;
  return `${compact(whole)} H`;
}

export function compact(n: number): string {
  const abs = Math.abs(n);
  const units: [number, string][] = [[1e9, "B"], [1e6, "M"], [1e3, "k"]];
  for (const [div, suffix] of units) {
    if (abs >= div) return `${(n / div).toFixed(2)}${suffix}`;
  }
  return n.toFixed(2);
}

/** Every wall-clock figure in the UI is an estimate; format seconds as "1h 18m" / "2d 4h" / "8 min". */
export function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "–";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m} min`;
}
