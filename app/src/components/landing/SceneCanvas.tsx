"use client";

import { useEffect, useRef, useState } from "react";
import type { SceneController, SceneKind } from "./scene-engine";

/**
 * Lazy WebGL illustration with a vector fallback (Hyperscaler design handoff 2026-09-09). The 3D
 * engine loads when the scene scrolls near; the SVG stays for reduced hardware and for the moment
 * before the canvas is ready.
 */
export function SceneCanvas({ kind, value, label }: { kind: SceneKind; value: number; label: string }) {
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
        // Show the vector illustration when WebGL is unavailable.
        if (!cancelled) setFallback(true);
      }
    }, { rootMargin: "250px" });
    observer.observe(element);
    return () => { cancelled = true; observer.disconnect(); controller.current?.dispose(); controller.current = null; };
  }, [kind]);

  useEffect(() => { controller.current?.setValue(value); }, [value]);

  const gradient = `silicon-${kind}`;
  return (
    <div ref={host} className={`lp-scene lp-scene-${kind} ${ready ? "is-ready" : ""} ${fallback ? "is-fallback" : ""}`} role="img" aria-label={label}>
      <svg className="lp-scene-fallback" viewBox="0 0 600 600" aria-hidden="true">
        <defs><linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#bcfacb" /><stop offset=".5" stopColor="#00c805" /><stop offset="1" stopColor="#168b2a" /></linearGradient></defs>
        {Array.from({ length: 16 }, (_, i) => {
          const angle = 2.39996 * i;
          return (
            <g key={`shard-${i}`} transform={`translate(${300 + 245 * Math.cos(angle)} ${300 + 245 * Math.sin(angle)}) rotate(${37 * i})`}>
              <path d="m-13-7 16-6 10 9-6 15-11 2-7-10Z" fill={i % 3 ? `url(#${gradient})` : "#d8f4df"} />
              <path d="m-13-7 16-6 10 9" fill="none" stroke="#d6ffe1" strokeWidth="1.5" />
            </g>
          );
        })}
        {kind === "rig" ? (
          <g transform="translate(120 85)" stroke="#8d9e92" strokeWidth="2">
            <path d="M25 25 285 0 345 45v370l-270 20-50-35Z" fill="#202622" />
            <path d="m285 0 60 45v370l-60-30Z" fill="#2b352e" />
            {Array.from({ length: 6 }, (_, i) => (
              <g key={i} opacity={i <= Math.round(value) ? 1 : 0.2} transform={`translate(45 ${55 + 52 * i})`}>
                <rect width="220" height="40" rx="3" fill="#3a4740" />
                <rect x="12" y="12" width="50" height="15" fill={`url(#${gradient})`} />
                <circle cx="150" cy="20" r="12" fill="#111613" /><circle cx="185" cy="20" r="12" fill="#111613" />
                <path d="m144 14 12 12m29-12-12 12" />
              </g>
            ))}
            <path d="M315 65v310M32 55v320" stroke="#53db72" strokeWidth="4" />
          </g>
        ) : kind === "reward" ? (
          <g transform="translate(135 150) rotate(-8 170 170)">
            {[3, 2, 1, 0].map((i) => (
              <g key={i} transform={`translate(${20 * i} ${-(23 * i)})`}>
                <rect x="10" y="5" width="270" height="230" rx="8" fill="#242e28" stroke="#95af9e" strokeWidth="2" />
                {i === 0 && (
                  <>
                    <text x="145" y="110" fill="#f5f7f5" fontSize="49" fontFamily="monospace" textAnchor="middle">{["NVDA", "MU", "SNDK", "QQQ"][Math.min(3, Math.floor((4 * value) / 3 + 1e-4))]}</text>
                    {Array.from({ length: 8 }, (_, t) => <rect key={t} x={35 + 28 * t} y="178" width="20" height="8" fill="#53db72" />)}
                  </>
                )}
              </g>
            ))}
          </g>
        ) : (
          <g transform="rotate(-18 300 300)">
            <path d="M160 130h280l25 25v290l-25 25H160l-25-25V155Z" fill="#2b352e" stroke="#91a598" strokeWidth="3" />
            <path d="M175 155h250v290H175Z" fill="#19221d" stroke="#53db72" strokeWidth="2" />
            {kind === "token" ? (
              <>
                {Array.from({ length: 12 }, (_, i) => <rect key={i} x={(i % 2 ? 465 : 117) + (value ? 0 : i % 2 ? 25 : -25)} y={158 + 54 * Math.floor(i / 2)} width="12" height="22" fill={i % 3 ? "#00c805" : "#53db72"} />)}
                <path d="M225 200h35v75h80v-75h35v195h-35v-85h-80v85h-35Z" fill={`url(#${gradient})`} />
                <text x="300" y="431" fill="#53db72" fontFamily="monospace" fontSize="16" textAnchor="middle">AI STACK</text>
              </>
            ) : (
              <>
                <rect x="215" y="210" width="170" height="180" fill={`url(#${gradient})`} stroke="#53db72" strokeWidth="4" />
                {Array.from({ length: 6 }, (_, i) => <path key={i} d={`M${230 + 27 * i} 210v180M215 ${226 + 28 * i}h170`} stroke="#187327" strokeWidth="1" />)}
                {[0, 1, 2, 3].map((i) => (
                  <g key={i}>
                    <rect x="153" y={195 + 55 * i} width="42" height="37" fill="#3a4740" stroke="#53db72" />
                    <rect x="405" y={195 + 55 * i} width="42" height="37" fill="#3a4740" stroke="#53db72" />
                  </g>
                ))}
              </>
            )}
          </g>
        )}
      </svg>
    </div>
  );
}

