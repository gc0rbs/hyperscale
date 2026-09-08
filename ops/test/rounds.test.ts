import { describe, expect, it } from "vitest";
import { fundSchedule, resolveStocks, roundClock, scheduleRunsOutIn } from "../src/lib/rounds.js";
import { roundKeeperDecision, type RoundKeeperView } from "../src/lib/rounds-keeper-logic.js";

const G = 1_000_000;
const L = 3600;
const W = 900;

describe("roundClock (docs/13 §2 Time)", () => {
  it("is round 0 before genesis and never in a claim window", () => {
    const c = roundClock(G, L, W, G - 100);
    expect(c.round).toBe(0);
    expect(c.roundStart).toBe(G);
    expect(c.roundEnd).toBe(G + L);
    expect(c.inClaimWindow).toBe(false);
    expect(c.secondsToClose).toBe(L + 100);
  });
  it("matches RoundMine.currentRound / roundEnd at and around boundaries", () => {
    expect(roundClock(G, L, W, G).round).toBe(0);
    expect(roundClock(G, L, W, G + L - 1).round).toBe(0);
    expect(roundClock(G, L, W, G + L).round).toBe(1);
    const c = roundClock(G, L, W, G + 2 * L + 10);
    expect(c.round).toBe(2);
    expect(c.roundStart).toBe(G + 2 * L);
    expect(c.roundEnd).toBe(G + 3 * L);
    expect(c.secondsToClose).toBe(L - 10);
  });
  it("opens the previous round's claim window for claimSeconds after the boundary, not for round 0", () => {
    expect(roundClock(G, L, W, G + 10).inClaimWindow).toBe(false); // round 0 has no previous round
    const open = roundClock(G, L, W, G + L + 10);
    expect(open.inClaimWindow).toBe(true);
    expect(open.claimOpenUntil).toBe(G + L + W);
    expect(roundClock(G, L, W, G + L + W - 1).inClaimWindow).toBe(true);
    expect(roundClock(G, L, W, G + L + W).inClaimWindow).toBe(false);
  });
});

describe("fundSchedule (mirror of RoundMine.fund)", () => {
  it("splits amount / rounds and starts with the round after the current one", () => {
    const p = fundSchedule(24n * 10n ** 18n, 24, 5, false);
    expect(p.perRound).toBe(10n ** 18n);
    expect(p.total).toBe(24n * 10n ** 18n);
    expect(p.remainder).toBe(0n);
    expect(p.firstRound).toBe(6);
    expect(p.lastRound).toBe(29);
  });
  it("keeps the integer-division remainder with the funder", () => {
    const p = fundSchedule(10n, 3, 0, false);
    expect(p.perRound).toBe(3n);
    expect(p.total).toBe(9n);
    expect(p.remainder).toBe(1n);
  });
  it("starts at round 0 before genesis", () => {
    expect(fundSchedule(100n, 4, 0, true)).toMatchObject({ firstRound: 0, lastRound: 3 });
  });
  it("refuses a zero per-round amount and out-of-range round counts", () => {
    expect(() => fundSchedule(2n, 3, 0, false)).toThrow(/zero/);
    expect(() => fundSchedule(100n, 0, 0, false)).toThrow(/1\.\.720/);
    expect(() => fundSchedule(100n, 721, 0, false)).toThrow(/1\.\.720/);
  });
});

describe("resolveStocks", () => {
  const syms = ["NVDA", "MU", "SNDK", "QQQ"];
  it("accepts a symbol (any case), an index, or all", () => {
    expect(resolveStocks("nvda", syms)).toEqual([0]);
    expect(resolveStocks("2", syms)).toEqual([2]);
    expect(resolveStocks("all", syms)).toEqual([0, 1, 2, 3]);
  });
  it("rejects unknown symbols, out-of-range indices and a missing flag", () => {
    expect(() => resolveStocks("TSLA", syms)).toThrow(/unknown stock/);
    expect(() => resolveStocks("4", syms)).toThrow(/out of range/);
    expect(() => resolveStocks(undefined, syms)).toThrow(/--stock/);
  });
});

describe("scheduleRunsOutIn", () => {
  it("reports the first empty round ahead", () => {
    expect(scheduleRunsOutIn([1n, 1n, 1n, 1n, 1n, 1n])).toBeNull();
    expect(scheduleRunsOutIn([1n, 1n, 0n, 1n, 1n, 1n])).toBe(3);
    expect(scheduleRunsOutIn([0n, 0n])).toBe(1);
  });
});

describe("roundKeeperDecision", () => {
  const base: RoundKeeperView = {
    now: G + L + 30, genesis: G, roundSeconds: L, currentRound: 1, closedRounds: 0, halted: false,
    lastPokedRound: null, ethBalanceWei: 10n ** 18n, minEthWei: 10n ** 16n,
  };
  it("stops when halted", () => {
    expect(roundKeeperDecision({ ...base, halted: true }).action).toBe("stop");
  });
  it("waits before genesis", () => {
    const d = roundKeeperDecision({ ...base, now: G - 50, currentRound: 0 });
    expect(d.action).toBe("wait");
    expect(d.reason).toMatch(/genesis in 50s/);
  });
  it("pokes when a boundary passed and the chain has not recorded it", () => {
    const d = roundKeeperDecision(base);
    expect(d.action).toBe("poke");
    expect(d.reason).toMatch(/round 0 closed/);
  });
  it("waits inside the settle delay right after a boundary, then pokes", () => {
    const early = roundKeeperDecision({ ...base, now: G + L + 2 });
    expect(early.action).toBe("wait");
    expect(early.sleepSec).toBe(3);
    expect(roundKeeperDecision({ ...base, now: G + L + 5 }).action).toBe("poke");
  });
  it("pokes at most once per round", () => {
    expect(roundKeeperDecision({ ...base, lastPokedRound: 1 }).action).toBe("wait");
    expect(roundKeeperDecision({ ...base, lastPokedRound: 0 }).action).toBe("poke");
  });
  it("waits when the close is recorded and shortens the sleep to land ~5s after the next boundary", () => {
    const d = roundKeeperDecision({ ...base, closedRounds: 1, now: G + 2 * L - 10 }, { intervalSec: 20, settleDelaySec: 5 });
    expect(d.action).toBe("wait");
    expect(d.sleepSec).toBe(15);
    const far = roundKeeperDecision({ ...base, closedRounds: 1, now: G + L + 100 }, { intervalSec: 20, settleDelaySec: 5 });
    expect(far.sleepSec).toBe(20);
  });
  it("flags low gas independently of the action", () => {
    expect(roundKeeperDecision({ ...base, ethBalanceWei: 10n ** 15n }).lowGas).toBe(true);
    expect(roundKeeperDecision({ ...base, ethBalanceWei: 10n ** 15n, halted: true }).lowGas).toBe(true);
    expect(roundKeeperDecision(base).lowGas).toBe(false);
  });
});
