/**
 * Shapes for the rounds mine (docs/13-ROUNDS.md) and the pure derivations the UI shows: round
 * countdowns, the claim window, work share and the projected cut of the current pot. Everything in
 * here is plain arithmetic over what the multicall returned, so it is unit-tested without a chain.
 */
import type { Address } from "viem";

export const STOCKS = 4;
export const WAD = 10n ** 18n;

export interface RoundParamsView {
  rig: Address;
  stocks: Address[];
  treasury: Address;
  genesis: bigint;
  roundSeconds: number;
  claimSeconds: number;
  fragPerToken: bigint;
  minStakeWeight: bigint;
  activationFeeBps: number;
  exitFeeBps: number;
  gpuMultBps: number[];
  gpuCostBps: number[];
  coolCostBps: number[];
  heatPerOc: number[];
  coolPerRound: number[];
  heatMax: number;
  ocCostBps: number;
  ocBoostBps: number;
  maxActiveOc: number;
  ocRoundSpan: number;
  pauseGraceSeconds: number;
}

export interface RoundSnapshot {
  params: RoundParamsView;
  symbols: string[];
  /** currentRound() at fetch. */
  round: number;
  closedRounds: number;
  totalHash: bigint;
  halted: boolean;
  paused: boolean;
  /** pot(round, s): scheduled plus the rollover known so far. Stock-token wei. */
  pot: bigint[];
  /** pot(round - 1, s) and claimedOf(round - 1, s); zeros when round is 0. */
  prevPot: bigint[];
  prevClaimed: bigint[];
  /** roundWork(round) simulated to the fetch time, and roundWork(round - 1). */
  roundWork: bigint;
  prevRoundWork: bigint;
  /** scheduled(s, round + 1). */
  nextScheduled: bigint[];
  fetchedAt: number; // ms
  chainTime: bigint; // seconds, block timestamp at fetch
  chainOffset: bigint; // chainTime - wall clock at fetch
}

