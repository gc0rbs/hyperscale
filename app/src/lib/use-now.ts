"use client";
import { useEffect, useState } from "react";

/** Wall-clock seconds, ticking at `ms` (default 250ms) for live estimates. */
export function useNow(ms = 250): bigint {
  const [now, setNow] = useState(() => BigInt(Math.floor(Date.now() / 1000)));
  useEffect(() => {
    const id = setInterval(() => setNow(BigInt(Math.floor(Date.now() / 1000))), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** Chain-anchored now: wall clock plus the offset measured at the last poll (Anvil time warps, sequencer drift). */
export function useChainNow(snap: { chainOffset: bigint } | undefined, ms = 250): bigint {
  const wall = useNow(ms);
  return snap ? wall + snap.chainOffset : wall;
}
