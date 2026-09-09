import { describe, expect, it } from "vitest";
import { claimWindow, formatClock, gpuCostOf, parseAmount, projectedCut, rolloverOf, roundAt, roundEndAt, secondsToRoundEnd, shareOf, sumClaimable, WAD } from "../src/lib/round-model";

const GENESIS = 1_788_893_812n;
const L = 3600;
const W = 900;
const FPT = 1_000_000n;

describe("round clock (docs/13 §2 Time)", () => {
  it("round r covers [genesis + r·L, genesis + (r+1)·L)", () => {
    expect(roundEndAt(GENESIS, L, 0)).toBe(GENESIS + 3600n);
    expect(roundEndAt(GENESIS, L, 5)).toBe(GENESIS + 6n * 3600n);
    expect(roundAt(GENESIS, L, GENESIS)).toBe(0);
    expect(roundAt(GENESIS, L, GENESIS + 3599n)).toBe(0);
    expect(roundAt(GENESIS, L, GENESIS + 3600n)).toBe(1);
    expect(roundAt(GENESIS, L, GENESIS + 7199n)).toBe(1);
    expect(roundAt(GENESIS, L, GENESIS - 100n)).toBe(0); // before genesis is round 0, as currentRound()
  });
  it("counts down to the close and never goes negative", () => {
    expect(secondsToRoundEnd(GENESIS, L, 0, GENESIS)).toBe(3600);
    expect(secondsToRoundEnd(GENESIS, L, 0, GENESIS + 3599n)).toBe(1);
    expect(secondsToRoundEnd(GENESIS, L, 0, GENESIS + 3600n)).toBe(0);
    expect(secondsToRoundEnd(GENESIS, L, 0, GENESIS + 9999n)).toBe(0);
  });
  it("formats mm:ss with hours folded into minutes", () => {
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(59)).toBe("00:59");
    expect(formatClock(899)).toBe("14:59");
    expect(formatClock(3600)).toBe("60:00");
    expect(formatClock(-5)).toBe("00:00");
  });
});

describe("claim window (docs/13 §2 Claim)", () => {
  it("has nothing to claim during round 0", () => {
    expect(claimWindow(GENESIS, L, W, GENESIS + 100n)).toEqual({ round: null, open: false, deadline: 0n, secondsLeft: 0 });
  });
  it("opens at the close of round r for claimSeconds and then shuts", () => {
    const close0 = GENESIS + 3600n;
    const atClose = claimWindow(GENESIS, L, W, close0);
    expect(atClose.round).toBe(0);
    expect(atClose.open).toBe(true);
    expect(atClose.deadline).toBe(close0 + 900n);
    expect(atClose.secondsLeft).toBe(900);
    const lastSecond = claimWindow(GENESIS, L, W, close0 + 899n);
    expect(lastSecond.open).toBe(true);
    expect(lastSecond.secondsLeft).toBe(1);
    const shut = claimWindow(GENESIS, L, W, close0 + 900n);
    expect(shut.round).toBe(0);
    expect(shut.open).toBe(false);
    expect(shut.secondsLeft).toBe(0);
  });
  it("only the latest closed round is ever claimable", () => {
    const w = claimWindow(GENESIS, L, W, GENESIS + 3n * 3600n + 10n);
    expect(w.round).toBe(2);
    expect(w.open).toBe(true);
  });
  it("shuts for good on a halted mine", () => {
    const w = claimWindow(GENESIS, L, W, GENESIS + 3600n + 10n, true);
    expect(w.open).toBe(false);
    expect(w.round).toBeNull();
  });
});

describe("share and projected cut (docs/13 §2 Pot)", () => {
  it("share is Σ my work over round work, clamped to [0, 1]", () => {
    expect(shareOf([250n, 250n], 1000n)).toBe(0.5);
    expect(shareOf([1n], 3n)).toBeCloseTo(1 / 3, 5);
    expect(shareOf([], 1000n)).toBe(0);
    expect(shareOf([10n], 0n)).toBe(0);
    expect(shareOf([2000n], 1000n)).toBe(1);
  });
  it("projected cut follows the contract's rounding: pot × work / roundWork × fragPerToken / 1e18", () => {
    const pot = [WAD, 2n * WAD, 0n, WAD / 2n]; // 1, 2, 0, 0.5 tokens
    const cut = projectedCut(pot, [250n, 250n], 1000n, FPT);
    expect(cut).toEqual([500_000n, 1_000_000n, 0n, 250_000n]);
  });
  it("cut is zero without work in the round or without my work", () => {
    expect(projectedCut([WAD], [], 1000n, FPT)).toEqual([0n]);
    expect(projectedCut([WAD], [10n], 0n, FPT)).toEqual([0n]);
  });
  it("dust stays in the pot (whole fragments only)", () => {
    const cut = projectedCut([WAD], [1n], 3n, FPT); // a third of a token = 333333.33 fragments
    expect(cut[0]).toBe(333_333n);
  });
  it("rollover is the previous pot minus what was claimed, never negative", () => {
    expect(rolloverOf([WAD, 3n * WAD], [WAD / 4n, 3n * WAD])).toEqual([(3n * WAD) / 4n, 0n]);
    expect(rolloverOf([WAD], [2n * WAD])).toEqual([0n]);
  });
  it("sums claimable fragments over my rigs per stock", () => {
    expect(sumClaimable([{ claimable: [1n, 2n, 3n, 4n] }, { claimable: [10n, 0n, 0n, 0n] }])).toEqual([11n, 2n, 3n, 4n]);
    expect(sumClaimable([])).toEqual([0n, 0n, 0n, 0n]);
  });
});

describe("upgrade costs mirror the contract views", () => {
  const p = { gpuCostBps: [400, 600, 900, 1300, 1800] } as unknown as Parameters<typeof gpuCostOf>[0];
  it("gpu cost is stake × gpuCostBps[tier] and zero at the top tier instead of reverting", () => {
    expect(gpuCostOf(p, { amount: 100_000n * WAD, gpuTier: 0 })).toBe(4_000n * WAD);
    expect(gpuCostOf(p, { amount: 100_000n * WAD, gpuTier: 5 })).toBe(0n);
  });
});

describe("redeem amount parsing", () => {
  it("accepts fragments as integers and tokens as decimals", () => {
    expect(parseAmount("123", "frag", FPT)).toBe(123n);
    expect(parseAmount("123.9", "frag", FPT)).toBe(123n);
    expect(parseAmount("0.5", "token", FPT)).toBe(500_000n);
    expect(parseAmount("1.2345678", "token", FPT)).toBe(1_234_567n);
    expect(parseAmount("2", "token", FPT)).toBe(2_000_000n);
    expect(parseAmount("", "token", FPT)).toBe(0n);
    expect(parseAmount("abc", "frag", FPT)).toBe(0n);
  });
});
