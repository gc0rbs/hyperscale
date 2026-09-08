"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRoundsDeployment } from "@/app/providers";
import { useMyRoundRigs } from "@/lib/use-rounds";
import { useChainNow } from "@/lib/use-now";
import { useActiveAddress } from "@/lib/use-account";
import { useTx } from "@/lib/use-tx";
import { roundMineAbi } from "@/lib/contracts";
import { formatCompute, formatInt, formatThroughput } from "@/lib/format";
import { claimWindow, formatClock, fragmentsToTokens, projectedCut, rolloverOf, roundAt, roundEndAt, secondsToRoundEnd, shareOf, sumClaimable, type RoundSnapshot } from "@/lib/round-model";
import { useNotifyPref, useRoundNotifications } from "@/lib/use-notify";
import { RoundRigCard, type RoundRigAction } from "./RoundRigCard";
import { RoundPurchaseSheet } from "./RoundPurchaseSheet";
import { RoundNotices } from "./RoundNotices";
import { HashStream } from "../HashStream";
import { RigRoom } from "../RigRoom";
import { NotifyToggle } from "../NotifyToggle";
import { FramedIcon } from "../Icons";
import { Btn, Chip, Label, Mono, Panel, Progress, Stat } from "../ui";

const tokens = (wei: bigint) => (Number(wei / 10n ** 12n) / 1e6).toFixed(4);

export function RoundView({ snap }: { snap: RoundSnapshot }) {
  const dep = useRoundsDeployment();
  const now = useChainNow(snap);
  const account = useActiveAddress();
  const { rigs, refetch } = useMyRoundRigs(dep.mine, snap.round);
  const [action, setAction] = useState<RoundRigAction | null>(null);
  // The round last claimed from this screen: keeps the panel up in its "Claimed" state until the window shuts.
  const [claimedRound, setClaimedRound] = useState<number | null>(null);
  const p = snap.params;
  const L = p.roundSeconds;
  // The round the clock says we are in; the snapshot's round lags it by at most one poll after a boundary.
  const cur = roundAt(p.genesis, L, now);
  const toEnd = snap.halted ? 0 : secondsToRoundEnd(p.genesis, L, cur, now);
  const elapsedPct = Math.min(100, Math.max(0, ((L - toEnd) / L) * 100));
  const window = claimWindow(p.genesis, L, p.claimSeconds, now, snap.halted);
  const myWorks = useMemo(() => rigs.map((r) => r.work), [rigs]);
  const share = shareOf(myWorks, snap.roundWork);
  const cut = projectedCut(snap.pot, myWorks, snap.roundWork, p.fragPerToken);
  const rollover = rolloverOf(snap.prevPot, snap.prevClaimed);
  const claimable = sumClaimable(rigs);
  const anyClaimable = claimable.some((f) => f > 0n);
  const myHash = rigs.reduce((a, r) => a + (r.inactive ? 0n : r.hash), 0n);
  const nothingNext = snap.nextScheduled.every((x) => x === 0n);
  const notifyPref = useNotifyPref();
  useRoundNotifications(notifyPref.on, cur, p.claimSeconds, snap.halted);
  const roomRigs = useMemo(() => rigs.map((r) => ({ id: r.id, gpuTier: r.gpuTier, coolingTier: r.coolingTier, state: { inactive: r.inactive, activeOc: r.activeOc } })), [rigs]);

  if (p.genesis === 0n) {
    return (
      <div className="p-4 md:px-8 md:py-6 max-w-[760px] flex flex-col gap-4" data-testid="not-launched">
        <div className="font-display leading-none uppercase tracking-[0.02em] text-[56px] font-semibold">Not live yet</div>
        <div className="text-mine-muted text-[15px] leading-relaxed">The cluster is deployed and verified but waits for the $RIG token to exist. The team launches it with one transaction the moment the token is live; round 0 opens at the genesis they set then. Anything already scheduled into the pots pays out from round 0.</div>
        <RoundNotices />
      </div>
    );
  }

  return (
    <>
      <div className="p-4 md:px-8 md:py-6 grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-6">
        <div className="flex flex-col gap-5">
          <div className="flex justify-between items-center flex-wrap gap-y-2">
            <div className="flex items-center gap-3.5 flex-wrap gap-y-2">
              <div className="font-display leading-none uppercase tracking-[0.02em] text-[40px] font-semibold whitespace-nowrap" data-testid="round-title">Round {cur}</div>
              {snap.halted && <Chip tone="ember">Halted</Chip>}
              {!snap.halted && snap.paused && <Chip tone="ember">Paused</Chip>}
              {!snap.halted && <NotifyToggle pref={notifyPref} />}
            </div>
            <Mono className="text-mine-muted text-[12px] hidden md:block">rounds of {L / 60} min · pot split by compute served · claim within {p.claimSeconds / 60} min of the close</Mono>
          </div>

          {snap.halted && <HaltCard />}
          {!snap.halted && window.open && (anyClaimable || claimedRound === window.round) && <ClaimPanel snap={snap} round={window.round!} secondsLeft={window.secondsLeft} claimable={claimable} claimed={claimedRound === window.round} onClaimed={() => { setClaimedRound(window.round); refetch(); }} />}
          {!snap.halted && <RoundCard snap={snap} cur={cur} toEnd={toEnd} elapsedPct={elapsedPct} share={share} cut={cut} rollover={rollover} haveRigs={rigs.length > 0} />}

          {!snap.halted && <RigRoom rigs={roomRigs} />}

          {!account && <Panel className="text-mine-muted text-[14px]">Connect a wallet to see your nodes.</Panel>}
          {account && rigs.length === 0 && (
            <Panel className="flex items-center justify-between gap-4"><div className="text-mine-muted text-[14px]">You have no nodes online.</div>{!snap.halted && <Link href="/mine/new"><Btn tone="ember">Bring a node online</Btn></Link>}</Panel>
          )}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            {rigs.map((r) => <RoundRigCard key={String(r.id)} rig={r} snap={snap} onAction={setAction} />)}
          </div>
          <RoundNotices compact />
        </div>

        <div className="flex flex-col gap-5 lg:pt-[42px]">
          <Panel className="flex flex-col gap-4">
            <Label>Your position</Label>
            <div className="grid grid-cols-2 gap-4">
              <Stat label="Your throughput" value={formatThroughput(myHash)} />
              <Stat label="Share of cluster" value={snap.totalHash > 0n ? `${(Number((myHash * 10_000n) / snap.totalHash) / 100).toFixed(1)}%` : "–"} />
              <Stat label="Nodes" value={String(rigs.filter((r) => !r.inactive).length)} />
              <Stat label="Served this round" value={formatCompute(myWorks.reduce((a, b) => a + b, 0n))} />
            </div>
            <div className="h-px bg-mine-line" />
            <div className="flex justify-between items-center"><div className="text-mine-muted text-[13px]">Add capacity with another node</div>{!snap.halted && <Link href="/mine/new" className="text-[13px] text-signal inline-block py-2 -my-2">Bring a node online</Link>}</div>
          </Panel>
          <Panel className="flex flex-col gap-3">
            <Label>Next round · {cur + 1}</Label>
            {nothingNext ? (
              <div className="text-[13px] text-ember" data-testid="nothing-scheduled">Nothing is scheduled for round {cur + 1} yet. Its pot will be only what rolls over from round {cur}.</div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {snap.symbols.map((t, s) => <div key={t} className="flex justify-between text-[13px]"><span className="font-display uppercase text-[22px] leading-none">{t}</span><Mono className="text-mine-muted">{tokens(snap.nextScheduled[s])} scheduled</Mono></div>)}
              </div>
            )}
            <div className="text-[12px] text-mine-dim">Plus whatever round {cur} leaves unclaimed.</div>
          </Panel>
          {!snap.halted && <HashStream hashWad={myHash} />}
          {notifyPref.supported && !snap.halted && (
            <Panel className="flex flex-col gap-3">
              <div className="text-[14px]">Get a notification the moment a round closes, so you never miss the {p.claimSeconds / 60}-minute claim window. Works while this tab stays open.</div>
              <NotifyToggle pref={notifyPref} className="self-start" />
            </Panel>
          )}
        </div>
      </div>
      {action && <RoundPurchaseSheet action={action} snap={snap} onClose={() => setAction(null)} onDone={() => { setAction(null); refetch(); }} />}
    </>
  );
}

