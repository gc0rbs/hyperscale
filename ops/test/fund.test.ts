import { describe, expect, it } from "vitest";
import { resolveFunding } from "../src/fund.js";

describe("resolveFunding (audit B12)", () => {
  it("reads the pool from the chain and the reserve from the flag for a demo artifact", async () => {
    const r = resolveFunding({}, "50000", async () => [1n, 2n, 3n, 4n]);
    expect(await r.pool).toEqual([1n, 2n, 3n, 4n]);
    expect(r.reserve).toBe(50_000_000_000n);
  });
  it("fails with a clear message instead of a TypeError when neither is available", () => {
    expect(() => resolveFunding({}, undefined, async () => [])).toThrow(/--usdc-reserve/);
  });
});
