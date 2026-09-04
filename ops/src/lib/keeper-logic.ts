/** Keeper decision (audit B2, I4), separated from I/O so it can be unit-tested. */
export interface KeeperView {
  phase: number; // 0 Funding, 1 PreOpen, 2 Open, 3 Closed, 4 Cancelled
  storedShift: number; // SeasonMine.shift()
  simulatedShift: number; // SeasonMine.progress().shift
  storedCloseX: bigint; // SeasonMine.closeX()
  staleSec: number; // now - lastX
  idle: boolean; // totalHash == 0
}

export type KeeperAction = "stop" | "poke-and-stop" | "poke" | "wait";

export function keeperDecision(v: KeeperView, maxStaleSec = 600): KeeperAction {
  // A logically closed mine whose close is not persisted must be poked once so redemption opens.
  if (v.phase === 3 && v.storedCloseX === 0n) return "poke-and-stop";
  if (v.phase === 3 || v.phase === 4 || v.storedCloseX !== 0n) return "stop";
  if (v.phase !== 2) return "wait";
  if (v.idle) return "wait";
  // Poke only when a boundary has actually passed (the simulated shift is ahead of the stored one) or
  // the stored view is stale enough that the next player would pay for a long catch-up.
  if (v.simulatedShift > v.storedShift) return "poke";
  if (v.staleSec > maxStaleSec) return "poke";
  return "wait";
}
