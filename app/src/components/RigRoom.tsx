"use client";
import type { RigSnapshot } from "@/lib/season-model";

/**
 * The rig room (brief §1): every rig is an isometric machine drawn from its own state, in the language
 * of the tier render on the design board (design/launch/66-rig-tiers.webp): a coal tower whose amber
 * slats count the GPU tier, cyan fins for cooling tiers, and a glow that grows with active overclocks.
 * Pure SVG, no bitmaps, so a hundred rigs cost nothing and every one is different.
 */
export function RigRoom({ rigs, selected, onSelect }: { rigs: RigSnapshot[]; selected?: bigint; onSelect?: (id: bigint) => void }) {
  const cols = Math.max(2, Math.min(4, Math.ceil(Math.sqrt(Math.max(rigs.length, 1)))));
  return (
    <div
      className="relative bg-mine-bg border border-mine-line rounded-md overflow-hidden min-h-[380px]"
      style={{
        backgroundImage:
          "linear-gradient(var(--mine-line) 1px, transparent 1px), linear-gradient(90deg, var(--mine-line) 1px, transparent 1px)",
        backgroundSize: "56px 56px",
        backgroundPosition: "center",
      }}
    >
      <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at 70% 20%, rgba(237,233,225,0.06), transparent 55%), radial-gradient(ellipse at 40% 90%, rgba(242,169,59,0.07), transparent 60%)" }} />
      {rigs.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
          <svg width="160" height="120" viewBox="0 0 160 120" aria-hidden>
            <polygon points="80,36 136,66 80,96 24,66" fill="none" stroke="var(--mine-dim)" strokeWidth="1.5" strokeDasharray="5 5" />
            <polygon points="80,46 120,66 80,86 40,66" fill="rgba(242,169,59,0.06)" stroke="var(--ember-deep)" strokeWidth="1" strokeDasharray="3 4" />
          </svg>
          <div className="text-mine-dim text-[13px]">An empty floor. Activate a rig to put a machine on it.</div>
        </div>
      )}
      <div className="relative grid gap-x-6 gap-y-2 px-8 pt-10 pb-6 items-end" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {rigs.map((r) => <RigMachine key={String(r.id)} rig={r} selected={selected === r.id} onClick={() => onSelect?.(r.id)} scale={rigs.length <= 4 ? 1.35 : 1} />)}
      </div>
    </div>
  );
}

/** Isometric tower: width 64, depth 64, height by GPU tier; slats amber, fins cyan; glow by overclock. */
export function RigMachine({ rig, selected, onClick, scale = 1 }: { rig: RigSnapshot; selected?: boolean; onClick?: () => void; scale?: number }) {
  const active = !rig.state.inactive;
  const oc = active ? rig.state.activeOc : 0;
  const tier = rig.gpuTier;
  const slats = 1 + tier; // 1..6
  const h = 26 + slats * 14; // tower height
  const w = 44; // half-width of the top rhombus
  const d = 22; // half-depth
  const cx = 80;
  const baseY = 150;
  const topY = baseY - h;
  // isometric rhombus corners (left, front, right, back) at a given y
  const L = (y: number) => `${cx - w},${y - d}`;
  const F = (y: number) => `${cx},${y}`;
  const R = (y: number) => `${cx + w},${y - d}`;
  const B = (y: number) => `${cx},${y - 2 * d}`;
  const glow = oc > 0 ? 0.28 + oc * 0.18 : active ? 0.1 : 0;
  const slatColor = active ? (oc > 0 ? "#FFC46B" : "var(--ember)") : "var(--mine-line)";
  const body = active ? "#24211C" : "#1B1916";
  const bodyLight = active ? "#2E2A24" : "#201D19";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Rig ${rig.id}`}
      className={`relative mx-auto block focus:outline-none ${selected ? "drop-shadow-[0_0_0_2px_var(--signal)]" : ""}`}
      style={{ width: 160 * scale, height: 176 * scale }}
    >
      <svg width={160 * scale} height={176 * scale} viewBox="0 0 160 176" aria-hidden>
        <defs>
          <radialGradient id={`g${rig.id}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgb(242,169,59)" stopOpacity={glow} />
            <stop offset="100%" stopColor="rgb(242,169,59)" stopOpacity="0" />
          </radialGradient>
        </defs>
        {/* floor glow */}
        <ellipse cx={cx} cy={baseY - d + 6} rx={70} ry={30} fill={`url(#g${rig.id})`} />
        {/* base plate */}
        <polygon points={`${L(baseY + 6)} ${F(baseY + 6)} ${R(baseY + 6)} ${B(baseY + 6)}`} fill="#2A2721" stroke="var(--mine-line)" strokeWidth="1" />
        {/* left face */}
        <polygon points={`${L(topY)} ${F(topY)} ${F(baseY)} ${L(baseY)}`} fill={body} stroke="var(--mine-line)" strokeWidth="1" />
        {/* right face */}
        <polygon points={`${F(topY)} ${R(topY)} ${R(baseY)} ${F(baseY)}`} fill={bodyLight} stroke="var(--mine-line)" strokeWidth="1" />
        {/* top */}
        <polygon points={`${L(topY)} ${F(topY)} ${R(topY)} ${B(topY)}`} fill="#3A352E" stroke={selected ? "var(--signal)" : "#4A443B"} strokeWidth={selected ? 2 : 1} />
        {/* GPU slats on the left face: parallelograms following the face slant */}
        {Array.from({ length: slats }, (_, i) => {
          const y0 = baseY - 10 - i * 14; // bottom of slat at the front edge
          const sx = cx - 6, ex = cx - w + 6; // from near the front edge back toward the left corner
          const slope = d / w; // rise per px of x
          const yF = y0, yL = y0 - (sx - ex) * slope;
          return (
            <polygon
              key={i}
              points={`${ex},${yL} ${sx},${yF} ${sx},${yF - 7} ${ex},${yL - 7}`}
              fill={slatColor}
              opacity={active ? 0.95 : 0.5}
              style={oc > 0 ? { filter: "drop-shadow(0 0 4px rgba(242,169,59,0.9))" } : undefined}
            />
          );
        })}
        {/* cooling fins on the right face */}
        {Array.from({ length: rig.coolingTier * 3 }, (_, i) => {
          const x = cx + 8 + i * 11;
          const yTop = topY + 4 - (x - cx) * (d / w) + 6;
          return <rect key={i} x={x} y={yTop} width={4} height={h - 16} fill="var(--signal)" opacity={active ? 0.85 : 0.35} />;
        })}
        {/* overclock plume */}
        {oc > 0 && Array.from({ length: oc }, (_, i) => (
          <path key={i} d={`M${cx - 20 + i * 18} ${topY - 6} q 6 -18 0 -36`} stroke="rgba(255,196,107,0.55)" strokeWidth="6" strokeLinecap="round" fill="none" />
        ))}
        {/* status light on the front edge */}
        <circle cx={cx} cy={baseY - 5} r={2.5} fill={active ? "var(--signal)" : "var(--heat-hot)"} />
      </svg>
      <div className="absolute bottom-0 left-0 right-0 font-data text-[11px] text-mine-muted text-center">#{String(rig.id).padStart(4, "0")}{!active && " · stopped"}</div>
    </button>
  );
}