function RoundCard({ snap, cur, toEnd, elapsedPct, share, cut, rollover, haveRigs }: { snap: RoundSnapshot; cur: number; toEnd: number; elapsedPct: number; share: number; cut: bigint[]; rollover: bigint[]; haveRigs: boolean }) {
  const p = snap.params;
  const noWork = snap.roundWork === 0n;
  const potEmpty = snap.pot.every((x) => x === 0n);
  const stale = cur !== snap.round;
  return (
    <Panel className="flex flex-col gap-6 p-6 md:p-8" data-testid="round-card">
      <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-6 items-end">
        <div className="flex flex-col gap-1">
          <Label>Round {cur} closes in</Label>
          <div className="font-display uppercase text-[96px] md:text-[128px] font-bold leading-none text-signal tabular-nums" data-testid="round-countdown">{stale ? "closing" : formatClock(toEnd)}</div>
          <div className="text-mine-muted text-[13px]">{stale ? "The boundary passed; reading the close…" : `closes at ${new Date(Number(roundEndAt(p.genesis, p.roundSeconds, cur)) * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · then ${p.claimSeconds / 60} minutes to claim`}</div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Stat label="Your share" value={`${(share * 100).toFixed(2)}%`} sub="of compute served this round" />
          <Stat label="Cluster throughput" value={formatThroughput(snap.totalHash)} sub={`${formatCompute(snap.roundWork)} served so far`} />
        </div>
      </div>
      <Progress pct={elapsedPct} ticks={4} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4" data-testid="pots">
        {snap.symbols.map((t, s) => (
          <div key={t} className="flex flex-col gap-1 border border-mine-line rounded-sm p-3">
            <div className="font-display leading-none uppercase text-[36px] font-semibold">{t}</div>
            <Mono className="text-[18px]">{tokens(snap.pot[s])}</Mono>
            <div className="text-[11px] text-mine-muted">{rollover[s] > 0n ? `includes ${tokens(rollover[s])} rolled over from round ${cur - 1}` : "pot this round"}</div>
            <div className="h-px bg-mine-line my-1" />
            <Mono className="text-signal text-[14px]" data-testid={`cut-${s}`}>{formatInt(cut[s])} shards</Mono>
            <div className="text-[11px] text-mine-muted">your projected cut · {fragmentsToTokens(cut[s], p.fragPerToken).toFixed(4)} {t}</div>
          </div>
        ))}
      </div>
      {noWork && <div className="text-[13px] text-ember" data-testid="no-work">No compute has been served in this round yet. If that holds to the close, the whole pot rolls into round {cur + 1}.</div>}
      {!noWork && potEmpty && <div className="text-[13px] text-ember">Nothing was funded for this round and nothing rolled over: the compute served now pays nothing.</div>}
      {!noWork && !haveRigs && <div className="text-[13px] text-mine-muted">Bring a node online to take a share of this pot; only compute served from then on counts.</div>}
      <div className="text-[11px] text-mine-dim">Projected cut assumes the round&apos;s work share stays where it is now. Anyone joining, leaving or overclocking changes it. Not a return.</div>
    </Panel>
  );
}

