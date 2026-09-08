"use client";
import { useEffect } from "react";
import { useTx } from "@/lib/use-tx";
import { useReads } from "@/lib/reads";
import { useRoundsDeployment } from "@/app/providers";
import { rigAbi, roundMineAbi } from "@/lib/contracts";
import { formatRig, formatThroughput } from "@/lib/format";
import { coolingCostOf, gpuCostOf, overclockCostOf, shareOf, type RoundSnapshot } from "@/lib/round-model";
import { useActiveAddress } from "@/lib/use-account";
import type { RoundRigAction } from "./RoundRigCard";
import { Btn, Label, Mono } from "../ui";
import { FramedIcon } from "../Icons";

const GEN_NAMES = ["Consumer card", "Datacenter card", "Tensor card", "HBM module", "Superchip", "Rack-scale"];
const COOL_NAMES = ["Air", "Liquid loop", "Direct-to-chip", "Immersion"];

/** Brief §5 purchase sheet for the rounds mine: what you get, what burns (permanently), one confirm. */
export function RoundPurchaseSheet({ action, snap, onClose, onDone }: { action: RoundRigAction; snap: RoundSnapshot; onClose: () => void; onDone: () => void }) {
  const dep = useRoundsDeployment();
  const account = useActiveAddress();
  const p = snap.params;
  const { rig } = action;
  const shareNow = shareOf([rig.work], snap.roundWork);

  let title = "", burn = 0n, effect = "", detail = "", fn = "", estimate = "";
  if (action.kind === "gpu") {
    const t = rig.gpuTier;
    burn = gpuCostOf(p, rig);
    const newBase = (rig.amount * BigInt(p.gpuMultBps[t + 1])) / 10_000n;
    const boost = (newBase * BigInt(p.ocBoostBps) * BigInt(rig.activeOc)) / 10_000n;
    title = `GPU → Gen ${t + 1}`;
    effect = `${GEN_NAMES[t + 1]} · ${p.gpuMultBps[t + 1] / 100}% of capacity · ${formatThroughput(newBase + boost)} after`;
    detail = `permanent for this node · was ${formatThroughput(rig.hash)}`;
    estimate = `throughput +${(p.gpuMultBps[t + 1] - p.gpuMultBps[t]) / 100}% of capacity from the next second; your share of every future round grows with it`;
    fn = "upgradeGpu";
  } else if (action.kind === "cooling") {
    const t = rig.coolingTier;
    burn = coolingCostOf(p, rig);
    title = `Cooling → ${COOL_NAMES[t + 1]}`;
    effect = `${p.heatPerOc[t + 1]} thermal load per overclock · −${p.coolPerRound[t + 1]} per round`;
    detail = `was ${p.heatPerOc[t]} and −${p.coolPerRound[t]} · permanent for this node`;
    estimate = `no throughput by itself: it lets you keep more overclocks running`;
    fn = "upgradeCooling";
  } else if (action.kind === "overclock") {
    burn = overclockCostOf(p, rig);
    const delta = (rig.baseHash * BigInt(p.ocBoostBps)) / 10_000n;
    const until = snap.round + p.ocRoundSpan;
    title = "Overclock";
    effect = `+${p.ocBoostBps / 100}% of base throughput (+${formatThroughput(delta)}) until the end of round ${until}`;
    detail = `+${p.heatPerOc[rig.coolingTier]} thermal load · ${p.maxActiveOc - rig.activeOc - 1} slot${p.maxActiveOc - rig.activeOc - 1 === 1 ? "" : "s"} left after this`;
    estimate = `share of this round ${(shareNow * 100).toFixed(2)}% now; the boost only counts for the seconds it runs`;
    fn = "overclock";
  } else if (action.kind === "exit") {
    title = "Decommission node";
    effect = `Stake back minus ${p.exitFeeBps / 100}% · work done this round still counts and shards already claimed are kept`;
    detail = "GPU generation and cooling are lost with the node. This cannot be undone.";
    fn = "exit";
  } else {
    title = "Emergency withdraw";
    effect = `Full stake of ${formatRig(rig.amount)} RIG back, no fee`;
    detail = "The mine is halted: nothing accrues and no round closes again.";
    fn = "emergencyWithdraw";
  }

  const allowance = useReads(account ? [{ address: snap.params.rig, abi: rigAbi, functionName: "allowance", args: [account, dep.mine] }] : [], { enabled: Boolean(account) && burn > 0n });
  const needsApprove = burn > 0n && ((allowance.data?.[0]?.result as bigint | undefined) ?? 0n) < burn;
  const tx = useTx();
  useEffect(() => {
    if (!tx.done?.ok) return;
    if (tx.done.tag === "send") onDone();
    if (tx.done.tag === "approve") { allowance.refetch(); tx.reset(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tx.done]);

  const submit = () => {
    if (!account) return;
    if (needsApprove) {
      tx.send("approve", { address: snap.params.rig, abi: rigAbi, functionName: "approve", args: [dep.mine, 2n ** 255n], account });
      return;
    }
    tx.send("send", { address: dep.mine, abi: roundMineAbi, functionName: fn, args: [rig.id], account });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60" role="dialog" aria-modal>
      <div className="w-full md:w-[440px] bg-mine-panel border border-mine-line rounded-t-lg md:rounded-lg p-6 flex flex-col gap-5 text-mine-fg" data-testid="purchase-sheet">
        <div className="flex items-center gap-4">
          <FramedIcon name={action.kind === "gpu" ? "rig" : action.kind === "cooling" ? "cooling" : action.kind === "overclock" ? "overclock" : "lock"} size={52} />
          <div className="font-display uppercase tracking-[0.02em] text-[56px] font-semibold leading-none">{title}</div>
        </div>
        <div className="flex flex-col gap-3">
          <Row k="You get" v={effect} />
          <Row k="Detail" v={detail} />
          {burn > 0n && <Row k="You burn" v={<span className="text-ember">{formatRig(burn)} RIG · permanently</span>} />}
          {estimate && <Row k="Note" v={<span className="text-signal">{estimate}</span>} />}
        </div>
        {burn > 0n && <div className="text-[11px] text-mine-dim">Each round&apos;s pot is split by compute served in that round. What a round pays depends on what was funded and on everyone else&apos;s throughput. Not a return.</div>}
        {tx.error && <div className="text-[12px] text-[var(--heat-hot)] font-data break-all" data-testid="tx-error">{tx.error}</div>}
        <div className="flex gap-2">
          <Btn onClick={onClose} disabled={tx.busy}>Cancel</Btn>
          <Btn tone={action.kind === "exit" || action.kind === "withdraw" ? "signal" : "ember"} className="flex-1 h-11" onClick={submit} disabled={tx.busy || !account}>
            {tx.status === "wallet" ? "Confirm in wallet…" : tx.status === "mining" ? "Mining…" : needsApprove ? "Approve RIG first" : burn > 0n ? "Confirm burn" : "Confirm"}
          </Btn>
        </div>
      </div>
    </div>
  );
}

const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
  <div className="flex justify-between gap-4 text-[14px]"><Label>{k}</Label><Mono className="text-right">{v}</Mono></div>
);
