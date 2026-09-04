"use client";
import { useEffect, useMemo, useState } from "react";
import { Label, Mono } from "./ui";

function prng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

/** Cosmetic. Speed scales with hashrate; labelled as such per brief §2.7. */
export function HashStream({ hashWad, seed = 7 }: { hashWad: bigint; seed?: number }) {
  const hpm = Number(hashWad / 10n ** 18n) / 1e6; // "millions of hash"
  const perLine = Math.min(1.2, Math.max(0.15, 1.2 / Math.max(hpm, 0.1)));
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (hashWad === 0n) return;
    const id = setInterval(() => setTick((t) => t + 1), perLine * 1000);
    return () => clearInterval(id);
  }, [perLine, hashWad]);
  const lines = useMemo(() => {
    const r = prng(seed + tick);
    return Array.from({ length: 12 }, (_, i) => {
      const h = Array.from({ length: 40 }, () => "0123456789abcdef"[Math.floor(r() * 16)]).join("");
      return { h, hit: (i + tick) % 7 === 3 };
    });
  }, [seed, tick]);
  return (
    <div className="bg-mine-panel border border-mine-line rounded-md px-5 py-4 flex flex-col gap-2.5">
      <div className="flex justify-between"><Label>Hash stream</Label><Mono className="text-mine-dim text-[11px]">~{(hpm).toFixed(2)}M H</Mono></div>
      <div className="relative h-[220px] overflow-hidden font-data text-[12px] leading-5 text-mine-dim" aria-hidden>
        {lines.map((l, i) => <div key={i} className={l.hit ? "text-ember" : ""}>0x{l.h}{l.hit ? " ◂" : ""}</div>)}
      </div>
      <div className="text-mine-dim text-[11px]">Cosmetic. Your rewards depend on hashrate, not on this.</div>
    </div>
  );
}
