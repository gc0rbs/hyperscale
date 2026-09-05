"use client";
import { formatEta, formatHash } from "@/lib/format";
import { advance, blockProgressBps, eta as etaOf } from "@/lib/mine-math";
import type { SeasonSnapshot } from "@/lib/season-model";
import { Label, Mono, Progress, Stat } from "./ui";

export function BlockCard({ snap, now, myHash, compact = false }: { snap: SeasonSnapshot; now: bigint; myHash: bigint; compact?: boolean }) {
  const { g } = advance(snap.config, snap.global, now);
  const closed = g.closeX !== 0n;
  const spb = snap.params.shiftsPerBlock;
  const cur = Math.min(g.shift, spb * snap.params.blocks - 1);
  const b = Math.floor(cur / spb);
  const pct = blockProgressBps(snap.config, g) / 100;
  const e = etaOf(snap.config, snap.global, now);
  const share = g.totalHash > 0n ? Number((myHash * 10_000n) / g.totalHash) / 100 : 0;
  const pool = Number(snap.params.poolTokens[b] / 10n ** 14n) / 10_000;
  const shiftInBlock = closed ? spb : (g.shift % spb) + 1;
  return (
    <div className="bg-mine-panel border border-mine-line rounded-md p-5 flex flex-col gap-5" data-testid="block-card">
      <div className="flex justify-between items-end">
        <div className="flex flex-col gap-1">
          <Label>Block {b + 1} of {snap.params.blocks}</Label>
          <div className="flex gap-3.5 items-baseline flex-wrap">
            <div className={`font-display uppercase tracking-[0.02em] font-bold ${compact ? "text-[64px]" : "text-[80px]"} leading-none`}>{snap.symbols[b]}</div>
            <Mono className="text-mine-muted text-[14px] whitespace-nowrap">pool {pool} {snap.symbols[b]}</Mono>
          </div>
        </div>
        <div className="flex flex-col gap-1 items-end shrink-0"><Label>Shift</Label><Mono className="text-[22px] whitespace-nowrap">{shiftInBlock}<span className="text-mine-muted"> / {spb}</span></Mono></div>
      </div>
      <div className="flex flex-col gap-2.5">
        <Progress pct={pct} ticks={spb} head={!closed} />
        <div className="flex justify-between flex-wrap gap-x-3"><Mono className="text-mine-muted text-[12px] whitespace-nowrap">{pct.toFixed(0)}% of block work done</Mono><Mono className="text-mine-muted text-[12px] whitespace-nowrap">total hash {formatHash(g.totalHash)}</Mono></div>
      </div>
      <div className={`grid gap-4 ${compact ? "grid-cols-3" : "grid-cols-2 md:grid-cols-4"}`}>
        <Stat label="Next shift" value={e.idle ? "paused" : formatEta(Number(e.toShiftEnd))} sub="est. at current hash" est />
        <Stat label="Block found" value={e.idle ? "paused" : formatEta(Number(e.toBlockFound))} sub="est." est />
        {!compact && <Stat label="Mine closes" value={e.idle ? "paused" : formatEta(Number(e.toClose))} sub="est. · block 4 found" est />}
        <Stat label="Your share" value={`${share.toFixed(1)}%`} sub="of total hash" />
      </div>
    </div>
  );
}