function ClaimPanel({ snap, round, secondsLeft, claimable, claimed, onClaimed }: { snap: RoundSnapshot; round: number; secondsLeft: number; claimable: bigint[]; claimed: boolean; onClaimed: () => void }) {
  const dep = useRoundsDeployment();
  const account = useActiveAddress();
  const tx = useTx();
  useEffect(() => {
    if (tx.done?.ok && tx.done.tag === "claim") { tx.reset(); onClaimed(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tx.done]);
  const total = claimable.reduce((a, b) => a + b, 0n);
  const done = claimed && total === 0n;
  return (
    <Panel className="flex flex-col gap-5 p-6 md:p-8 border-signal-deep" data-testid="claim-panel">
      <div className="flex items-center gap-4 flex-wrap">
        <FramedIcon name="lock" size={48} />
        <div className="flex-1 min-w-[200px]">
          <div className="font-display uppercase text-[48px] md:text-[64px] font-bold leading-none">Round {round} closed</div>
          <div className="text-mine-muted text-[13px]">{done ? "Claimed. Your shards are in your wallet; redeem them any time." : "Your share of its pot is ready. Claim before the window shuts."}</div>
        </div>
        <div className="flex flex-col items-end"><Label>Claim window</Label><div className="font-display uppercase text-[64px] font-bold leading-none text-ember tabular-nums" data-testid="claim-countdown">{formatClock(secondsLeft)}</div></div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {snap.symbols.map((t, s) => (
          <div key={t} className="flex flex-col gap-0.5">
            <div className="font-display leading-none uppercase text-[36px] font-semibold">{t}</div>
            <Mono className="text-[16px]" data-testid={`claimable-${s}`}>{formatInt(claimable[s])} shards</Mono>
            <Mono className="text-mine-muted text-[12px]">{fragmentsToTokens(claimable[s], snap.params.fragPerToken).toFixed(4)} {t}</Mono>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-4 flex-wrap">
        <Btn tone="signal" className="h-12 px-8" disabled={tx.busy || !account || done} onClick={() => account && tx.send("claim", { address: dep.mine, abi: roundMineAbi, functionName: "claimAll", account })} data-testid="claim-all">
          {tx.status === "wallet" ? "Confirm in wallet…" : tx.status === "mining" ? "Mining…" : done ? "Claimed" : `Claim ${formatInt(total)} shards`}
        </Btn>
        <div className="text-[13px] text-ember">Unclaimed rewards do not wait: whatever is left when the window shuts rolls into round {round + 1}&apos;s pot for everyone.</div>
      </div>
      {tx.error && <div className="text-[12px] text-[var(--heat-hot)] font-data break-all" data-testid="tx-error">{tx.error}</div>}
    </Panel>
  );
}

function HaltCard() {
  return (
    <Panel className="flex flex-col gap-4 p-6 md:p-8 border-ember-deep" data-testid="halt-card">
      <div className="flex items-center gap-4"><FramedIcon name="lock" size={48} /><div className="font-display uppercase text-[56px] md:text-[72px] font-bold leading-none text-ember">The mine is halted</div></div>
      <div className="text-mine-muted text-[14px] leading-relaxed">No round closes again and nothing accrues. Every stake comes back in full: use Emergency withdraw on each node below. Shards you already claimed stay redeemable on the Redeem page. Unclaimed pots and everything that was scheduled return to the operator.</div>
    </Panel>
  );
}
