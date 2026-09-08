"use client";
import { formatCompute, formatRig, formatThroughput } from "@/lib/format";
import { coolingCostOf, gpuCostOf, overclockCostOf, shareOf, type RoundRig, type RoundSnapshot } from "@/lib/round-model";
import { Btn, Chip, Cost, HeatGauge, Mono, OcSlots, Pips, Stat } from "../ui";
import { Icon } from "../Icons";

/** "500.00 TFLOPS" → number with a small unit so it fits the card column. */
const split = (v: string) => { const [n, u] = v.split(" "); return <>{n}<span className="text-mine-muted text-[13px]"> {u}</span></>; };

export type RoundRigAction = { kind: "overclock" | "gpu" | "cooling" | "exit" | "withdraw"; rig: RoundRig };

/** A node in the rounds mine: same card as the season RigCard, with per-round figures and no close/withdraw states. */
export function RoundRigCard({ rig, snap, onAction }: { rig: RoundRig; snap: RoundSnapshot; onAction: (a: RoundRigAction) => void }) {
  const p = snap.params;
  const off = rig.inactive;
  const frozen = snap.halted || snap.paused;
  const share = shareOf([rig.work], snap.roundWork);
  const canOc = !off && !frozen && rig.activeOc < p.maxActiveOc && rig.heat + p.heatPerOc[rig.coolingTier] <= p.heatMax;
  const gpuCost = gpuCostOf(p, rig);
  const coolCost = coolingCostOf(p, rig);
  const ocCost = overclockCostOf(p, rig);
  return (
    <div className={`bg-mine-panel border border-mine-line border-t-2 border-t-ember rounded-md p-5 flex flex-col gap-[18px] ${off ? "opacity-60" : ""}`} data-testid={`rig-${rig.id}`}>
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3"><div className="font-display leading-none uppercase tracking-[0.02em] text-[40px] font-semibold">Node #{String(rig.id).padStart(4, "0")}</div>{off && <Chip>Decommissioned</Chip>}</div>
        <Mono className="text-mine-muted text-[12px]">stake {formatRig(rig.amount)} RIG</Mono>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Stat label="Throughput" value={split(formatThroughput(off ? 0n : rig.hash))} />
        <Stat label="Served this round" value={split(formatCompute(rig.work))} sub="compute in round" />
        <Stat label="Share of round" value={`${(share * 100).toFixed(2)}%`} sub="of this round's pot" />
      </div>
      <div className="h-px bg-mine-line" />
      <div className="grid grid-cols-2 gap-4"><Pips on={rig.gpuTier} total={5} label="GPU" caption={`GPU Gen ${rig.gpuTier}`} /><Pips on={rig.coolingTier} total={3} label="Cooling" caption={`Cooling ${["Air", "Liquid loop", "Direct-to-chip", "Immersion"][rig.coolingTier] ?? rig.coolingTier}`} /></div>
      <HeatGauge value={rig.heat} ghost={p.heatPerOc[rig.coolingTier]} max={p.heatMax} label="Thermal load" />
      <OcSlots active={rig.activeOc} max={p.maxActiveOc} expiresLabel={`expire end of round ${rig.ocExpiryRound}`} />
      {snap.halted && !off && (
        <div className="flex flex-col gap-2" data-testid={`halt-${rig.id}`}>
          <div className="text-[12px] text-ember">The mine is halted. Your full stake of {formatRig(rig.amount)} RIG comes back, no fee.</div>
          <Btn tone="signal" className="h-11" onClick={() => onAction({ kind: "withdraw", rig })}>Emergency withdraw {formatRig(rig.amount)} RIG</Btn>
        </div>
      )}
      {!snap.halted && !off && (
        <div className="flex flex-col gap-2">
          <Btn tone="ember" className="h-11" disabled={!canOc} onClick={() => onAction({ kind: "overclock", rig })} title={rig.heat + p.heatPerOc[rig.coolingTier] > p.heatMax ? "Thermal load would exceed the max; wait for the round boundary or buy cooling" : undefined}>
            <Icon name="overclock" size={16} tone="currentColor" /> Overclock <Cost>burn {formatRig(ocCost)} RIG</Cost>
          </Btn>
          <div className="grid grid-cols-2 gap-2">
            <Btn className="px-2.5" disabled={frozen || rig.gpuTier >= 5} onClick={() => onAction({ kind: "gpu", rig })}><Icon name="rig" size={16} /> Gen {rig.gpuTier + 1} <Cost>burn {formatRig(gpuCost)}</Cost></Btn>
            <Btn className="px-2.5" disabled={frozen || rig.coolingTier >= 3} onClick={() => onAction({ kind: "cooling", rig })}><Icon name="cooling" size={16} /> Cooling {rig.coolingTier + 1} <Cost>burn {formatRig(coolCost)}</Cost></Btn>
          </div>
          <button className="text-[12px] text-signal self-end disabled:opacity-40" disabled={frozen} onClick={() => onAction({ kind: "exit", rig })}>Decommission node · stake back minus {p.exitFeeBps / 100}%</button>
        </div>
      )}
    </div>
  );
}
