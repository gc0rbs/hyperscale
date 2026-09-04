import { describe, expect, it } from "vitest";
import { sizeDifficulty, sizePoolByValue } from "../src/sizing.js";

describe("sizeDifficulty (docs/04 §5.2)", () => {
  it("matches the docs/03 worked example: 10M hash × 24h, 20/25/25/30", () => {
    const s = sizeDifficulty({
      expectedTotalHash: 10_000_000n,
      plannedSeconds: 86_400n,
      diffShareBps: [2000, 2500, 2500, 3000],
      shiftsPerBlock: 8,
    });
    expect(s.difficulty.map(String)).toEqual([
      "172800000000",
      "216000000000",
      "216000000000",
      "259200000000",
    ]);
    expect(s.difficultyTotal).toBe(864_000_000_000n);
    expect(s.maxDurationSeconds).toBe(2n * 86_400n);
  });
  it("caps at an explicit value, never under one hour", () => {
    const s = sizeDifficulty({ expectedTotalHash: 1n, plannedSeconds: 600n, diffShareBps: [2500, 2500, 2500, 2500], shiftsPerBlock: 8 });
    expect(s.maxDurationSeconds).toBe(3600n);
    const t = sizeDifficulty({ expectedTotalHash: 1n, plannedSeconds: 10_800n, diffShareBps: [2500, 2500, 2500, 2500], shiftsPerBlock: 8, capSeconds: 21_600n });
    expect(t.maxDurationSeconds).toBe(21_600n);
  });
  it("sizes the pool by USD value share and live prices", () => {
    // $10k pool, 15/20/25/40, NVDA 230.405 / MU 998.705 / SNDK 1719.035 / QQQ 717.355 (2026-09-04 mids)
    const pool = sizePoolByValue(10_000, [1500, 2000, 2500, 4000], [230.405, 998.705, 1719.035, 717.355]);
    expect(pool.map((x) => Number(x) / 1e18)).toEqual([6.510275, 2.002593, 1.454304, 5.57604]);
    expect(() => sizePoolByValue(1, [1, 2], [1, 1])).toThrow();
  });
  it("rejects shares that do not sum to 10000", () => {
    expect(() => sizeDifficulty({ expectedTotalHash: 1n, plannedSeconds: 1n, diffShareBps: [1, 2, 3, 4], shiftsPerBlock: 8 })).toThrow();
  });
});
