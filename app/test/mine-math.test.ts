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
