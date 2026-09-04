"use client";
import { useEffect, useState } from "react";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useReads } from "@/lib/reads";
import { useDeployment } from "@/app/providers";
import { rigAbi, seasonMineAbi } from "@/lib/contracts";
import { formatHash, formatRig } from "@/lib/format";
import { advance, blockProgressBps } from "@/lib/mine-math";
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
  const totalShifts = p.blocks * p.shiftsPerBlock;
  const doneShifts = Math.min(g.shift, totalShifts) + blockProgressBps(snap.config, g) / 10_000 - (g.shift % p.shiftsPerBlock);
  const coverage = Math.max(0, 1 - Math.min(g.shift, totalShifts) / totalShifts - (blockProgressBps(snap.config, g) / 10_000 - (g.shift % p.shiftsPerBlock)) / totalShifts);
  void doneShifts;

  let title = "", burn = 0n, effect = "", detail = "", fn = "";
  if (action.kind === "gpu") {
    const t = rig.gpuTier;
    burn = (rig.weight * BigInt(p.gpuCostBps[t])) / 10_000n;
    const newBase = (rig.weight * BigInt(p.gpuMultBps[t + 1])) / 10_000n;
    title = `GPU → tier ${t + 1}`;
    effect = `+${(p.gpuMultBps[t + 1] - p.gpuMultBps[t]) / 100}% hashrate · ${formatHash(newBase)} base`;
    detail = `covers ${(coverage * 100).toFixed(0)}% of the mine's remaining work`;
    fn = "upgradeGpu";
  } else if (action.kind === "cooling") {
    const t = rig.coolingTier;
    burn = (rig.weight * BigInt(p.coolCostBps[t])) / 10_000n;
    title = `Cooling → tier ${t + 1}`;
    effect = `${p.heatPerOc[t + 1]} heat per overclock · −${p.coolPerShift[t + 1]} per shift`;
    detail = `was ${p.heatPerOc[t]} and −${p.coolPerShift[t]}`;
    fn = "upgradeCooling";
  } else if (action.kind === "overclock") {
    burn = (rig.weight * BigInt(p.ocCostBps)) / 10_000n;
    title = "Overclock";
    effect = `+${p.ocBoostBps / 100}% of base hashrate for the rest of this shift and the next`;
    detail = `+${p.heatPerOc[rig.state.coolingTier]} heat`;
    fn = "overclock";
  } else {
    title = "Exit rig";
    effect = `Deposit back minus ${p.earlyExitFeeBps / 100}% · earned fragments stay claimable`;
    detail = "Upgrades are lost. This cannot be undone.";
    fn = "exit";
  }

  const allowance = useReads(account ? [{ address: dep.rig, abi: rigAbi, functionName: "allowance", args: [account, dep.mine] }] : [], { enabled: Boolean(account) && burn > 0n });
  const needsApprove = burn > 0n && ((allowance.data?.[0]?.result as bigint | undefined) ?? 0n) < burn;
  const write = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: write.data });
  const [step, setStep] = useState<"idle" | "approving" | "sending">("idle");

  useEffect(() => {
    if (receipt.isSuccess && step === "sending") onDone();
    if (receipt.isSuccess && step === "approving") { allowance.refetch(); setStep("idle"); write.reset(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt.isSuccess]);

  const submit = () => {
    if (!account) return;
    if (needsApprove) {
      setStep("approving");
      write.writeContract({ address: dep.rig, abi: rigAbi, functionName: "approve", args: [dep.mine, 2n ** 255n], account });
      return;
    }
    setStep("sending");
    write.writeContract({ address: dep.mine, abi: seasonMineAbi, functionName: fn, args: [rig.id], account });
  };
  const busy = write.isPending || receipt.isLoading;
  const err = write.error?.message.split("\n")[0];

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
        </div>
        {err && <div className="text-[12px] text-[var(--heat-hot)] font-data break-all">{err}</div>}
        <div className="flex gap-2">
          <Btn onClick={onClose} disabled={busy}>Cancel</Btn>
          <Btn tone={action.kind === "exit" ? "signal" : "ember"} className="flex-1 h-11" onClick={submit} disabled={busy || !account} >
            {busy ? "Confirming…" : needsApprove ? "Approve RIG first" : burn > 0n ? "Confirm burn" : "Confirm"}
          </Btn>
        </div>
      </div>
    </div>
  );
}

const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
  <div className="flex justify-between gap-4 text-[14px]"><Label>{k}</Label><Mono className="text-right">{v}</Mono></div>
);
