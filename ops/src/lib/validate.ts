/**
 * Mirror of `SeasonFactory._validate` (contracts/src/SeasonFactory.sol), so `plan` fails before a
 * transaction does, with the same reason strings. Keep the two in sync; the Foundry test suite
 * `Gating.t.sol` covers the contract side, `ops/test/validate.test.ts` this side.
 */
export interface SeasonParamsJson {
  rig: string;
  lpToken: string;
  lpWeightPerToken: string;
  openTime: number;
  maxDurationSeconds: number;
  blocks: number;
  shiftsPerBlock: number;
  stocks: string[];
  poolTokens: string[];
  difficulty: string[];
  fragPerToken: string;
  minStakeWeight: string;
  activationFeeBps: number;
  earlyExitFeeBps: number;
  gpuMultBps: number[];
  gpuCostBps: number[];
  coolCostBps: number[];
  heatPerOc: number[];
  coolPerShift: number[];
  heatMax: number;
  ocCostBps: number;
  ocBoostBps: number;
  maxActiveOc: number;
  ocShiftSpan: number;
  redemptionDays: number;
  cashOutFeeBps: number;
  pauseGraceSeconds: number;
  treasury: string;
}

const ZERO = "0x0000000000000000000000000000000000000000";
const UINT128_MAX = 2n ** 128n - 1n;

/** Returns the factory's `InvalidParams` reasons that would fire, in factory order; empty = valid. */
export function validateSeasonParams(p: SeasonParamsJson, now: number): string[] {
  const errs: string[] = [];
  const isZero = (a: string) => a.toLowerCase() === ZERO;
  if (p.blocks !== 4) errs.push("blocks must be 4");
  if (p.stocks.length !== 4 || p.poolTokens.length !== 4 || p.difficulty.length !== 4) errs.push("array lengths");
  if (p.shiftsPerBlock === 0 || p.shiftsPerBlock > 64) errs.push("shiftsPerBlock");
  const fpt = BigInt(p.fragPerToken);
  if (fpt === 0n) errs.push("fragPerToken");
  if (p.gpuMultBps.length !== 6 || p.gpuMultBps[0] !== 10_000) errs.push("gpuMultBps[0]");
  for (let i = 1; i < p.gpuMultBps.length; i++) {
    if (p.gpuMultBps[i] <= p.gpuMultBps[i - 1]) errs.push("gpuMultBps increasing");
  }
  if (p.ocBoostBps * p.maxActiveOc > 30_000) errs.push("ocBoost*maxActiveOc");
  if (p.maxActiveOc === 0 || p.ocShiftSpan === 0) errs.push("overclock config");
  for (const h of p.heatPerOc) if (h > p.heatMax) errs.push("heatPerOc > heatMax");
  for (let b = 0; b < Math.min(4, p.difficulty.length); b++) {
    const d = BigInt(p.difficulty[b]);
    if (d === 0n || p.shiftsPerBlock === 0 || d % BigInt(p.shiftsPerBlock) !== 0n) errs.push("difficulty divisible by shiftsPerBlock");
    const pool = BigInt(p.poolTokens[b] ?? "0");
    if (pool === 0n || isZero(p.stocks[b] ?? ZERO)) errs.push("pool");
    if (fpt > 0n && pool > UINT128_MAX / fpt) errs.push("pool too large");
    // SeasonMine constructor: fragment-wei per unit of work must be non-zero
    if (fpt > 0n && d > 0n && (pool * fpt * 10n ** 18n) / d === 0n) errs.push("rate");
  }
  if (BigInt(p.minStakeWeight) === 0n) errs.push("minStakeWeight");
  if (isZero(p.lpToken) !== (BigInt(p.lpWeightPerToken) === 0n)) errs.push("lp config");
  if (p.maxDurationSeconds < 3600) errs.push("maxDuration >= 1 hour");
  if (p.openTime < now) errs.push("openTime in the past");
  if (isZero(p.rig) || isZero(p.treasury)) errs.push("addresses");
  if (p.activationFeeBps > 1000 || p.earlyExitFeeBps > 2000 || p.cashOutFeeBps > 1000) errs.push("fees");
  if (p.redemptionDays === 0 || p.pauseGraceSeconds === 0) errs.push("windows");
  return [...new Set(errs)];
}
