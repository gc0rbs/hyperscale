"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { parseEther } from "viem";
import { useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { useReads } from "@/lib/reads";
import { useDeployment } from "@/app/providers";
import { SeasonShell } from "@/components/SeasonShell";
import { Btn, Label, Mono, Panel, Stat } from "@/components/ui";
import { erc20Abi, rigAbi, seasonMineAbi } from "@/lib/contracts";
import { formatEta, formatHash, formatRig } from "@/lib/format";
import { advance, eta as etaOf } from "@/lib/mine-math";
import type { SeasonSnapshot } from "@/lib/season-model";
import { useActiveAddress } from "@/lib/use-account";
import { useChainNow } from "@/lib/use-now";

export default function NewRigPage() {
  return <SeasonShell>{(snap) => <Activate snap={snap} />}</SeasonShell>;
}

function Activate({ snap }: { snap: SeasonSnapshot }) {
  const dep = useDeployment();
  const router = useRouter();
  const account = useActiveAddress();
  const now = useChainNow(snap, 1000);
  const [asset, setAsset] = useState<0 | 1>(0);
  const [amountStr, setAmountStr] = useState("100000");
  const amount = (() => { try { return parseEther(amountStr || "0"); } catch { return 0n; } })();
  const p = snap.params;
  const weight = asset === 0 ? amount : (amount * p.lpWeightPerToken) / 10n ** 18n;
  const fee = (weight * BigInt(p.activationFeeBps)) / 10_000n;
  const { g } = advance(snap.config, snap.global, now);
  const share = g.totalHash + weight > 0n ? Number((weight * 10_000n) / (g.totalHash + weight)) / 100 : 0;
  const totalWork = p.difficulty.reduce((a, b) => a + b, 0n);
  const estAfter = g.totalHash + weight > 0n ? Number(totalWork / (g.totalHash + weight)) : 0;
  const e = etaOf(snap.config, snap.global, now);
  const canJoin = snap.phase === 1 || snap.phase === 2;

  const token = asset === 0 ? dep.rig : dep.lp;
  const reads = useReads(
    account
      ? [
          { address: dep.rig, abi: rigAbi, functionName: "balanceOf", args: [account] },
          { address: dep.lp, abi: erc20Abi, functionName: "balanceOf", args: [account] },
          { address: dep.rig, abi: rigAbi, functionName: "allowance", args: [account, dep.mine] },
          { address: dep.lp, abi: erc20Abi, functionName: "allowance", args: [account, dep.mine] },
        ]
      : [],
    { enabled: Boolean(account), refetchInterval: 5000 },
  );
  const rigBal = (reads.data?.[0]?.result as bigint | undefined) ?? 0n;
  const lpBal = (reads.data?.[1]?.result as bigint | undefined) ?? 0n;
  const rigAllow = (reads.data?.[2]?.result as bigint | undefined) ?? 0n;
  const lpAllow = (reads.data?.[3]?.result as bigint | undefined) ?? 0n;
  const needRigApprove = rigAllow < (asset === 0 ? amount + fee : fee);
  const needLpApprove = asset === 1 && lpAllow < amount;
  const write = useWriteContract();
  const rcpt = useWaitForTransactionReceipt({ hash: write.data });
  const [step, setStep] = useState<"idle" | "approve" | "activate">("idle");
  useEffect(() => {
    if (!rcpt.isSuccess) return;
    if (step === "approve") { reads.refetch(); write.reset(); setStep("idle"); }
    if (step === "activate") router.push("/mine");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rcpt.isSuccess]);
  const go = () => {
    if (!account) return;
    if (needRigApprove) { setStep("approve"); write.writeContract({ address: dep.rig, abi: rigAbi, functionName: "approve", args: [dep.mine, 2n ** 255n], account }); return; }
    if (needLpApprove) { setStep("approve"); write.writeContract({ address: token, abi: erc20Abi, functionName: "approve", args: [dep.mine, 2n ** 255n], account }); return; }
    setStep("activate");
    write.writeContract({ address: dep.mine, abi: seasonMineAbi, functionName: "activate", args: [asset, amount], account });
  };
  const busy = write.isPending || rcpt.isLoading;
  const tooSmall = weight < p.minStakeWeight;
  const insufficient = asset === 0 ? rigBal < amount + fee : lpBal < amount || rigBal < fee;

  return (
    <div className="p-4 md:px-8 md:py-6 max-w-[1100px] mx-auto grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-6">
      <Panel className="flex flex-col gap-6" data-testid="activate">
        <div className="font-display leading-none uppercase tracking-[0.02em] text-[64px] font-medium">Activate a rig</div>
        <div className="flex gap-2">
          {(p.lpWeightPerToken > 0n ? (["RIG", "RIG/USDC LP"] as const) : (["RIG"] as const)).map((l, i) => <button key={l} onClick={() => setAsset(i as 0 | 1)} className={`h-10 px-4 rounded-sm border text-[14px] font-semibold ${asset === i ? "border-ember text-ember bg-[var(--ember-tint)]" : "border-mine-line text-mine-muted"}`}>{l}</button>)}
        </div>
        <label className="flex flex-col gap-2"><Label>Amount</Label><input data-testid="amount" value={amountStr} onChange={(ev) => setAmountStr(ev.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" className="h-12 px-4 bg-mine-panel2 border border-mine-line rounded-sm font-data text-[22px] text-mine-fg outline-none focus:border-signal" /><Mono className="text-mine-muted text-[12px]">balance {formatRig(asset === 0 ? rigBal : lpBal)} {asset === 0 ? "RIG" : "LP"}{asset === 1 ? ` · 1 LP = ${Number(p.lpWeightPerToken) / 1e18} RIG-equivalent (bonus included)` : ""}</Mono></label>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Hashrate" value={formatHash(weight)} />
          <Stat label="Share at join" value={`${share.toFixed(2)}%`} />
          <Stat label="Activation fee" value={`${formatRig(fee)} RIG`} sub="to treasury, in RIG" />
          <Stat label="Stake locked" value="until close" sub={`exit any time, ${p.earlyExitFeeBps / 100}% fee`} />
        </div>
        <div className="text-mine-muted text-[13px]">Stake per rig is fixed for the season. To add capital later, activate another rig. Upgrades are priced as a share of this stake.</div>
        {write.error && <div className="text-[12px] text-[var(--heat-hot)] font-data break-all">{write.error.message.split("\n")[0]}</div>}
        <div className="flex gap-2 items-center">
          <Btn tone="ember" className="h-12 px-6" onClick={go} disabled={!account || busy || tooSmall || insufficient || !canJoin} data-testid="activate-submit">
            {busy ? "Confirming…" : needRigApprove ? "Approve RIG" : needLpApprove ? "Approve LP" : "Activate rig"}
          </Btn>
          {!account && <span className="text-mine-muted text-[13px]">Connect a wallet first.</span>}
          {tooSmall && <span className="text-mine-muted text-[13px]">Minimum stake weight is {formatRig(p.minStakeWeight)} RIG-equivalent.</span>}
          {insufficient && account && <span className="text-mine-muted text-[13px]">Not enough balance (fee is paid in RIG).</span>}
          {!canJoin && <span className="text-mine-muted text-[13px]">This mine is not accepting rigs.</span>}
        </div>
      </Panel>
      <div className="flex flex-col gap-5">
        <Panel className="flex flex-col gap-4">
          <Label>What your stake changes</Label>
          <Stat label="Est. season length after you join" value={estAfter ? formatEta(estAfter) : "–"} sub="everyone's blocks come sooner" est />
          <Stat label="Now" value={snap.phase === 1 ? `opens in ${formatEta(Number(p.openTime - now))}` : e.idle ? "paused" : `${formatEta(Number(e.toClose))} to close`} sub="est." est />
        </Panel>
        <Panel className="text-mine-muted text-[13px] leading-relaxed">Your fragments per second depend only on your own hashrate. Other rigs do not dilute you; they change how fast the mine runs out.</Panel>
      </div>
    </div>
  );
}
