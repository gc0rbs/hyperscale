import { describe, expect, it } from "vitest";
import { haircut, ponsV2Collects, ponsV2PoolId, resolveStocks, roundClock } from "../src/lib/rounds.js";
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
  it("keeps poking without delay while more than one round behind (48 boundaries per poke, docs/13 catch-up)", () => {
    const lagging = { ...base, now: G + 100 * L + 1, currentRound: 100, closedRounds: 0, lastPokedRound: 100 };
    const d = roundKeeperDecision(lagging);
    expect(d.action).toBe("poke");
    expect(d.sleepSec).toBe(1);
    expect(d.reason).toMatch(/catching up: 100 rounds behind/);
    expect(roundKeeperDecision({ ...lagging, closedRounds: 99 }).action).toBe("wait"); // back to one behind: settle delay + once-per-round apply
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

describe("haircut (flush minOut)", () => {
  it("applies the slippage in bps to every leg and rejects nonsense", () => {
    expect(haircut([1000n, 0n, 33n], 100)).toEqual([990n, 0n, 32n]);
    expect(haircut([1000n], 0)).toEqual([1000n]);
    expect(() => haircut([1n], 10_001)).toThrow(/range/);
  });
});

describe("ponsV2PoolId / ponsV2Collects (docs/13 §2 Pons V2 wiring)", () => {
  const hook = "0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044" as const;
  const token = "0x1111111111111111111111111111111111111111" as const;
  const eth = "0x0000000000000000000000000000000000000000" as const;
  it("is keccak256(abi.encode(PoolKey)) with native ETH as currency0 (cast-computed vector)", () => {
    expect(ponsV2PoolId(token, eth, 0, 200, hook)).toBe("0x5763342b7a962503f2b462a0ea275f6d8ba605443055b919b60e57797177b8e3");
    expect(ponsV2PoolId(eth, token, 0, 200, hook)).toBe(ponsV2PoolId(token, eth, 0, 200, hook)); // sorted either way
  });
  it("encodes sweep, sweep, claim in that order (sweeps credit the escrow the claim then empties)", () => {
    const c = ponsV2Collects("0x2222222222222222222222222222222222222222", hook, ponsV2PoolId(token, eth, 0, 200, hook), "0x3333333333333333333333333333333333333333");
    expect(c.map((x) => x.target)).toEqual(["0x2222222222222222222222222222222222222222", hook, "0x3333333333333333333333333333333333333333"]);
    expect(c[0].data.slice(0, 10)).toBe("0x3729bb9a"); // sweepFees(uint256)
    expect(c[1].data.slice(0, 10)).toBe("0x3d61055e"); // sweepPoolFees(bytes32,uint256,uint256)
    expect(c[2].data).toBe("0x4e71d92d"); // claim()
  });
});
