"use client";
import { useEffect, useState } from "react";
import { useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { useDeployment } from "@/app/providers";
import { SeasonShell } from "@/components/SeasonShell";
import { Btn, Chip, Label, Mono, Panel } from "@/components/ui";
import { TICKERS, seasonMineAbi } from "@/lib/contracts";
import { formatInt, formatRig } from "@/lib/format";
import { advance, settle } from "@/lib/mine-math";
import type { SeasonSnapshot } from "@/lib/season-model";
import { useActiveAddress } from "@/lib/use-account";
import { useChainNow } from "@/lib/use-now";
import { useMyRigs } from "@/lib/use-season";

export default function ClaimPage() {
  return <SeasonShell>{(snap) => <Claim snap={snap} />}</SeasonShell>;
}

function Claim({ snap }: { snap: SeasonSnapshot }) {
  const dep = useDeployment();
  const account = useActiveAddress();
  const now = useChainNow(snap, 1000);
  const { rigs, refetch } = useMyRigs(dep.mine, snap);
  const { g } = advance(snap.config, snap.global, now);
  const p = snap.params;
  const spb = p.shiftsPerBlock;
  const closed = g.closeX !== 0n;
  const write = useWriteContract();
  const rcpt = useWaitForTransactionReceipt({ hash: write.data });
  const [busyRig, setBusyRig] = useState<bigint | null>(null);
  useEffect(() => {
    if (rcpt.isSuccess && busyRig !== null) { setBusyRig(null); write.reset(); refetch(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rcpt.isSuccess]);
  const found = (b: number) => (g.shiftEndX[(b + 1) * spb - 1] ?? 0n) !== 0n || closed;
  const act = (fn: "claimAll" | "withdraw", id: bigint) => { if (!account) return; setBusyRig(id); write.writeContract({ address: dep.mine, abi: seasonMineAbi, functionName: fn, args: [id], account }); };

  return (
    <div className="p-4 md:px-8 md:py-6 max-w-[1100px] mx-auto flex flex-col gap-5">
      <div className="flex items-center gap-3"><div className="font-display uppercase tracking-[0.02em] text-[36px] font-medium">Claim</div>{closed && <Chip>Mine sealed</Chip>}</div>
      {!account && <Panel className="text-mine-muted text-[14px]">Connect a wallet to see claimable fragments.</Panel>}
      {rigs.map((r) => {
        const s = settle(snap.config, r.state, g);
        const rows = [0, 1, 2, 3].map((b) => ({ b, frags: s.earned[b] / 10n ** 18n, found: found(b) }));
        const claimable = rows.filter((x) => x.found && x.frags > 0n).reduce((a, x) => a + x.frags, 0n);
        return (
          <Panel key={String(r.id)} className="flex flex-col gap-4" data-testid={`claim-rig-${r.id}`}>
            <div className="flex justify-between items-center"><div className="font-display uppercase text-[22px] font-semibold">Rig #{String(r.id).padStart(4, "0")}</div>{s.inactive && <Chip>Stopped</Chip>}</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {rows.map((x) => (
                <div key={x.b} className={`border border-mine-line rounded-sm p-3 flex flex-col gap-1 ${!x.found ? "opacity-60" : ""}`}>
                  <div className="flex justify-between"><div className="font-display uppercase text-[18px] font-semibold">{TICKERS[x.b]}</div><Chip tone={x.found ? "signal" : "muted"}>{x.found ? "found" : "mining"}</Chip></div>
                  <Mono className="text-[15px]">{formatInt(x.frags)} frag</Mono>
                  <Mono className="text-mine-muted text-[12px]">{(Number(x.frags) / Number(p.fragPerToken)).toFixed(3)} {TICKERS[x.b]}{x.found ? "" : " · est. so far"}</Mono>
                </div>
              ))}
            </div>
            <div className="flex gap-2 flex-wrap">
              <Btn tone="signal" disabled={claimable === 0n || busyRig !== null} onClick={() => act("claimAll", r.id)} data-testid={`claim-all-${r.id}`}>{busyRig === r.id ? "Confirming…" : `Claim ${formatInt(claimable)} fragments`}</Btn>
              {closed && !s.inactive && <Btn tone="ember" disabled={busyRig !== null} onClick={() => act("withdraw", r.id)} data-testid={`withdraw-${r.id}`}>Withdraw {formatRig(r.amount)} {r.asset === 0 ? "RIG" : "LP"}</Btn>}
            </div>
            {write.error && busyRig === r.id && <div className="text-[12px] text-[var(--heat-hot)] font-data">{write.error.message.split("\n")[0]}</div>}
          </Panel>
        );
      })}
      {account && rigs.length === 0 && <Panel className="text-mine-muted text-[14px]">No rigs for this wallet.</Panel>}
      <Label className="text-mine-dim">Fragments never expire inside the mine. Redemption has a window after close.</Label>
    </div>
  );
}
