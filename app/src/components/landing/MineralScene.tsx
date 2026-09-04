"use client";

import { useEffect, useRef, useState } from "react";
import type { SceneController, SceneKind } from "./scene-engine";

export function MineralScene({ kind, value, label }: { kind: SceneKind; value: number; label: string }) {
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<SceneController | null>(null);
  const currentValue = useRef(value);
  const [ready, setReady] = useState(false);
  const [fallback, setFallback] = useState(false);
  currentValue.current = value;

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let cancelled = false;
    let started = false;
    const observer = new IntersectionObserver(async ([entry]) => {
      if (!entry.isIntersecting || started) return;
      started = true;
      try {
        const { createScene } = await import("./scene-engine");
        if (cancelled) return;
        controller.current = createScene(element, kind, currentValue.current);
        setReady(true);
      } catch {
        // Show the original vector illustration when WebGL is unavailable.
        if (!cancelled) setFallback(true);
      }
    }, { rootMargin: "250px" });
    observer.observe(element);
    return () => { cancelled = true; observer.disconnect(); controller.current?.dispose(); controller.current = null; };
  }, [kind]);

  useEffect(() => { controller.current?.setValue(value); }, [value]);

  return <div ref={host} className={`lp-scene lp-scene-${kind} ${ready ? "is-ready" : ""} ${fallback ? "is-fallback" : ""}`} role="img" aria-label={label}>
    <svg className="lp-scene-fallback" viewBox="0 0 600 600" aria-hidden="true"><defs><linearGradient id={`gold-${kind}`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#fff0b1" /><stop offset=".45" stopColor="#f2a93b" /><stop offset="1" stopColor="#895013" /></linearGradient></defs>{kind === "rig" ? <g stroke="#33322f" strokeWidth="5"><path d="m170 240 130-75 130 75v215l-130 75-130-75Z" fill="#262624" /><path d="m170 240 130 75 130-75-130-75Z" fill="#68675f" />{[0,1,2,3,4].map(i=><path key={i} d={`m185 ${270+i*35} 100 57v18l-100-57Z`} fill="#f2a93b" />)}<path d="M315 330v150m20-160v145m20-157v145m20-157v145m20-157v145" stroke="#45c4db" /></g> : kind === "token" ? <g transform="rotate(-20 300 300)"><ellipse cx="300" cy="300" rx="155" ry="190" fill={`url(#gold-${kind})`} /><ellipse cx="300" cy="300" rx="135" ry="170" fill="#24241e" stroke="#f2a93b" strokeWidth="5" /><path d="m320 195-100 120h70l-20 95 105-125h-72Z" fill="#f2a93b" /></g> : <g transform={value ? "rotate(15 300 300)" : undefined}><path d="m170 160 140-45 135 130-60 195-140 35-105-155Z" fill={`url(#gold-${kind})`} stroke="#45c4db" strokeWidth="3" /><path d="m170 160 80 130 60-175 20 220 115-90-195 45-5 185 85-140 55 105" fill="none" stroke="#ffda81" strokeWidth="2" /><path d="m140 320 110-30-80-130m160 175-85 140 140-35" fill="#ed9422" opacity=".7" /></g>}</svg>
  </div>;
}
