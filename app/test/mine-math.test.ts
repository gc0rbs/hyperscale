import { describe, expect, it } from "vitest";
import { WAD, advance, eta, pending, type GlobalState, type RigState, type SeasonConfig } from "../src/lib/mine-math";

const OPEN = 1_800_000_000n;
const D = [172_800_000_000n * WAD, 216_000_000_000n * WAD, 216_000_000_000n * WAD, 259_200_000_000n * WAD];
const POOL = [5n * WAD, 6n * WAD, 10n * WAD, 6n * WAD];
const FRAG = 1_000_000n;
const cfg: SeasonConfig = {
  openTime: OPEN,
  maxDurationSeconds: 30n * 86400n,
  shiftsPerBlock: 8,
  blocks: 4,
  difficulty: D,
  ratePerWork: D.map((d, i) => ((POOL[i] * FRAG) * WAD) / d),
  coolPerShift: [10, 18, 26, 36],
};
const g0 = (totalHash: bigint): GlobalState => ({ shift: 0, workInShift: 0n, lastX: OPEN * WAD, totalHash, closeX: 0n, ocExpiring: {}, shiftEndX: {} });
const rig = (baseHash: bigint): RigState => ({ inactive: false, lastShift: 0, lastX: OPEN * WAD, baseHash, ocHash: 0n, ocExpiryShift: 0, activeOc: 0, heat: 0, coolingTier: 0, earned: [0n, 0n, 0n, 0n] });

describe("mine-math mirrors the contract (values from contracts/test/unit/Mine.t.sol)", () => {
  it("7M hash for 100 s earns 20,254 fragments regardless of others", () => {
    expect(pending(cfg, g0(7_000_000n * WAD), rig(7_000_000n * WAD), OPEN + 100n, 0)).toBe(20_254n);
    expect(pending(cfg, g0(57_000_000n * WAD), rig(7_000_000n * WAD), OPEN + 100n, 0)).toBe(20_254n);
  });
  it("10M hash finds block 1 at exactly 17,280 s and pays the pool minus dust", () => {
    const { g } = advance(cfg, g0(10_000_000n * WAD), OPEN + 17_280n);
    expect(g.shift).toBe(8);
    expect(g.shiftEndX[7]).toBe((OPEN + 17_280n) * WAD);
    const p = pending(cfg, g0(10_000_000n * WAD), rig(10_000_000n * WAD), OPEN + 17_280n, 0);
    expect(p).toBeGreaterThanOrEqual(4_999_999n);
    expect(p).toBeLessThanOrEqual(5_000_000n);
  });
  it("eta is idle with no hash and reports seconds otherwise", () => {
    expect(eta(cfg, g0(0n), OPEN + 10n).idle).toBe(true);
    const e = eta(cfg, g0(10_000_000n * WAD), OPEN);
    expect(e.toShiftEnd).toBe(2160n);
    expect(e.toBlockFound).toBe(17_280n);
    expect(e.toClose).toBe(86_400n);
  });
  it("fail-safe closes at maxDuration with a tiny hash", () => {
    const { g } = advance(cfg, g0(1000n * WAD), OPEN + 30n * 86400n);
    expect(g.closeX).toBe((OPEN + 30n * 86400n) * WAD);
    expect(g.shift).toBe(0);
  });
});

import { coverage, estimateFragments, remainingWork, totalWork } from "../src/lib/mine-math";

describe("coverage and estimates (audit B10, I3)", () => {
  const c = { openTime: 0n, maxDurationSeconds: 21600n, shiftsPerBlock: 8, blocks: 4, difficulty: [2000n, 2500n, 2500n, 3000n], ratePerWork: [10n ** 36n, 10n ** 36n, 10n ** 36n, 10n ** 36n], coolPerShift: [10, 18, 26, 36] };
  const g = (shift: number, workInShift: bigint) => ({ shift, workInShift, lastX: 0n, totalHash: 100n, closeX: 0n, ocExpiring: {}, shiftEndX: {} });
  it("permanent coverage is remaining work over total work, not a shift-index mix", () => {
    // shift 7 (block 1, last shift) with 95% of that shift done: 7.95 of 8 shifts of block 1 done
    const st = g(7, 237n); // shiftDiff block 1 = 250; 7×250 + 237 = 1987 of 2000
    expect(totalWork(c)).toBe(10000n);
    expect(remainingWork(c, st)).toBe(10000n - 1987n);
    expect(coverage(c, st).fraction).toBeCloseTo(0.8013, 3);
  });
  it("overclock coverage is the rest of this shift plus the span, truncated at close", () => {
    const st = g(30, 100n); // block 4, shiftDiff 375
    const cov = coverage(c, st, 1);
    expect(cov.work).toBe(375n - 100n + 375n);
    expect(cov.truncated).toBe(false);
    const late = coverage(c, g(31, 0n), 1);
    expect(late.work).toBe(375n);
    expect(late.truncated).toBe(true);
  });
  it("fragment estimate: extra hash × seconds at the new pace × rate", () => {
    // 100 hash mining, add 100 → pace 200; remaining 10000 work → 50 s; 100 hash × 50 s × 1 frag/hash-s = 5000
    expect(estimateFragments(c, g(0, 0n), 100n)).toBe(5000n);
    expect(estimateFragments(c, g(0, 0n), 100n, 1000n)).toBe(500n);
  });
});
