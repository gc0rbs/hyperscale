/** Formatting helpers shared by the UI. Numbers are bigint in contract units unless noted. */

const WAD = 10n ** 18n;

/** Format a 1e18-scaled hash as "7.00M H"-style: three significant figures with a K/M/B suffix. */
export function formatHash(hashWad: bigint): string {
  const whole = Number(hashWad / WAD) + Number(hashWad % WAD) / 1e18;
  return `${compact(whole)} H`;
}

/**
 * Hash → throughput in the AI-compute fiction (docs/12 §7): one on-chain hash unit is one GFLOPS, so
 * 100k hash reads "100.00 TFLOPS" and 10M hash "10.00 PFLOPS". A display constant, not a contract change.
 */
export function formatThroughput(hashWad: bigint): string {
  const gflops = Number(hashWad / WAD) + Number(hashWad % WAD) / 1e18;
  return `${flops(gflops)}S`;
}

/** Hash-seconds → compute served, same scale ("12.40 PFLOP"). Work is hash-wad × seconds. */
export function formatCompute(workWad: bigint): string {
  const gflop = Number(workWad / WAD) + Number(workWad % WAD) / 1e18;
  return flops(gflop);
}

function flops(g: number): string {
  const units: [number, string][] = [[1e9, "EFLOP"], [1e6, "PFLOP"], [1e3, "TFLOP"]];
  for (const [div, u] of units) if (Math.abs(g) >= div) return `${(g / div).toFixed(2)} ${u}`;
  return `${g.toFixed(2)} GFLOP`;
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

export function formatRig(wei: bigint, digits = 0): string {
  const whole = Number(wei / WAD);
  return whole.toLocaleString("en-US", { maximumFractionDigits: digits });
}

export function formatInt(n: bigint | number): string {
  return Number(n).toLocaleString("en-US");
}

export function short(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
