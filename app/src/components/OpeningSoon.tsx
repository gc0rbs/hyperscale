"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { RIG_ADDRESS, RIG_BUY_URL } from "@/lib/token";
import { Gem } from "./Gem";
import { Label, Mono } from "./ui";

interface Props {
  /** unix seconds the mine opens; omit while the season is not created yet */
  openTime?: number;
  /** chain time in seconds when the caller tracks it; else the local clock is used */
  now?: number;
  symbols: readonly string[];
  /** formatted pool size per block, same order as symbols */
  pool?: string[];
  /** share of total work per block, in percent */
  workShare?: number[];
  staked?: string;
  estRun?: string;
  /** show the "Activate a rig" action (a season exists and rigs can be pre-staked) */
  canActivate?: boolean;
  /** the season exists but the vault is not funded yet: rigs cannot activate until it is */
  funding?: boolean;
  embedded?: boolean;
}

function useTick(enabled: boolean) {
  const [, setT] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setT((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [enabled]);
}

const seg = (n: number) => String(Math.max(0, n)).padStart(2, "0");

/** The pre-open screen: before the season exists (no countdown) and between creation and openTime. */
export function OpeningSoon({ openTime, now, symbols, pool, workShare, staked, estRun, canActivate = false, funding = false, embedded = false }: Props) {
  useTick(openTime !== undefined && now === undefined);
  const t = now ?? Math.floor(Date.now() / 1000);
  const secs = openTime !== undefined ? Math.max(0, openTime - t) : null;
  const d = secs === null ? 0 : Math.floor(secs / 86400);
  const h = secs === null ? 0 : Math.floor((secs % 86400) / 3600);
  const m = secs === null ? 0 : Math.floor((secs % 3600) / 60);
  const s = secs === null ? 0 : secs % 60;
  const opensAt = openTime !== undefined ? new Date(openTime * 1000) : null;

  return (
    <section className={`opening relative overflow-hidden ${embedded ? "rounded-md border border-mine-line" : "min-h-[calc(100vh-var(--lp-header-height))]"} bg-mine-bg text-mine-fg`} data-testid="opening-soon">
      <div className="opening-glow" aria-hidden />
      <div className="opening-grid" aria-hidden />
      <div className={`relative flex flex-col gap-8 ${embedded ? "p-6 md:p-10" : "px-6 md:px-12 py-14 md:py-20 max-w-[1240px] mx-auto"}`}>
        <div className="flex items-center gap-3 text-[11px] tracking-[0.1em] uppercase font-data text-mine-muted">
          <span className="opening-dot" aria-hidden />{secs === null ? "Preparing the mine · Robinhood Chain" : funding ? "Funding the pool · Robinhood Chain" : secs === 0 ? "Opening · waiting for the first shift" : "Pre-open · Robinhood Chain"}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-10 items-end">
          <div className="flex flex-col gap-5">
            <h1 className="font-display uppercase leading-[0.86] font-bold text-[clamp(88px,13vw,180px)]">
              {secs === null ? <>The mine<br /><span className="text-ember">opens soon.</span></> : secs === 0 ? <>Doors<br /><span className="text-signal">opening.</span></> : <>Opens in<br /><span className="text-ember">{d > 0 ? `${d} day${d === 1 ? "" : "s"}` : h > 0 ? `${h} hour${h === 1 ? "" : "s"}` : `${m} min`}</span></>}
            </h1>
            <p className="text-mine-muted text-[15px] leading-relaxed max-w-[520px]">
              {secs === null
                ? "Four blocks, four Stock Tokens, one mine that closes forever when the last block is found. Rigs go on sale when the season is created; get your $RIG ready."
                : funding
                  ? "The season is on chain and the reward pool is being deposited into the vault. Rig activation opens the moment the pool is in; get your $RIG ready."
                  : "Rigs activated before the doors open start working the very first second. Every rig earns for its own hash-work, so early is never crowded out."}
            </p>
            <div className="flex flex-wrap gap-3 pt-1">
              {canActivate && <Link href="/mine/new" className="h-12 px-5 rounded-sm inline-flex items-center gap-3 bg-ember text-[#1A1408] text-[14px] font-semibold" data-testid="opening-activate">Activate a rig <span aria-hidden>↗</span></Link>}
              {RIG_BUY_URL && <a href={RIG_BUY_URL} target="_blank" rel="noopener noreferrer" className={`h-12 px-5 rounded-sm inline-flex items-center gap-3 text-[14px] font-semibold ${canActivate ? "border border-mine-line text-mine-fg" : "bg-ember text-[#1A1408]"}`} data-testid="opening-buy">Get $RIG <span aria-hidden>↗</span></a>}
              <Link href="/#how-it-works" className="h-12 px-5 rounded-sm inline-flex items-center gap-3 border border-mine-line text-mine-fg text-[14px] font-semibold">How it works</Link>
            </div>
            {RIG_ADDRESS && <Mono className="text-[11px] text-mine-dim break-all">$RIG · {RIG_ADDRESS}</Mono>}
          </div>

          <div className="flex flex-col gap-6">
            {secs !== null ? (
              <div className="grid grid-cols-4 gap-2" role="timer" aria-live="off" data-testid="opening-countdown">
                {[["days", d], ["hours", h], ["min", m], ["sec", s]].map(([k, v]) => (
                  <div key={k as string} className="opening-cell flex flex-col items-center gap-1 py-4 border border-mine-line bg-mine-panel/70 rounded-sm">
                    <Mono className="font-display text-[clamp(44px,6vw,80px)] leading-none font-bold text-mine-fg">{seg(v as number)}</Mono>
                    <Label className="text-mine-dim">{k as string}</Label>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-5 border border-mine-line bg-mine-panel/70 rounded-sm p-5">
                <Gem size={56} />
                <div className="flex flex-col gap-1"><Label>What gets mined</Label><div className="text-[14px] text-mine-muted leading-relaxed">1,000,000 fragments make one Stock Token. Pool sizes are published when the season is created.</div></div>
              </div>
            )}
            {(staked || estRun || opensAt) && (
              <div className="grid grid-cols-3 gap-4">
                {opensAt && <div className="flex flex-col gap-1"><Label>Opens</Label><Mono className="text-[14px]">{opensAt.toISOString().slice(0, 16).replace("T", " ")} UTC</Mono></div>}
                {staked && <div className="flex flex-col gap-1"><Label>Staked so far</Label><Mono className="text-[14px]">{staked}</Mono></div>}
                {estRun && <div className="flex flex-col gap-1"><Label>Would run</Label><Mono className="text-[14px] text-signal">{estRun}</Mono></div>}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2" data-testid="opening-blocks">
          {symbols.map((sym, i) => (
            <div key={sym} className="opening-block relative flex flex-col gap-3 p-4 border border-mine-line bg-mine-panel/60 rounded-sm" style={{ animationDelay: `${i * 140}ms` }}>
              <div className="flex justify-between items-baseline"><Mono className="text-mine-dim text-[11px]">BLOCK 0{i + 1}</Mono>{workShare && <Mono className="text-mine-dim text-[11px]">{workShare[i]}% of work</Mono>}</div>
              <div className="font-display uppercase leading-none font-semibold text-[clamp(40px,5vw,64px)]">{sym}</div>
              <Mono className="text-[13px] text-mine-muted">{pool ? `${pool[i]} ${sym} in the pool` : "pool published at creation"}</Mono>
              <div className="opening-bar" aria-hidden><span style={{ width: `${workShare ? workShare[i] : 25}%` }} /></div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
