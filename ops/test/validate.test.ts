import { describe, expect, it } from "vitest";
import { validateVaultDeps, validateSeasonParams, type SeasonParamsJson } from "../src/lib/validate.js";

const A = "0x000000000000000000000000000000000000dEaD";
const NOW = 1_800_000_000;

function good(): SeasonParamsJson {
  return {
    rig: A,
    lpToken: A,
    lpWeightPerToken: "2500000000000000000",
    openTime: NOW + 3 * 86_400,
    maxDurationSeconds: 30 * 86_400,
    blocks: 4,
    shiftsPerBlock: 8,
    stocks: [A, A, A, A],
    poolTokens: ["5000000000000000000", "6000000000000000000", "10000000000000000000", "6000000000000000000"],
    difficulty: ["172800000000000000000000000000", "216000000000000000000000000000", "216000000000000000000000000000", "259200000000000000000000000000"],
    fragPerToken: "1000000",
    minStakeWeight: "100000000000000000000",
    activationFeeBps: 100,
    earlyExitFeeBps: 300,
    gpuMultBps: [10000, 12000, 14000, 16000, 18000, 20000],
    gpuCostBps: [400, 600, 900, 1300, 1800],
    coolCostBps: [300, 500, 800],
    heatPerOc: [40, 30, 22, 15],
    coolPerShift: [10, 18, 26, 36],
    heatMax: 100,
    ocCostBps: 200,
    ocBoostBps: 5000,
    maxActiveOc: 3,
    ocShiftSpan: 1,
    redemptionDays: 30,
    cashOutFeeBps: 100,
    pauseGraceSeconds: 21_600,
    treasury: A,
  };
}

describe("validateSeasonParams mirrors SeasonFactory._validate", () => {
  it("accepts the default season", () => {
    expect(validateSeasonParams(good(), NOW)).toEqual([]);
  });
  it("flags each factory rule with the contract's reason string", () => {
    const cases: [Partial<SeasonParamsJson>, string][] = [
      [{ blocks: 3 }, "blocks must be 4"],
      [{ shiftsPerBlock: 0 }, "shiftsPerBlock"],
      [{ fragPerToken: "0" }, "fragPerToken"],
      [{ gpuMultBps: [10000, 12000, 12000, 16000, 18000, 20000] }, "gpuMultBps increasing"],
      [{ ocBoostBps: 20000 }, "ocBoost*maxActiveOc"],
      [{ heatPerOc: [101, 30, 22, 15] }, "heatPerOc > heatMax"],
      [{ difficulty: ["7", "216000000000", "216000000000", "259200000000"] }, "difficulty divisible by shiftsPerBlock"],
      [{ poolTokens: ["0", "1", "1", "1"] }, "pool"],
      [{ poolTokens: ["340282366920938463463374607431768211456", "1", "1", "1"] }, "pool too large"],
      [{ minStakeWeight: "0" }, "minStakeWeight"],
      [{ lpWeightPerToken: "0" }, "lp config"],
      [{ maxDurationSeconds: 1800 }, "maxDuration >= 1 hour"],
      [{ openTime: NOW - 1 }, "openTime in the past"],
      [{ treasury: "0x0000000000000000000000000000000000000000" }, "addresses"],
      [{ earlyExitFeeBps: 5000 }, "fees"],
      [{ redemptionDays: 0 }, "windows"],
    ];
    for (const [patch, reason] of cases) {
      expect(validateSeasonParams({ ...good(), ...patch }, NOW), reason).toContain(reason);
    }
  });
  it("flags a pool too small to pay anything per unit of work", () => {
    const p = good();
    p.poolTokens = ["1", "1", "1", "1"]; // 1 wei of stock token per block
    expect(validateSeasonParams(p, NOW)).toContain("rate");
  });
});

describe("validateVaultDeps (audit B3)", () => {
  it("rejects zero eligibility, oracle or usdc", () => {
    const ok = { eligibility: "0x" + "1".repeat(40), oracle: "0x" + "2".repeat(40), usdc: "0x" + "3".repeat(40) };
    expect(validateVaultDeps(ok)).toEqual([]);
    expect(validateVaultDeps({ ...ok, oracle: "0x" + "0".repeat(40) })).toEqual(["vault dependencies"]);
    expect(validateVaultDeps({ ...ok, usdc: "" })).toEqual(["vault dependencies"]);
  });
});