export interface RoundRig {
  id: bigint;
  owner: Address;
  amount: bigint;
  gpuTier: number;
  coolingTier: number;
  heat: number;
  activeOc: number;
  ocExpiryRound: number;
  lastRound: number;
  claimedPlusOne: number;
  baseHash: bigint;
  ocHash: bigint;
  inactive: boolean;
  /** rigHash(id): live hash including overclocks (0 when inactive). */
  hash: bigint;
  /** rigWork(id, round) simulated to the fetch time, and rigWork(id, round - 1). */
  work: bigint;
  prevWork: bigint;
  /** claimable(id): whole fragments per stock for the latest closed round (zeros outside the window). */
  claimable: bigint[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toRoundParams(raw: any): RoundParamsView {
  return {
    rig: raw.rig as Address,
    stocks: raw.stocks as Address[],
    treasury: raw.treasury as Address,
    genesis: BigInt(raw.genesis),
    roundSeconds: Number(raw.roundSeconds),
    claimSeconds: Number(raw.claimSeconds),
    fragPerToken: BigInt(raw.fragPerToken),
    minStakeWeight: BigInt(raw.minStakeWeight),
    activationFeeBps: Number(raw.activationFeeBps),
    exitFeeBps: Number(raw.exitFeeBps),
    gpuMultBps: (raw.gpuMultBps as number[]).map(Number),
    gpuCostBps: (raw.gpuCostBps as number[]).map(Number),
    coolCostBps: (raw.coolCostBps as number[]).map(Number),
    heatPerOc: (raw.heatPerOc as number[]).map(Number),
    coolPerRound: (raw.coolPerRound as number[]).map(Number),
    heatMax: Number(raw.heatMax),
    ocCostBps: Number(raw.ocCostBps),
    ocBoostBps: Number(raw.ocBoostBps),
    maxActiveOc: Number(raw.maxActiveOc),
    ocRoundSpan: Number(raw.ocRoundSpan),
    pauseGraceSeconds: Number(raw.pauseGraceSeconds),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toRoundRig(id: bigint, raw: any, hash: bigint, work: bigint, prevWork: bigint, claimable: bigint[]): RoundRig {
  return {
    id,
    owner: raw.owner as Address,
    amount: BigInt(raw.amount),
    gpuTier: Number(raw.gpuTier),
    coolingTier: Number(raw.coolingTier),
    heat: Number(raw.heat),
    activeOc: Number(raw.activeOc),
    ocExpiryRound: Number(raw.ocExpiryRound),
    lastRound: Number(raw.lastRound),
    claimedPlusOne: Number(raw.claimedPlusOne),
    baseHash: BigInt(raw.baseHash),
    ocHash: BigInt(raw.ocHash),
    inactive: Boolean(raw.inactive),
    hash,
    work,
    prevWork,
    claimable,
  };
}

// ── time ────────────────────────────────────────────────────────────────────

/** Timestamp at which round `r` closes: genesis + (r + 1) × roundSeconds. */
export function roundEndAt(genesis: bigint, roundSeconds: number, r: number): bigint {
  return genesis + BigInt(r + 1) * BigInt(roundSeconds);
}

/** Round index at `now` (0 before genesis + roundSeconds, matching `currentRound()`). */
export function roundAt(genesis: bigint, roundSeconds: number, now: bigint): number {
  if (now <= genesis) return 0;
  return Number((now - genesis) / BigInt(roundSeconds));
}

/** Seconds until round `r` closes at `now`; never negative. */
export function secondsToRoundEnd(genesis: bigint, roundSeconds: number, r: number, now: bigint): number {
  const left = roundEndAt(genesis, roundSeconds, r) - now;
  return left > 0n ? Number(left) : 0;
}

export interface ClaimWindow {
  /** The round whose pot is claimable (the latest closed round), or null before round 0 closes. */
  round: number | null;
  /** True while `now` is inside [close, close + claimSeconds). */
  open: boolean;
  /** Timestamp at which the window shuts. */
  deadline: bigint;
  /** Seconds left in the window; 0 when shut. */
  secondsLeft: number;
}

/**
 * The claim window for the latest closed round at `now`. Only the latest closed round is ever
 * claimable (docs/13 §2): after `claimSeconds` its remainder has rolled into the pot of the round
 * that is running now. Note a halted mine never closes another round: callers pass `halted` to
 * shut the window.
 */
export function claimWindow(genesis: bigint, roundSeconds: number, claimSeconds: number, now: bigint, halted = false): ClaimWindow {
  const cur = roundAt(genesis, roundSeconds, now);
  if (cur === 0 || halted) return { round: null, open: false, deadline: 0n, secondsLeft: 0 };
  const r = cur - 1;
  const deadline = roundEndAt(genesis, roundSeconds, r) + BigInt(claimSeconds);
  const left = deadline - now;
  return { round: r, open: left > 0n, deadline, secondsLeft: left > 0n ? Number(left) : 0 };
}

// ── share and cut ───────────────────────────────────────────────────────────

/** Σ my work / round work as a fraction in [0, 1]; 0 when the round has no work. */
export function shareOf(myWorks: readonly bigint[], roundWork: bigint): number {
  if (roundWork <= 0n) return 0;
  const mine = myWorks.reduce((a, b) => a + b, 0n);
  if (mine <= 0n) return 0;
  if (mine >= roundWork) return 1;
  return Number((mine * 1_000_000n) / roundWork) / 1_000_000;
}

/**
 * Whole fragments of each stock this share of the pot would pay, using the contract's rounding
 * (`pot × work / roundWork × fragPerToken / 1e18`, dust stays in the pot).
 */
export function projectedCut(pots: readonly bigint[], myWorks: readonly bigint[], roundWork: bigint, fragPerToken: bigint): bigint[] {
  const mine = myWorks.reduce((a, b) => a + b, 0n);
  if (roundWork <= 0n || mine <= 0n) return pots.map(() => 0n);
  return pots.map((pot) => (((pot * mine) / roundWork) * fragPerToken) / WAD);
}

/** The rollover part of each pot: what was left unclaimed in the previous round. */
export function rolloverOf(prevPot: readonly bigint[], prevClaimed: readonly bigint[]): bigint[] {
  return prevPot.map((p, s) => {
    const left = p - (prevClaimed[s] ?? 0n);
    return left > 0n ? left : 0n;
  });
}

/** Σ claimable(id) over my rigs, per stock. */
export function sumClaimable(rigs: readonly { claimable: readonly bigint[] }[], stocks = STOCKS): bigint[] {
  const out = Array.from({ length: stocks }, () => 0n);
  for (const r of rigs) r.claimable.forEach((f, s) => { if (s < stocks) out[s] += f; });
  return out;
}

/** Whole fragments → tokens as a display number. */
export function fragmentsToTokens(frags: bigint, fragPerToken: bigint): number {
  return Number(frags) / Number(fragPerToken);
}

/** "mm:ss" for the countdowns (hours fold into minutes: 1h = "60:00"). */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** Parse a user amount into whole fragments: "0.5" tokens → 500,000 fragments; fragments are integers. */
export function parseAmount(str: string, unit: "frag" | "token", fragPerToken: bigint): bigint {
  const s = str.trim();
  if (!s || !/^\d*\.?\d*$/.test(s)) return 0n;
  if (unit === "frag") return BigInt(s.split(".")[0] || "0");
  const [w, f = ""] = s.split(".");
  const digits = fragPerToken.toString().length - 1; // 1_000_000 → 6
  const frac = (f + "0".repeat(digits)).slice(0, digits);
  return BigInt(w || "0") * fragPerToken + BigInt(frac || "0");
}

// ── costs (the contract's gpuCost/coolingCost/overclockCost, computed locally so a maxed tier does not revert the multicall) ──

export function gpuCostOf(p: RoundParamsView, rig: { amount: bigint; gpuTier: number }): bigint {
  return rig.gpuTier < p.gpuCostBps.length ? (rig.amount * BigInt(p.gpuCostBps[rig.gpuTier])) / 10_000n : 0n;
}
export function coolingCostOf(p: RoundParamsView, rig: { amount: bigint; coolingTier: number }): bigint {
  return rig.coolingTier < p.coolCostBps.length ? (rig.amount * BigInt(p.coolCostBps[rig.coolingTier])) / 10_000n : 0n;
}
export function overclockCostOf(p: RoundParamsView, rig: { amount: bigint }): bigint {
  return (rig.amount * BigInt(p.ocCostBps)) / 10_000n;
}
