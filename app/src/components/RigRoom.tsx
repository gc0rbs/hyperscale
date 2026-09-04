"use client";
import type { RigSnapshot } from "@/lib/season-model";

/**
 * Isometric rig room (brief §1, decision 2026-09-03): rigs are objects on a dark grid that glow when
 * overclocked and grow with GPU tier. CSS/SVG only, no WebGL.
 */
export function RigRoom({ rigs, selected, onSelect }: { rigs: RigSnapshot[]; selected?: bigint; onSelect?: (id: bigint) => void }) {
  const cols = Math.max(2, Math.ceil(Math.sqrt(Math.max(rigs.length, 1))));
  return (
    <div className="relative bg-mine-bg border border-mine-line rounded-md overflow-hidden min-h-[360px]" style={{ backgroundImage: "linear-gradient(var(--mine-line) 1px, transparent 1px), linear-gradient(90deg, var(--mine-line) 1px, transparent 1px)", backgroundSize: "48px 48px", backgroundPosition: "center" }}>
      <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at 50% 30%, rgba(242,169,59,0.08), transparent 60%)" }} />
      {rigs.length === 0 && <div className="absolute inset-0 flex items-center justify-center text-mine-dim text-[13px]">No rigs yet. Activate one to put a machine on the floor.</div>}
      <div className="relative grid gap-10 p-10" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, transform: "rotateX(55deg) rotateZ(-45deg)", transformStyle: "preserve-3d", transformOrigin: "50% 40%" }}>
        {rigs.map((r) => <Rig key={String(r.id)} rig={r} selected={selected === r.id} onClick={() => onSelect?.(r.id)} />)}
      </div>
    </div>
  );
}

function Rig({ rig, selected, onClick }: { rig: RigSnapshot; selected: boolean; onClick: () => void }) {
  const active = !rig.state.inactive;
  const oc = rig.state.activeOc;
  const height = 36 + rig.gpuTier * 10;
  const slots = 1 + rig.gpuTier;
  const glow = oc > 0 ? 0.25 + oc * 0.25 : active ? 0.15 : 0;
  return (
    <button type="button" onClick={onClick} aria-label={`Rig ${rig.id}`} className="relative w-[96px] h-[96px] mx-auto focus:outline-none" style={{ transformStyle: "preserve-3d" }}>
      <div className="absolute inset-0 rounded-sm" style={{ background: `radial-gradient(circle, rgba(242,169,59,${glow}) 0%, transparent 70%)`, transform: "translateZ(0)" }} />
      <div className="absolute left-4 right-4 bottom-4" style={{ height, transform: `translateZ(${height / 2}px)`, transformStyle: "preserve-3d" }}>
        <div className={`absolute inset-0 border ${selected ? "border-signal" : "border-mine-line"} ${active ? "bg-[#26221D]" : "bg-[#1A1815] opacity-60"}`} style={{ boxShadow: oc > 0 ? `0 0 ${12 + oc * 8}px rgba(242,169,59,${0.3 + oc * 0.15})` : "none" }}>
          <div className="absolute left-1 top-1 bottom-1 flex flex-col gap-[3px] justify-center">
            {Array.from({ length: slots }, (_, i) => <div key={i} className="w-[10px] h-[4px] rounded-[1px]" style={{ background: active ? (oc > 0 ? "var(--ember)" : "var(--ember-deep)") : "var(--mine-line)" }} />)}
          </div>
          {rig.coolingTier > 0 && <div className="absolute right-1 top-1 bottom-1 w-[10px] flex flex-col gap-[2px] justify-center">{Array.from({ length: rig.coolingTier }, (_, i) => <div key={i} className="h-[3px] bg-signal-deep" />)}</div>}
        </div>
      </div>
      <div className="absolute -bottom-1 left-0 right-0 font-data text-[10px] text-mine-muted text-center" style={{ transform: "rotateZ(45deg) rotateX(-55deg)" }}>#{String(rig.id).padStart(4, "0")}</div>
    </button>
  );
}
