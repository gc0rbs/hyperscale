/** Round keeper decision, separated from I/O so it can be unit-tested (docs/13 §2: rounds close on the clock). */
import { roundClock } from "./rounds.js";

export interface RoundKeeperView {
  /** chain time (latest block timestamp) */
  now: number;
  genesis: number;
  roundSeconds: number;
  /** RoundMine.currentRound() */
  currentRound: number;
  /** RoundMine.closedRounds(): rounds 0 .. closedRounds-1 are recorded */
  closedRounds: number;
  halted: boolean;
  /** the round the keeper last poked in successfully (null = never) */
  lastPokedRound: number | null;
  ethBalanceWei: bigint;
  minEthWei: bigint;
}

export interface RoundKeeperOptions {
  /** poll interval (upper bound on the sleep) */
  intervalSec: number;
  /** poke this many seconds after a boundary, so a block stamped slightly behind wall-clock still closes the round */
  settleDelaySec: number;
}

export type RoundKeeperAction = "poke" | "wait" | "stop";

export interface RoundKeeperDecision {
  action: RoundKeeperAction;
  reason: string;
  /** seconds to sleep before the next tick (≤ intervalSec; shortened to land ~settleDelaySec after the next boundary) */
  sleepSec: number;
  /** true when the keeper's ETH balance is below the minimum: the caller alerts */
  lowGas: boolean;
}

export const DEFAULT_KEEPER_OPTIONS: RoundKeeperOptions = { intervalSec: 20, settleDelaySec: 5 };

export function roundKeeperDecision(v: RoundKeeperView, o: RoundKeeperOptions = DEFAULT_KEEPER_OPTIONS): RoundKeeperDecision {
  const lowGas = v.ethBalanceWei < v.minEthWei;
  if (v.halted) return { action: "stop", reason: "mine halted; no round closes again", sleepSec: 0, lowGas };
  const c = roundClock(v.genesis, v.roundSeconds, 0, v.now);
  // Sleep until ~settleDelay after the next boundary, never longer than the interval, at least 1s.
  const toNextPoke = c.roundEnd + o.settleDelaySec - v.now;
  const sleepSec = Math.max(1, Math.min(o.intervalSec, toNextPoke));
  if (v.now < v.genesis) return { action: "wait", reason: `genesis in ${v.genesis - v.now}s`, sleepSec, lowGas };
  // A boundary has passed and the chain has not recorded it: poke, once we are past the settle delay
  // (a poke inside the delay is not wrong, only possibly early for a lagging block timestamp), and
  // at most once per round (a stale read right after our own poke must not send a second one).
  if (v.closedRounds < v.currentRound) {
    const sinceBoundary = v.now - c.roundStart;
    if (sinceBoundary < o.settleDelaySec) {
      return { action: "wait", reason: `boundary ${sinceBoundary}s ago; poking in ${o.settleDelaySec - sinceBoundary}s`, sleepSec: o.settleDelaySec - sinceBoundary, lowGas };
    }
    if (v.lastPokedRound === v.currentRound) {
      return { action: "wait", reason: `already poked in round ${v.currentRound}; waiting for the chain to catch up`, sleepSec, lowGas };
    }
    return { action: "poke", reason: `round ${v.currentRound - 1} closed ${sinceBoundary}s ago, closedRounds=${v.closedRounds}`, sleepSec, lowGas };
  }
  return { action: "wait", reason: `round ${v.currentRound} closes in ${c.secondsToClose}s (closed=${v.closedRounds})`, sleepSec, lowGas };
}
