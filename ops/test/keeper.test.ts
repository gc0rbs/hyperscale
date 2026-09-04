import { describe, expect, it } from "vitest";
import { keeperDecision } from "../src/lib/keeper-logic.js";

const base = { phase: 2, storedShift: 3, simulatedShift: 3, storedCloseX: 0n, staleSec: 30, idle: false };

describe("keeperDecision (audit B2, I4)", () => {
  it("pokes once to persist a logical close, then stops", () => {
    expect(keeperDecision({ ...base, phase: 3 })).toBe("poke-and-stop");
    expect(keeperDecision({ ...base, phase: 3, storedCloseX: 1n })).toBe("stop");
    expect(keeperDecision({ ...base, phase: 4 })).toBe("stop");
  });
  it("waits before open and while idle", () => {
    expect(keeperDecision({ ...base, phase: 1 })).toBe("wait");
    expect(keeperDecision({ ...base, idle: true, staleSec: 5000 })).toBe("wait");
  });
  it("pokes only when a boundary passed or the view is stale, not halfway to a boundary", () => {
    expect(keeperDecision({ ...base, simulatedShift: 4 })).toBe("poke");
    expect(keeperDecision({ ...base, staleSec: 601 })).toBe("poke");
    expect(keeperDecision({ ...base, staleSec: 599 })).toBe("wait");
  });
});
