"use client";
import { useMemo } from "react";
import { useReads } from "@/lib/reads";
import { useRoundsDeployment } from "@/app/providers";
import { Label, Mono } from "../ui";
import { roundMineAbi } from "@/lib/contracts";
import { formatCompute, formatRig, formatThroughput, short } from "@/lib/format";
import type { RoundSnapshot } from "@/lib/round-model";
import { useActiveAddress } from "@/lib/use-account";

/** Every node straight from the chain (first 200): throughput, stake, tiers, compute served this round. */
export function RoundLeaderboard({ snap }: { snap: RoundSnapshot }) {
  const dep = useRoundsDeployment();
  const me = useActiveAddress();
  const count = useReads([{ address: dep.mine, abi: roundMineAbi, functionName: "rigCount" }], { refetchInterval: 15000 });
  const n = Number((count.data?.[0]?.result as bigint | undefined) ?? 0n);
  const ids = useMemo(() => Array.from({ length: Math.min(n, 200) }, (_, i) => BigInt(i)), [n]);
  const q = useReads(
    ids.flatMap((id) => [
      { address: dep.mine, abi: roundMineAbi, functionName: "rigs", args: [id] },
      { address: dep.mine, abi: roundMineAbi, functionName: "rigHash", args: [id] },
      { address: dep.mine, abi: roundMineAbi, functionName: "rigWork", args: [id, BigInt(snap.round)] },
    ]),
    { enabled: ids.length > 0, refetchInterval: 15000 },
  );
  const rows = useMemo(() => {
    const out = ids.map((id, i) => {
      const raw = q.data?.[i * 3]?.result as Record<string, unknown> | undefined;
      if (!raw) return null;
      const inactive = Boolean(raw.inactive);
      return { id, owner: raw.owner as string, hash: inactive ? 0n : BigInt((q.data?.[i * 3 + 1]?.result as bigint | undefined) ?? 0n), work: BigInt((q.data?.[i * 3 + 2]?.result as bigint | undefined) ?? 0n), amount: BigInt(raw.amount as bigint), gpu: Number(raw.gpuTier), cool: Number(raw.coolingTier), inactive };
    }).filter((r): r is NonNullable<typeof r> => r !== null);
    return out.sort((a, b) => (b.hash > a.hash ? 1 : b.hash < a.hash ? -1 : 0));
  }, [q.data, ids]);
  return (
    <div className="px-4 md:px-8 py-10 max-w-[1100px] mx-auto flex flex-col gap-6">
      <div className="font-display uppercase tracking-[0.02em] text-[80px] font-bold leading-none">Leaderboard</div>
      <div className="font-display uppercase tracking-[0.02em] text-[40px] font-semibold leading-none">Nodes · round {snap.round}</div>
      <div className="bg-shell-card border border-shell-line rounded-lg overflow-x-auto">
        <table className="w-full text-[14px]">
          <thead><tr className="text-left text-shell-muted"><th className="p-4"><Label className="text-shell-muted">#</Label></th><th className="p-4"><Label className="text-shell-muted">Node</Label></th><th className="p-4"><Label className="text-shell-muted">Owner</Label></th><th className="p-4"><Label className="text-shell-muted">Throughput</Label></th><th className="p-4"><Label className="text-shell-muted">Stake</Label></th><th className="p-4"><Label className="text-shell-muted">Tiers</Label></th><th className="p-4"><Label className="text-shell-muted">Served this round</Label></th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={String(r.id)} className={`border-t border-shell-line ${me && r.owner.toLowerCase() === me.toLowerCase() ? "bg-[var(--signal-tint)]" : ""} ${r.inactive ? "opacity-50" : ""}`}>
                <td className="p-4"><Mono>{String(i + 1).padStart(2, "0")}</Mono></td>
                <td className="p-4 font-display leading-none uppercase font-semibold text-[36px]">#{String(r.id).padStart(4, "0")}{me && r.owner.toLowerCase() === me.toLowerCase() && <span className="ml-2 text-[11px] text-signal-deep">YOU</span>}</td>
                <td className="p-4"><Mono>{short(r.owner)}</Mono></td>
                <td className="p-4"><Mono>{formatThroughput(r.hash)}</Mono></td>
                <td className="p-4"><Mono>{formatRig(r.amount)}</Mono></td>
                <td className="p-4"><Mono>Gen {r.gpu} · cool {r.cool}</Mono></td>
                <td className="p-4"><Mono>{formatCompute(r.work)}</Mono></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td className="p-6 text-shell-muted" colSpan={7}>No nodes yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="text-[12px] text-shell-muted">Live from the chain, first 200 nodes.</div>
    </div>
  );
}
