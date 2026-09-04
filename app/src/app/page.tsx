"use client";
import Link from "next/link";
import { SeasonShell } from "@/components/SeasonShell";
import { Btn, Label, Mono, Progress } from "@/components/ui";
import { TICKERS } from "@/lib/contracts";
import { formatEta, formatHash } from "@/lib/format";
import { advance, blockProgressBps, eta as etaOf } from "@/lib/mine-math";
import { useChainNow } from "@/lib/use-now";
import type { SeasonSnapshot } from "@/lib/season-model";

export default function Home() {
  return (
    <SeasonShell>
      {(snap) => <Landing snap={snap} />}
    </SeasonShell>
  );
}

function Landing({ snap }: { snap: SeasonSnapshot }) {
  const now = useChainNow(snap, 1000);
  const { g } = advance(snap.config, snap.global, now);
  const e = etaOf(snap.config, snap.global, now);
  const closed = g.closeX !== 0n;
  const pct = blockProgressBps(snap.config, g) / 100;
  const totalWork = snap.params.difficulty.reduce((a, b) => a + b, 0n);
  const preOpen = snap.phase === 1;
  return (
    <div className="px-4 md:px-8 py-16 max-w-[1200px] mx-auto flex flex-col gap-16">
      <section className="relative -mx-4 md:-mx-8 -mt-16 min-h-[560px] md:min-h-[640px] flex items-center overflow-hidden">
        {/* Purpose-built hero render (design/launch/69-hero-rigs.webp): three rig tiers, composition leaves the left third dark for the headline. */}
        <div className="absolute inset-0 bg-[url('/art/hero-rigs.webp')] bg-cover bg-[position:70%_50%] md:bg-right" aria-hidden />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,var(--mine-bg)_0%,var(--mine-bg)_32%,rgba(23,21,18,0.55)_60%,rgba(23,21,18,0.15)_100%)]" aria-hidden />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-[linear-gradient(180deg,transparent,var(--mine-bg))]" aria-hidden />
        <div className="relative px-4 md:px-8 py-16 flex flex-col gap-7 max-w-[720px]">
          <h1 className="font-display uppercase tracking-[0.02em] text-[96px] md:text-[150px] font-bold leading-[0.88]">Mine stock fragments</h1>
          <p className="text-mine-muted text-[18px] max-w-[520px]">Stake RIG. Run rigs. Four blocks, then the mine closes. Blocks are found by work, not by the clock; a season lasts a few hours.</p>
          <div className="flex gap-3"><Link href="/mine/new"><Btn tone="ember" className="h-12 px-6">Activate a rig</Btn></Link><Link href="/mine"><Btn className="h-12 px-6">Open the mine</Btn></Link></div>
          <div className="flex flex-col gap-2 max-w-[520px]"><Progress pct={closed ? 100 : pct} ticks={8} head={!closed && !preOpen} /><div className="flex justify-between"><Mono className="text-mine-muted text-[12px]">{preOpen ? `opens in ${formatEta(Number(snap.params.openTime - now))}` : closed ? "mine sealed" : `block ${Math.floor(Math.min(g.shift, 31) / 8) + 1} of 4 · ${pct.toFixed(0)}%`}</Mono><Mono className="text-mine-muted text-[12px]">{preOpen || closed || e.idle ? "" : `est. ${formatEta(Number(e.toClose))} to close`}</Mono></div></div>
        </div>
      </section>
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 -mt-6">
        {TICKERS.map((t, i) => (
          <div key={t} className="bg-mine-panel border border-mine-line rounded-md px-5 pt-4 pb-5 flex flex-col gap-1">
            <div className="flex justify-between"><Mono className="text-mine-dim text-[12px]">Block 0{i + 1}</Mono><Mono className="text-mine-dim text-[12px]">{Number((snap.params.difficulty[i] * 100n) / totalWork)}% of work</Mono></div>
            <div className="font-display leading-none uppercase text-[80px] font-bold text-ember">{t}</div>
            <Mono className="text-mine-muted text-[13px]">{Number(snap.params.poolTokens[i] / 10n ** 14n) / 10_000} {t} in the pool</Mono>
          </div>
        ))}
      </section>
      <section className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {[["01", "Stake", "Deposit RIG or RIG/USDC LP to activate a rig. Your deposit sets its hashrate and comes back in full when the mine closes."], ["02", "Upgrade", "Burn RIG for GPU tiers, cooling and overclocks. Every burn is permanent and every upgrade is priced as a share of your stake."], ["03", "Claim", "Each block pays a fixed number of fragments per hash-second. When its work is done, claim, then redeem a million fragments for one Stock Token."]].map(([n, h, b]) => (
          <div key={n} className="flex gap-4"><Mono className="text-signal text-[56px] leading-none">{n}</Mono><div className="flex flex-col gap-2"><div className="font-display uppercase text-[40px] font-semibold">{h}</div><p className="text-mine-muted text-[14px]">{b}</p></div></div>
        ))}
      </section>
      <section className="flex gap-6 text-[13px] text-mine-muted"><Link href="/how-it-works" className="hover:text-mine-fg">How rewards work</Link><Link href="/terms" className="hover:text-mine-fg">Terms</Link><span className="ml-auto text-mine-dim">Not available in the US, Canada, the UK or Switzerland.</span></section>
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4 border-t border-mine-line pt-8">
        <div className="flex flex-col gap-1"><Label>Total hash</Label><Mono className="text-[22px]">{formatHash(g.totalHash)}</Mono></div>
        <div className="flex flex-col gap-1"><Label>Shift</Label><Mono className="text-[22px]">{Math.min(g.shift, 32)} / 32</Mono></div>
        <div className="flex flex-col gap-1"><Label>Next block</Label><Mono className="text-[22px] text-signal">{preOpen || closed || e.idle ? "–" : formatEta(Number(e.toBlockFound))}</Mono><span className="text-mine-dim text-[11px]">est.</span></div>
        <div className="flex flex-col gap-1"><Label>Status</Label><Mono className="text-[22px]">{["Funding", "Pre-open", "Open", "Closed", "Cancelled"][snap.phase]}</Mono></div>
      </section>
    </div>
  );
}
