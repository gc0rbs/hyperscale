"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useDeployment } from "@/app/providers";
import { useMyRigs } from "@/lib/use-season";
import { useChainNow } from "@/lib/use-now";
import { useActiveAddress } from "@/lib/use-account";
import { advance, eta as etaOf, settle } from "@/lib/mine-math";
import { formatEta, formatHash, formatInt, formatRig } from "@/lib/format";
import type { SeasonSnapshot } from "@/lib/season-model";
import { BlockCard } from "./BlockCard";
import { RigCard, type RigAction } from "./RigCard";
import { PurchaseSheet } from "./PurchaseSheet";
import { HashStream } from "./HashStream";
import { RigRoom } from "./RigRoom";
import { FoundBanner } from "./FoundBanner";
import { OpeningSoon } from "./OpeningSoon";
import { NotifyToggle } from "./NotifyToggle";
import { useMineNotifications, useNotifyPref } from "@/lib/use-notify";
import { useTx } from "@/lib/use-tx";
import { seasonMineAbi } from "@/lib/contracts";
import { FramedIcon } from "./Icons";
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
  const blocksFound = useMemo(() => {
    let n = 0;
    for (let b = 0; b < p.blocks; b++) {
      const k = (b + 1) * spb - 1;
      if ((snap.global.shiftEndX[k] ?? 0n) !== 0n || g.shiftEndX[k] !== undefined) n++;
    }
    return n;
  }, [snap.global.shiftEndX, g.shiftEndX, p.blocks, spb]);
  const notifyPref = useNotifyPref();
  useMineNotifications(notifyPref.on, blocksFound, closed, g.shift, longHaul, snap.symbols);

  // The phase itself is in the header (Nav → SeasonStatus); only the long-haul state is called out here.
  const phaseChip = !closed && snap.phase > 1 && longHaul ? <Chip tone="signal">Long haul</Chip> : null;

  return (
    <>
      {justFound && <FoundBanner blockIdx={justFound.b} symbol={snap.symbols[justFound.b]} fragments={justFound.frags} fragPerToken={p.fragPerToken} onDismiss={() => setDismissed(justFound.b)} />}
      <div className="p-4 md:px-8 md:py-6 grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-6">
        <div className="flex flex-col gap-5">
          <div className="flex justify-between items-center flex-wrap gap-y-2">
            <div className="flex items-center gap-3.5 flex-wrap gap-y-2"><div className="font-display leading-none uppercase tracking-[0.02em] text-[40px] font-semibold whitespace-nowrap">Season {dep.seasonNumber ?? dep.seasonId + 1}</div>{phaseChip}{!closed && <NotifyToggle pref={notifyPref} />}</div>
            <Mono className="text-mine-muted text-[12px] hidden md:block">{closed ? `closed · redemption open` : `block ${curBlock + 1} pays ${(Number(snap.config.ratePerWork[curBlock]) / 1e18).toExponential(3)} frag per hash-second · ends at block 4 or ${capClock(snap)} at the latest`}</Mono>
          </div>

          {(snap.phase === 0 || snap.phase === 1) && <PreOpenCard snap={snap} now={now} />}
          {closed && <ClosedCard snap={snap} now={now} closeX={g.closeX} shift={g.shift} />}
          {snap.phase !== 0 && snap.phase !== 1 && !closed && (
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
            <div className="flex justify-between items-center"><div className="text-mine-muted text-[13px]">Add capital with another rig</div><Link href="/mine/new" className="text-[13px] text-signal inline-block py-2 -my-2">Activate a rig</Link></div>
          </Panel>
          <Panel className="flex flex-col gap-2">
            <Label>Found · claimable</Label>
            {claimable.length === 0 && <div className="text-mine-muted text-[13px] pt-2">Nothing found yet. Blocks unlock when their work is done.</div>}
            {claimable.map((c) => (
              <div key={c.b} className="flex justify-between items-center py-2.5 border-t border-mine-line">
                <div><div className="font-display leading-none uppercase text-[36px] font-semibold">{snap.symbols[c.b]}</div><Mono className="text-mine-muted text-[12px]">{formatInt(c.frags)} frag · {(Number(c.frags) / Number(p.fragPerToken)).toFixed(3)} {snap.symbols[c.b]}</Mono></div>
                <Link href="/claim"><Btn tone="signal" className="h-[34px]">Claim</Btn></Link>
              </div>
            ))}
          </Panel>
          {!longHaul && snap.phase !== 1 && !closed && <HashStream hashWad={myHash} />}
          {longHaul && <NotifyCard pref={notifyPref} />}
        </div>
      </div>
      {action && <PurchaseSheet action={action} snap={snap} now={now} onClose={() => setAction(null)} onDone={() => { setAction(null); refetch(); }} />}
    </>
  );
}

function PreOpenCard({ snap, now }: { snap: SeasonSnapshot; now: bigint }) {
  const totalWork = snap.params.difficulty.reduce((a, b) => a + b, 0n);
  const estLen = snap.global.totalHash > 0n ? Number(totalWork / snap.global.totalHash) : 0;
  return (
    <OpeningSoon
      embedded
      canActivate={snap.phase === 1}
      funding={snap.phase === 0}
      openTime={Number(snap.params.openTime)}
      now={Number(now)}
      symbols={snap.symbols}
      pool={snap.params.poolTokens.map((t) => String(Number(t / 10n ** 14n) / 10_000))}
      workShare={snap.params.difficulty.map((d) => Number((d * 10_000n) / totalWork) / 100)}
      staked={`${formatHash(snap.global.totalHash)} staked`}
      estRun={estLen ? `~${formatEta(estLen)}` : undefined}
    />
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
        <div className="flex flex-col gap-1"><Label>Block {b + 1} found</Label><div className="font-display uppercase text-[96px] font-bold leading-none text-signal">{formatEta(Number(e.toBlockFound))}</div><div className="text-mine-muted text-[13px]">estimate at the current {formatHash(g.totalHash)} total. Anyone joining or overclocking changes it.</div></div>
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
  // Audit B2: the client and the contract's phase() both know the mine is closed before any transaction
  // has persisted closeX. Offer to record it so withdrawals and redemption open without waiting.
  const sealTx = useTx();
  const dep2 = useDeployment();
  const account2 = useActiveAddress();
  const sealPending = snap.global.closeX === 0n;
  const closeSec = closeX / 10n ** 18n;
  const ran = Number(closeSec - snap.params.openTime);
  const blocksFound = Math.min(Math.floor(shift / snap.params.shiftsPerBlock), 4);
  const byCap = blocksFound < 4;
  return (
    <Panel className="flex flex-col gap-6 p-8 border-mine-dim">
      <div className="flex items-center gap-4"><FramedIcon name="lock" size={48} /><div className="font-display uppercase text-[64px] md:text-[80px] font-bold leading-none text-mine-muted">{byCap ? "Time's up: this mine has closed" : "This mine has closed permanently"}</div></div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Season ran" value={formatEta(ran)} />
        <Stat label="Closed at" value={new Date(Number(closeSec) * 1000).toISOString().slice(0, 16).replace("T", " ")} />
        <Stat label="Blocks found" value={`${blocksFound} / 4`} />
        <Stat label="Redemption" value={formatEta(Number(closeSec) + 30 * 86400 - Number(now))} sub="window remaining" />
      </div>
      {sealPending && (
        <div className="flex flex-wrap items-center gap-3 border border-signal-deep rounded-sm p-3" data-testid="seal-mine">
          <div className="text-[13px] text-mine-muted flex-1 min-w-[240px]">The close is computed but not yet recorded on chain. Any transaction records it; this one does nothing else.</div>
          <Btn tone="signal" disabled={sealTx.busy || !account2} onClick={() => sealTx.send("seal", { address: dep2.mine, abi: seasonMineAbi, functionName: "poke", account: account2 })}>{sealTx.busy ? "Recording…" : "Record the close"}</Btn>
          {sealTx.error && <div className="text-[12px] text-[var(--heat-hot)] font-data w-full">{sealTx.error}</div>}
        </div>
      )}
      <div className="text-mine-muted text-[13px]">{byCap ? `The cap ended the season with block ${blocksFound + 1} part-mined. Everything earned so far is claimable; the unmined remainder rolls into the next season's pool. Withdraw your deposits below, claim, then redeem.` : "Withdraw your deposits from each rig below, claim block 4, then redeem fragments."}</div>
    </Panel>
  );
}

function NotifyCard({ pref }: { pref: ReturnType<typeof useNotifyPref> }) {
  if (!pref.supported) return null;
  return (
    <Panel className="flex flex-col gap-3">
      <div className="text-[14px]">Get notified at each shift end, when a block is found, and when the mine closes. Works while this tab stays open.</div>
      <NotifyToggle pref={pref} className="self-start" />
    </Panel>
  );
}

export { formatRig };
