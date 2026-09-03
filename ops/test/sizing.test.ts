import { describe, expect, it } from "vitest";
import { sizeDifficulty } from "../src/sizing.js";

describe("sizeDifficulty (docs/04 §5.2)", () => {
  it("matches the season-default example: 10M hash × 24h, 20/25/25/30", () => {
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
    expect(s.maxDurationSeconds).toBe(30n * 86_400n);
  });
  it("floors the fail-safe at 14 days", () => {
    const s = sizeDifficulty({ expectedTotalHash: 1n, plannedSeconds: 3600n, diffShareBps: [2500, 2500, 2500, 2500], shiftsPerBlock: 8 });
    expect(s.maxDurationSeconds).toBe(14n * 24n * 3600n);
  });
  it("rejects shares that do not sum to 10000", () => {
    expect(() => sizeDifficulty({ expectedTotalHash: 1n, plannedSeconds: 1n, diffShareBps: [1, 2, 3, 4], shiftsPerBlock: 8 })).toThrow();
  });
});
