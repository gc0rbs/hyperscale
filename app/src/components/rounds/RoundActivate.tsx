"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { parseEther } from "viem";
import { useTx } from "@/lib/use-tx";
import { useReads } from "@/lib/reads";
import { useRoundsDeployment } from "@/app/providers";
import { Btn, Label, Mono, Panel, Stat } from "../ui";
import { rigAbi, roundMineAbi } from "@/lib/contracts";
import { formatRig, formatThroughput } from "@/lib/format";
import { claimWindow, formatClock, roundAt, secondsToRoundEnd, type RoundSnapshot } from "@/lib/round-model";
import { useActiveAddress } from "@/lib/use-account";
import { useChainNow } from "@/lib/use-now";

/** Bring a node online: approve VRAM, then RoundMine.activate(amount). Stake = capacity, fixed per node. */
export function RoundActivate({ snap }: { snap: RoundSnapshot }) {
  const dep = useRoundsDeployment();
  const router = useRouter();
  const account = useActiveAddress();
  const now = useChainNow(snap, 1000);
  const [amountStr, setAmountStr] = useState("100000");
  const amount = (() => { try { return parseEther(amountStr || "0"); } catch { return 0n; } })();
  const p = snap.params;
  const fee = (amount * BigInt(p.activationFeeBps)) / 10_000n;
  const hash = (amount * BigInt(p.gpuMultBps[0])) / 10_000n;
  const share = snap.totalHash + hash > 0n ? Number((hash * 10_000n) / (snap.totalHash + hash)) / 100 : 0;
  const cur = roundAt(p.genesis, p.roundSeconds, now);
  const toEnd = secondsToRoundEnd(p.genesis, p.roundSeconds, cur, now);
  const w = claimWindow(p.genesis, p.roundSeconds, p.claimSeconds, now, snap.halted);
  const canJoin = !snap.halted && !snap.paused;

  const reads = useReads(
    account
      ? [
          { address: snap.params.rig, abi: rigAbi, functionName: "balanceOf", args: [account] },
          { address: snap.params.rig, abi: rigAbi, functionName: "allowance", args: [account, dep.mine] },
        ]
      : [],
    { enabled: Boolean(account), refetchInterval: 5000 },
  );
  const rigBal = (reads.data?.[0]?.result as bigint | undefined) ?? 0n;
  const rigAllow = (reads.data?.[1]?.result as bigint | undefined) ?? 0n;
  const needApprove = rigAllow < amount + fee;
  const tx = useTx();
  useEffect(() => {
    if (!tx.done?.ok) return;
    if (tx.done.tag === "approve") { reads.refetch(); tx.reset(); }
    if (tx.done.tag === "activate") router.push("/mine");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tx.done]);
  const go = () => {
    if (!account) return;
    if (needApprove) { tx.send("approve", { address: snap.params.rig, abi: rigAbi, functionName: "approve", args: [dep.mine, 2n ** 255n], account }); return; }
    tx.send("activate", { address: dep.mine, abi: roundMineAbi, functionName: "activate", args: [amount], account });
  };
  const tooSmall = amount < p.minStakeWeight;
  const insufficient = rigBal < amount + fee;

  return (
    <div className="p-4 md:px-8 md:py-6 max-w-[1100px] mx-auto grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-6">
      <Panel className="flex flex-col gap-6" data-testid="activate">
        <div className="font-display leading-none uppercase tracking-[0.02em] text-[64px] font-medium">Bring a node online</div>
        <label className="flex flex-col gap-2"><Label>Stake · $VRAM</Label><input data-testid="amount" value={amountStr} onChange={(ev) => setAmountStr(ev.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" className="h-12 px-4 bg-mine-panel2 border border-mine-line rounded-sm font-data text-[22px] text-mine-fg outline-none focus:border-signal" /><Mono className="text-mine-muted text-[12px]">balance {formatRig(rigBal)} RIG</Mono></label>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Throughput" value={formatThroughput(hash)} sub="Gen 0, before upgrades" />
          <Stat label="Share at join" value={`${share.toFixed(2)}%`} sub="of cluster throughput" />
          <Stat label="Activation fee" value={`${formatRig(fee)} VRAM`} sub="to treasury, in VRAM" />
          <Stat label="Stake" value="fixed per node" sub={`decommission any time, ${p.exitFeeBps / 100}% fee`} />
        </div>
        <div className="text-mine-muted text-[13px]">Capacity is fixed per node. To add more, bring another node online. Upgrades are priced as a share of this stake and burned.</div>
        {tx.error && <div className="text-[12px] text-[var(--heat-hot)] font-data break-all" data-testid="tx-error">{tx.error}</div>}
        <div className="flex gap-2 items-center flex-wrap">
          <Btn tone="ember" className="h-12 px-6" onClick={go} disabled={!account || tx.busy || tooSmall || insufficient || !canJoin} data-testid="activate-submit">
            {tx.status === "wallet" ? "Confirm in wallet…" : tx.status === "mining" ? "Mining…" : needApprove ? "Approve VRAM" : "Bring online"}
          </Btn>
          {!account && <span className="text-mine-muted text-[13px]">Connect a wallet first.</span>}
          {tooSmall && <span className="text-mine-muted text-[13px]">Minimum stake is {formatRig(p.minStakeWeight)} VRAM.</span>}
          {insufficient && account && !tooSmall && <span className="text-mine-muted text-[13px]">Not enough VRAM for the stake plus the fee.</span>}
          {!canJoin && <span className="text-mine-muted text-[13px]">{snap.halted ? "The mine is halted." : "The mine is paused."}</span>}
        </div>
      </Panel>
      <div className="flex flex-col gap-5">
        <Panel className="flex flex-col gap-4">
          <Label>Right now</Label>
          <Stat label={`Round ${cur} closes in`} value={snap.halted ? "halted" : formatClock(toEnd)} sub="compute served from the moment you join counts" />
          <Stat label="Claim window" value={w.open ? `${formatClock(w.secondsLeft)} left` : "closed"} sub={w.open ? `round ${w.round} is claimable now` : `${p.claimSeconds / 60} min after every close`} />
        </Panel>
        <Panel className="text-mine-muted text-[13px] leading-relaxed">Every round&apos;s pot is split by compute served in that round. Your cut is your compute over everyone&apos;s: more nodes in the cluster mean a smaller share, and a bigger pot only if more is funded.</Panel>
      </div>
    </div>
  );
}
