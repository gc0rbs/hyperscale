"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useDeployment } from "@/app/providers";
import { useMyRigs } from "@/lib/use-season";
import { useChainNow } from "@/lib/use-now";
import { useActiveAddress } from "@/lib/use-account";
import { advance, eta as etaOf, settle } from "@/lib/mine-math";
import { formatEta, formatHash, formatInt, formatRig } from "@/lib/format";
import { TICKERS } from "@/lib/contracts";
import type { SeasonSnapshot } from "@/lib/season-model";
import { BlockCard } from "./BlockCard";
import { RigCard, type RigAction } from "./RigCard";
import { PurchaseSheet } from "./PurchaseSheet";
import { HashStream } from "./HashStream";
import { RigRoom } from "./RigRoom";
import { FoundBanner } from "./FoundBanner";
import { Btn, Chip, Label, Mono, Panel, Stat } from "./ui";

export function MineView({ snap }: { snap: SeasonSnapshot }) {
  const dep = useDeployment();
  const now = useChainNow(snap);
  const account = useActiveAddress();
  const { rigs, refetch } = useMyRigs(dep.mine, snap);
  const [action, setAction] = useState<RigAction | null>(null);
  const [dismissed, setDismissed] = useState<number>(-1);
  const { g } = advance(snap.config, snap.global, now);
  const e = etaOf(snap.config, snap.global, now);
  const p = snap.params;
  const spb = p.shiftsPerBlock;
  const closed = g.closeX !== 0n;
  const curBlock = Math.min(Math.floor(g.shift / spb), p.blocks - 1);

  const live = useMemo(() => rigs.map((r) => ({ r, s: settle(snap.config, r.state, g) })), [rigs, snap.config, g]);
  const myHash = live.reduce((a, { s }) => a + (s.inactive ? 0n : s.baseHash + s.ocHash), 0n);
  const claimable = useMemo(() => {
    const out: { b: number; frags: bigint }[] = [];
    for (let b = 0; b < p.blocks; b++) {
      const found = (snap.global.shiftEndX[(b + 1) * spb - 1] ?? 0n) !== 0n || g.shiftEndX[(b + 1) * spb - 1] !== undefined || closed;
      if (!found) continue;
      const frags = live.reduce((a, { s }) => a + s.earned[b] / 10n ** 18n, 0n);
      if (frags > 0n) out.push({ b, frags });
    }
    return out;
  }, [live, snap.global.shiftEndX, g.shiftEndX, closed, p.blocks, spb]);
  const justFound = claimable.find((c) => c.b === curBlock - 1 && c.b !== dismissed);
  const longHaul = !closed && !e.idle && Number(e.toShiftEnd) > 2 * 3600;

  const phaseChip = snap.phase === 1 ? <Chip tone="signal">Pre-open</Chip> : closed ? <Chip>Mine sealed</Chip> : snap.phase === 4 ? <Chip tone="ember">Cancelled</Chip> : <Chip tone="signal">{longHaul ? "Mine open · long haul" : "Mine open"}</Chip>;

  return (
    <>
      {justFound && <FoundBanner blockIdx={justFound.b} fragments={justFound.frags} fragPerToken={p.fragPerToken} onDismiss={() => setDismissed(justFound.b)} />}
      <div className="p-4 md:px-8 md:py-6 grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-6">
        <div className="flex flex-col gap-5">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3.5"><div className="font-display uppercase tracking-[0.02em] text-[22px] font-semibold">Season {dep.seasonId + 1}</div>{phaseChip}</div>
            <Mono className="text-mine-muted text-[12px] hidden md:block">{closed ? `closed · redemption open` : `block ${curBlock + 1} pays ${(Number(snap.config.ratePerWork[curBlock]) / 1e18).toExponential(3)} frag per hash-second · ends at block 4 or ${capClock(snap)} at the latest`}</Mono>
          </div>

          {snap.phase === 1 && <PreOpenCard snap={snap} now={now} />}
          {closed && <ClosedCard snap={snap} now={now} closeX={g.closeX} shift={g.shift} />}
          {snap.phase !== 1 && !closed && (
            longHaul ? <LongHaulCard snap={snap} now={now} myHash={myHash} /> : <BlockCard snap={snap} now={now} myHash={myHash} />
          )}

          {!longHaul && snap.phase !== 1 && !closed && <RigRoom rigs={rigs} />}

          {!account && <Panel className="text-mine-muted text-[14px]">Connect a wallet to see your rigs.</Panel>}
          {account && rigs.length === 0 && (
            <Panel className="flex items-center justify-between gap-4"><div className="text-mine-muted text-[14px]">You have no rigs in this season.</div><Link href="/mine/new"><Btn tone="ember">Activate a rig</Btn></Link></Panel>
          )}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            {rigs.map((r) => <RigCard key={String(r.id)} rig={r} snap={snap} now={now} onAction={setAction} disabled={closed || snap.phase === 4} />)}
          </div>
        </div>

        <div className="flex flex-col gap-5 lg:pt-[42px]">
          <Panel className="flex flex-col gap-4">
            <Label>Your position</Label>
            <div className="grid grid-cols-2 gap-4">
              <Stat label="Your hash" value={formatHash(myHash)} />
              <Stat label="Share of mine" value={g.totalHash > 0n ? `${(Number((myHash * 10_000n) / g.totalHash) / 100).toFixed(1)}%` : "–"} />
              <Stat label="Rigs" value={String(rigs.filter((r) => !r.state.inactive).length)} />
              <Stat label="Mine closes" value={closed ? "closed" : e.idle ? "paused" : formatEta(Number(e.toClose))} sub="est." est />
            </div>
            <div className="h-px bg-mine-line" />
            <div className="flex justify-between items-center"><div className="text-mine-muted text-[13px]">Add capital with another rig</div><Link href="/mine/new" className="text-[13px] text-signal">Activate a rig</Link></div>
          </Panel>
          <Panel className="flex flex-col gap-2">
            <Label>Found · claimable</Label>
            {claimable.length === 0 && <div className="text-mine-muted text-[13px] pt-2">Nothing found yet. Blocks unlock when their work is done.</div>}
            {claimable.map((c) => (
              <div key={c.b} className="flex justify-between items-center py-2.5 border-t border-mine-line">
                <div><div className="font-display uppercase text-[18px] font-semibold">{TICKERS[c.b]}</div><Mono className="text-mine-muted text-[12px]">{formatInt(c.frags)} frag · {(Number(c.frags) / Number(p.fragPerToken)).toFixed(3)} {TICKERS[c.b]}</Mono></div>
                <Link href="/claim"><Btn tone="signal" className="h-[34px]">Claim</Btn></Link>
              </div>
            ))}
          </Panel>
          {!longHaul && snap.phase !== 1 && !closed && <HashStream hashWad={myHash} />}
          {longHaul && <NotifyCard />}
        </div>
      </div>
      {action && <PurchaseSheet action={action} snap={snap} now={now} onClose={() => setAction(null)} onDone={() => { setAction(null); refetch(); }} />}
    </>
  );
}