const DUST = Array.from({ length: 170 }, (_, i) => {
  const sample = (salt: number) => { const v = 43758.5453 * Math.sin((i + 1) * salt); return v - Math.floor(v); };
  return { x: 1440 * sample(12.98), y: 1000 * sample(78.23), size: 0.5 + sample(14.5), opacity: 0.15 + 0.38 * sample(61.4) };
});

/** Circuit-board background behind a story chapter: light, bus traces, vias, dust and a perspective grid. */
export function Atmosphere({ variant }: { variant: "rig" | "reward" | "token" }) {
  return (
    <div className={`lp-atmosphere lp-atmosphere-${variant}`} aria-hidden="true">
      <div className="lp-atmosphere-light" />
      <svg className="lp-atmosphere-map" viewBox="0 0 1440 1000" preserveAspectRatio="none" focusable="false">
        <defs><linearGradient id={`bus-${variant}`} x1="0" y1="1" x2="1" y2="0"><stop stopColor="#53db72" stopOpacity="0" /><stop offset=".4" stopColor="#53db72" stopOpacity=".38" /><stop offset=".75" stopColor="#8fc59c" stopOpacity=".26" /><stop offset="1" stopColor="#53db72" stopOpacity="0" /></linearGradient></defs>
        <g className="lp-atmosphere-dust" fill="#90c99f">{DUST.map((d, i) => <rect key={i} x={d.x} y={d.y} width={d.size} height={d.size} opacity={d.opacity} />)}</g>
        <g className="lp-atmosphere-circuits" fill="none" stroke={`url(#bus-${variant})`} strokeWidth="1">
          <path d="M540 1020V895L610 825V735L770 575V405L965 210H1290L1380 120V-20" /><path d="M575 1020V910L645 840V750L805 590V420L980 245H1305L1415 135V-20" /><path d="M610 1020V925L680 855V765L840 605V435L995 280H1320L1450 150" />
          <path d="M0 835H220L350 705V520L455 415V150L605 0" /><path d="M0 865H235L380 720V535L485 430V165L650 0" />
          <path d="M830 1040V865L1010 685H1260L1460 485" /><path d="M865 1040V880L1025 720H1275L1460 535" />
        </g>
        <g className="lp-atmosphere-vias" fill="#141618" stroke="#5fad73" strokeWidth="1">
          <circle cx="770" cy="575" r="4" /><circle cx="965" cy="210" r="4" /><circle cx="1290" cy="210" r="4" /><circle cx="350" cy="520" r="4" /><circle cx="1010" cy="685" r="4" />
        </g>
      </svg>
      <div className="lp-atmosphere-grid" />
    </div>
  );
}
