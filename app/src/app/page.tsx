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
      <section className="grid grid-cols-1 md:grid-cols-[3fr_2fr] gap-10 items-center">
        <div className="flex flex-col gap-6">
          <h1 className="font-display uppercase tracking-[0.02em] text-[56px] md:text-[80px] font-medium leading-[0.95]">Mine stock fragments</h1>
          <p className="text-mine-muted text-[18px] max-w-[520px]">Stake RIG. Run rigs. Four blocks, then the mine closes forever. Blocks are found by work, not by the clock.</p>
          <div className="flex gap-3"><Link href="/mine/new"><Btn tone="ember" className="h-12 px-6">Activate a rig</Btn></Link><Link href="/mine"><Btn className="h-12 px-6">Open the mine</Btn></Link></div>
          <div className="flex flex-col gap-2 max-w-[520px]"><Progress pct={closed ? 100 : pct} ticks={8} head={!closed && !preOpen} /><div className="flex justify-between"><Mono className="text-mine-muted text-[12px]">{preOpen ? `opens in ${formatEta(Number(snap.params.openTime - now))}` : closed ? "mine sealed" : `block ${Math.floor(Math.min(g.shift, 31) / 8) + 1} of 4 · ${pct.toFixed(0)}%`}</Mono><Mono className="text-mine-muted text-[12px]">{preOpen || closed || e.idle ? "" : `est. ${formatEta(Number(e.toClose))} to close`}</Mono></div></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {TICKERS.map((t, i) => (
            <div key={t} className="bg-mine-panel border border-mine-line rounded-md p-4 flex flex-col gap-2">
              <Mono className="text-mine-dim text-[12px]">0{i + 1}</Mono>
              <div className="font-display uppercase text-[28px] font-medium">{t}</div>
              <Mono className="text-mine-muted text-[12px]">{Number(snap.params.poolTokens[i] / 10n ** 14n) / 10_000} tokens · {Number((snap.params.difficulty[i] * 100n) / totalWork)}% of work</Mono>
            </div>
          ))}
        </div>
      </section>
      <section className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {[["01", "Stake", "Deposit RIG or RIG/USDC LP to activate a rig. Your deposit sets its hashrate and comes back in full when the mine closes."], ["02", "Upgrade", "Burn RIG for GPU tiers, cooling and overclocks. Every burn is permanent and every upgrade is priced as a share of your stake."], ["03", "Claim", "Each block pays a fixed number of fragments per hash-second. When its work is done, claim, then redeem a million fragments for one Stock Token."]].map(([n, h, b]) => (
          <div key={n} className="flex gap-4"><Mono className="text-signal text-[40px] leading-none">{n}</Mono><div className="flex flex-col gap-2"><div className="font-display uppercase text-[22px] font-semibold">{h}</div><p className="text-mine-muted text-[14px]">{b}</p></div></div>
        ))}
      </section>
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4 border-t border-mine-line pt-8">
        <div className="flex flex-col gap-1"><Label>Total hash</Label><Mono className="text-[22px]">{formatHash(g.totalHash)}</Mono></div>
        <div className="flex flex-col gap-1"><Label>Shift</Label><Mono className="text-[22px]">{Math.min(g.shift, 32)} / 32</Mono></div>
        <div className="flex flex-col gap-1"><Label>Next block</Label><Mono className="text-[22px] text-signal">{preOpen || closed || e.idle ? "–" : formatEta(Number(e.toBlockFound))}</Mono><span className="text-mine-dim text-[11px]">est.</span></div>
        <div className="flex flex-col gap-1"><Label>Status</Label><Mono className="text-[22px]">{["Funding", "Pre-open", "Open", "Closed", "Cancelled"][snap.phase]}</Mono></div>
      </section>
    </div>
  );
}
