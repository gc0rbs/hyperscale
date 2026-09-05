"use client";
import { useEffect } from "react";
import { useTx } from "@/lib/use-tx";
import { useReads } from "@/lib/reads";
import { useDeployment } from "@/app/providers";
import { rigAbi, seasonMineAbi } from "@/lib/contracts";
import { formatHash, formatInt, formatRig } from "@/lib/format";
import { advance, coverage, estimateFragments, fragmentsPerSecond } from "@/lib/mine-math";
import type { SeasonSnapshot } from "@/lib/season-model";
import { useActiveAddress } from "@/lib/use-account";
import type { RigAction } from "./RigCard";
import { Btn, Label, Mono } from "./ui";
import { FramedIcon } from "./Icons";

/** Brief §5 purchase sheet: what you get, what burns (permanently), coverage, one confirm. */
export function PurchaseSheet({ action, snap, now, onClose, onDone }: { action: RigAction; snap: SeasonSnapshot; now: bigint; onClose: () => void; onDone: () => void }) {
  const dep = useDeployment();
  const account = useActiveAddress();
  const p = snap.params;
  const { rig } = action;
  const { g } = advance(snap.config, snap.global, now);
  const curBlock = Math.min(Math.floor(g.shift / p.shiftsPerBlock), p.blocks - 1);
  // Audit B10: coverage is remaining work over total work (or the overclock's span), never a mix of
  // block-local progress and the absolute shift index.
  const permanent = coverage(snap.config, g);
  const burst = coverage(snap.config, g, p.ocShiftSpan);
  const rigHash = rig.state.inactive ? 0n : rig.state.baseHash + rig.state.ocHash;

  let title = "", burn = 0n, effect = "", detail = "", fn = "", estimate = "", warning = "";
  if (action.kind === "gpu") {
    const t = rig.gpuTier;
    burn = (rig.weight * BigInt(p.gpuCostBps[t])) / 10_000n;
    const newBase = (rig.weight * BigInt(p.gpuMultBps[t + 1])) / 10_000n;
    const delta = newBase - rig.state.baseHash;
    title = `GPU → tier ${t + 1}`;
    effect = `+${(p.gpuMultBps[t + 1] - p.gpuMultBps[t]) / 100}% hashrate · ${formatHash(newBase)} base`;
    detail = `covers ${(permanent.fraction * 100).toFixed(0)}% of the mine's remaining work`;
    estimate = `≈ ${formatInt(estimateFragments(snap.config, g, delta))} frag at the current pace · ${fragmentsPerSecond(snap.config, rigHash + delta, curBlock).toFixed(3)} frag/s after`;
    fn = "upgradeGpu";
  } else if (action.kind === "cooling") {
    const t = rig.coolingTier;
    burn = (rig.weight * BigInt(p.coolCostBps[t])) / 10_000n;
    title = `Cooling → tier ${t + 1}`;
    effect = `${p.heatPerOc[t + 1]} heat per overclock · −${p.coolPerShift[t + 1]} per shift`;
    detail = `was ${p.heatPerOc[t]} and −${p.coolPerShift[t]} · applies to the remaining ${(permanent.fraction * 100).toFixed(0)}% of the mine`;
    estimate = `no hashrate by itself: it lets you keep more overclocks running`;
    fn = "upgradeCooling";
  } else if (action.kind === "overclock") {
    burn = (rig.weight * BigInt(p.ocCostBps)) / 10_000n;
    const delta = (rig.state.baseHash * BigInt(p.ocBoostBps)) / 10_000n;
    title = "Overclock";
    effect = `+${p.ocBoostBps / 100}% of base hashrate for the rest of this shift and the next`;
    detail = `+${p.heatPerOc[rig.state.coolingTier]} heat · covers ${(burst.fraction * 100).toFixed(1)}% of the mine`;
    estimate = `≈ ${formatInt(estimateFragments(snap.config, g, delta, burst.work))} frag at the current pace`;
    if (burst.truncated) warning = "This is the final shift: the overclock runs to close and no further. Only buy it for the work left in this shift.";
    fn = "overclock";
  } else {
    title = "Exit rig";
    effect = `Deposit back minus ${p.earlyExitFeeBps / 100}% · earned fragments stay claimable`;
    detail = "Upgrades are lost. This cannot be undone.";
    fn = "exit";
  }

  const allowance = useReads(account ? [{ address: dep.rig, abi: rigAbi, functionName: "allowance", args: [account, dep.mine] }] : [], { enabled: Boolean(account) && burn > 0n });
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
      tx.send("approve", { address: dep.rig, abi: rigAbi, functionName: "approve", args: [dep.mine, 2n ** 255n], account });
      return;
    }
    tx.send("send", { address: dep.mine, abi: seasonMineAbi, functionName: fn, args: [rig.id], account });
  };
  const busy = tx.busy;
  const err = tx.error;

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60" role="dialog" aria-modal>
      <div className="w-full md:w-[440px] bg-mine-panel border border-mine-line rounded-t-lg md:rounded-lg p-6 flex flex-col gap-5 text-mine-fg" data-testid="purchase-sheet">
        <div className="flex items-center gap-4">
          <FramedIcon name={action.kind === "gpu" ? "rig" : action.kind === "cooling" ? "cooling" : action.kind === "overclock" ? "overclock" : "lock"} size={52} />
          <div className="font-display uppercase tracking-[0.02em] text-[64px] font-semibold leading-none">{title}</div>
        </div>
        <div className="flex flex-col gap-3">
          <Row k="You get" v={effect} />
          <Row k="Detail" v={detail} />
          {burn > 0n && <Row k="You burn" v={<span className="text-ember">{formatRig(burn)} RIG · permanently</span>} />}
          {estimate && <Row k="Estimate" v={<span className="text-signal">{estimate}</span>} />}
        </div>
        {estimate && <div className="text-[11px] text-mine-dim">Estimates assume the current total hash; anyone joining, leaving or overclocking changes them. Not a return.</div>}
        {warning && <div className="text-[12px] text-ember" data-testid="late-warning">{warning}</div>}
        {err && <div className="text-[12px] text-[var(--heat-hot)] font-data break-all" data-testid="tx-error">{err}</div>}
        <div className="flex gap-2">
          <Btn onClick={onClose} disabled={busy}>Cancel</Btn>
          <Btn tone={action.kind === "exit" ? "signal" : "ember"} className="flex-1 h-11" onClick={submit} disabled={busy || !account} >
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
