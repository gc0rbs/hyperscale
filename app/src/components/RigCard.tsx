"use client";
import { useMemo } from "react";
import { TICKERS } from "@/lib/contracts";
import { formatHash, formatInt, formatRig } from "@/lib/format";
import { advance, fragmentsPerSecond, settle } from "@/lib/mine-math";
import type { RigSnapshot, SeasonSnapshot } from "@/lib/season-model";
import { Btn, Chip, Cost, HeatGauge, Label, Mono, OcSlots, Pips, Stat } from "./ui";

export type RigAction = { kind: "overclock" | "gpu" | "cooling" | "exit"; rig: RigSnapshot };

export function RigCard({ rig, snap, now, onAction, disabled }: { rig: RigSnapshot; snap: SeasonSnapshot; now: bigint; onAction: (a: RigAction) => void; disabled?: boolean }) {
  const p = snap.params;
  const { g } = advance(snap.config, snap.global, now);
  const live = useMemo(() => settle(snap.config, rig.state, g), [snap.config, rig.state, g]);
  const spb = p.shiftsPerBlock;
  const cur = Math.min(g.shift, spb * p.blocks - 1);
  const b = Math.floor(cur / spb);
  const hash = live.inactive ? 0n : live.baseHash + live.ocHash;
  const fps = g.closeX !== 0n || live.inactive ? 0 : fragmentsPerSecond(snap.config, hash, b);
  const earnedFrag = live.earned[b] / 10n ** 18n;
  const open = snap.phase === 2;
  const gpuCost = rig.gpuTier < 5 ? (rig.weight * BigInt(p.gpuCostBps[rig.gpuTier])) / 10_000n : 0n;
  const coolCost = rig.coolingTier < 3 ? (rig.weight * BigInt(p.coolCostBps[rig.coolingTier])) / 10_000n : 0n;
  const ocCost = (rig.weight * BigInt(p.ocCostBps)) / 10_000n;
  const canOc = open && !live.inactive && live.activeOc < p.maxActiveOc && live.heat + p.heatPerOc[live.coolingTier] <= p.heatMax;
  return (
    <div className={`bg-mine-panel border border-mine-line rounded-md p-5 flex flex-col gap-[18px] ${live.inactive ? "opacity-60" : ""}`} data-testid={`rig-${rig.id}`}>
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3"><div className="font-display uppercase tracking-[0.02em] text-[22px] font-semibold">Rig #{String(rig.id).padStart(4, "0")}</div><Chip>{rig.asset === 0 ? "RIG" : "LP"}</Chip>{live.inactive && <Chip>Stopped</Chip>}</div>
        <Mono className="text-mine-muted text-[12px]">stake {formatRig(rig.amount)} {rig.asset === 0 ? "RIG" : "LP"}</Mono>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Stat label="Hashrate" value={<>{formatHash(hash).replace(" H", "")}<span className="text-mine-muted text-[14px]"> H</span></>} big />
        <Stat label="Fragments / s" value={fps.toFixed(1)} sub="fixed for this block" />
        <Stat label="Earned this block" value={formatInt(earnedFrag)} sub={`${(Number(earnedFrag) / Number(p.fragPerToken)).toFixed(3)} ${TICKERS[b]}`} />
      </div>
      <div className="h-px bg-mine-line" />
      <div className="grid grid-cols-2 gap-4"><Pips on={rig.gpuTier} total={5} label="GPU" /><Pips on={rig.coolingTier} total={3} label="Cooling" /></div>
      <HeatGauge value={live.heat} ghost={p.heatPerOc[live.coolingTier]} max={p.heatMax} />
      <OcSlots active={live.activeOc} max={p.maxActiveOc} expiresLabel={`expire end of shift ${live.ocExpiryShift + 1}`} />
      {!live.inactive && (
        <div className="flex flex-col gap-2">
          <Btn tone="ember" className="h-11" disabled={disabled || !canOc} onClick={() => onAction({ kind: "overclock", rig })} title={!open ? "Overclocks unlock when the mine opens" : undefined}>
            ⚡ Overclock <Cost>burn {formatRig(ocCost)} RIG</Cost>
          </Btn>
          <div className="grid grid-cols-2 gap-2">
            <Btn className="px-2.5" disabled={disabled || rig.gpuTier >= 5 || !(snap.phase === 1 || open)} onClick={() => onAction({ kind: "gpu", rig })}>GPU → {rig.gpuTier + 1} <Cost>burn {formatRig(gpuCost)}</Cost></Btn>
            <Btn className="px-2.5" disabled={disabled || rig.coolingTier >= 3 || !(snap.phase === 1 || open)} onClick={() => onAction({ kind: "cooling", rig })}>Cooling → {rig.coolingTier + 1} <Cost>burn {formatRig(coolCost)}</Cost></Btn>
          </div>
          {(snap.phase === 1 || open) && <button className="text-[12px] text-signal self-end" onClick={() => onAction({ kind: "exit", rig })}>Exit rig · deposit back minus {p.earlyExitFeeBps / 100}%</button>}
        </div>
      )}
      <Label className="sr-only">live</Label>
    </div>
  );
}