function PreOpenCard({ snap, now }: { snap: SeasonSnapshot; now: bigint }) {
  const secs = Number(snap.params.openTime - now);
  const totalWork = snap.params.difficulty.reduce((a, b) => a + b, 0n);
  const estLen = snap.global.totalHash > 0n ? Number(totalWork / snap.global.totalHash) : 0;
  return (
    <Panel className="flex flex-col gap-6 p-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="flex flex-col gap-1"><Label>Mine opens in</Label><div className="font-display uppercase text-[56px] md:text-[72px] font-medium leading-none">{formatEta(secs)}</div><div className="text-mine-muted text-[13px]">Rigs activated now start working the moment it opens.</div></div>
        <div className="flex flex-col gap-1"><Label>If it opened now, the season would run</Label><div className="font-display uppercase text-[56px] md:text-[72px] font-medium leading-none text-signal">{estLen ? `~${formatEta(estLen)}` : "–"}</div><div className="text-mine-muted text-[13px]">estimate from {formatHash(snap.global.totalHash)} staked so far</div></div>
      </div>
      <div className="h-px bg-mine-line" />
      <div className="flex flex-col">
        <div className="flex justify-between"><Label>Four blocks, four stocks</Label></div>
        {TICKERS.map((t, i) => (
          <div key={t} className="flex justify-between items-center py-3 border-t border-mine-line first:border-0">
            <div className="flex gap-3.5 items-center"><Mono className="text-mine-dim text-[12px]">0{i + 1}</Mono><div className="font-display uppercase text-[22px] font-semibold">{t}</div></div>
            <Mono className="text-mine-muted text-[13px]">{Number(snap.params.poolTokens[i] / 10n ** 14n) / 10_000} {t}</Mono>
            <Mono className="text-mine-dim text-[12px]">{Number((snap.params.difficulty[i] * 10_000n) / totalWork) / 100}% of work</Mono>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function LongHaulCard({ snap, now, myHash }: { snap: SeasonSnapshot; now: bigint; myHash: bigint }) {
  const e = etaOf(snap.config, snap.global, now);
  const { g } = advance(snap.config, snap.global, now);
  const spb = snap.params.shiftsPerBlock;
  const b = Math.floor(Math.min(g.shift, spb * 4 - 1) / spb);
  return (
    <Panel className="flex flex-col gap-6 p-8">
      <BlockCard snap={snap} now={now} myHash={myHash} compact />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
        <div className="flex flex-col gap-1"><Label>Block {b + 1} found</Label><div className="font-display uppercase text-[72px] font-medium leading-none text-signal">{formatEta(Number(e.toBlockFound))}</div><div className="text-mine-muted text-[13px]">estimate at the current {formatHash(g.totalHash)} total. Anyone joining or overclocking changes it.</div></div>
        <div className="grid grid-cols-2 gap-4"><Stat label="Next shift" value={formatEta(Number(e.toShiftEnd))} sub="est." est /><Stat label="Mine closes" value={formatEta(Number(e.toClose))} sub="est." est /></div>
      </div>
      <div className="text-mine-muted text-[13px]">A slow mine rewards permanent upgrades over overclocks: a GPU tier bought now covers most of the remaining work.</div>
    </Panel>
  );
}

/** Wall-clock time of the season's cap (openTime + maxDuration), local HH:MM. */
function capClock(snap: SeasonSnapshot) {
  const t = Number(snap.params.openTime + snap.params.maxDurationSeconds) * 1000;
  return new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function ClosedCard({ snap, now, closeX, shift }: { snap: SeasonSnapshot; now: bigint; closeX: bigint; shift: number }) {
  const closeSec = closeX / 10n ** 18n;
  const ran = Number(closeSec - snap.params.openTime);
  const blocksFound = Math.min(Math.floor(shift / snap.params.shiftsPerBlock), 4);
  const byCap = blocksFound < 4;
  return (
    <Panel className="flex flex-col gap-6 p-8 border-mine-dim">
      <div className="flex items-center gap-4"><span aria-hidden>🔒</span><div className="font-display uppercase text-[36px] md:text-[48px] font-medium leading-none text-mine-muted">{byCap ? "Time's up: this mine has closed" : "This mine has closed permanently"}</div></div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Season ran" value={formatEta(ran)} />
        <Stat label="Closed at" value={new Date(Number(closeSec) * 1000).toISOString().slice(0, 16).replace("T", " ")} />
        <Stat label="Blocks found" value={`${blocksFound} / 4`} />
        <Stat label="Redemption" value={formatEta(Number(closeSec) + 30 * 86400 - Number(now))} sub="window remaining" />
      </div>
      <div className="text-mine-muted text-[13px]">{byCap ? `The cap ended the season with block ${blocksFound + 1} part-mined. Everything earned so far is claimable; the unmined remainder rolls into the next season's pool. Withdraw your deposits below, claim, then redeem.` : "Withdraw your deposits from each rig below, claim block 4, then redeem fragments."}</div>
    </Panel>
  );
}

function NotifyCard() {
  const [on, setOn] = useState(false);
  return (
    <Panel className="flex flex-col gap-3">
      <div className="text-[14px]">Get notified at each shift end and when the block is found.</div>
      <Btn onClick={async () => { if (typeof Notification !== "undefined") { const r = await Notification.requestPermission(); setOn(r === "granted"); } }}>{on ? "Notifications on" : "Turn on notifications"}</Btn>
    </Panel>
  );
}

export { formatRig };
