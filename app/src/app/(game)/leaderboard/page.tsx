"use client";
import { useMemo } from "react";
import { useReads } from "@/lib/reads";
import { useDeployment } from "@/app/providers";
import { SeasonShell } from "@/components/SeasonShell";
import { Label, Mono } from "@/components/ui";
import { seasonMineAbi } from "@/lib/contracts";
import { formatHash, formatRig, short } from "@/lib/format";
import { advance, settle } from "@/lib/mine-math";
import { toRigState, type SeasonSnapshot } from "@/lib/season-model";
import { useActiveAddress } from "@/lib/use-account";
import { useChainNow } from "@/lib/use-now";

/** Reads every rig straight from the chain (NFR-4); the indexer's /leaderboard is the scalable path. */
export default function LeaderboardPage() {
  return <SeasonShell dark={false}>{(snap) => <Board snap={snap} />}</SeasonShell>;
}

function Board({ snap }: { snap: SeasonSnapshot }) {
  const dep = useDeployment();
  const me = useActiveAddress();
  const now = useChainNow(snap, 2000);
  const count = useReads([{ address: dep.mine, abi: seasonMineAbi, functionName: "rigCount" }], { refetchInterval: 15000 });
  const n = Number((count.data?.[0]?.result as bigint | undefined) ?? 0n);
  const ids = useMemo(() => Array.from({ length: Math.min(n, 200) }, (_, i) => BigInt(i)), [n]);
  const q = useReads(ids.map((id) => ({ address: dep.mine, abi: seasonMineAbi, functionName: "rigs", args: [id] })), { enabled: ids.length > 0, refetchInterval: 15000 });
  const { g } = advance(snap.config, snap.global, now);
  const rows = useMemo(() => {
    const out = (q.data ?? []).map((r, i) => {
      const raw = r.result as Record<string, unknown> | undefined;
      if (!raw) return null;
      const s = settle(snap.config, toRigState(raw), g);
      const hash = s.inactive ? 0n : s.baseHash + s.ocHash;
      const earned = s.earned.reduce((a, b) => a + b / 10n ** 18n, 0n);
      return { id: ids[i], owner: raw.owner as string, hash, earned, weight: raw.weight as bigint, gpu: Number(raw.gpuTier), cool: Number(raw.coolingTier), inactive: s.inactive };
    }).filter(Boolean) as { id: bigint; owner: string; hash: bigint; earned: bigint; weight: bigint; gpu: number; cool: number; inactive: boolean }[];
    return out.sort((a, b) => (b.hash > a.hash ? 1 : b.hash < a.hash ? -1 : 0));
  }, [q.data, ids, snap.config, g]);
  return (
    <div className="px-4 md:px-8 py-10 max-w-[1100px] mx-auto flex flex-col gap-6">
      <div className="font-display uppercase tracking-[0.02em] text-[80px] font-bold leading-none">Top rigs</div>
      <div className="bg-shell-card border border-shell-line rounded-lg overflow-x-auto">
        <table className="w-full text-[14px]">
          <thead><tr className="text-left text-shell-muted"><th className="p-4"><Label className="text-shell-muted">#</Label></th><th className="p-4"><Label className="text-shell-muted">Rig</Label></th><th className="p-4"><Label className="text-shell-muted">Owner</Label></th><th className="p-4"><Label className="text-shell-muted">Hash</Label></th><th className="p-4"><Label className="text-shell-muted">Stake</Label></th><th className="p-4"><Label className="text-shell-muted">Tiers</Label></th><th className="p-4"><Label className="text-shell-muted">Earned frag</Label></th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={String(r.id)} className={`border-t border-shell-line ${me && r.owner.toLowerCase() === me.toLowerCase() ? "bg-[var(--signal-tint)]" : ""} ${r.inactive ? "opacity-50" : ""}`}>
                <td className="p-4"><Mono>{String(i + 1).padStart(2, "0")}</Mono></td>
                <td className="p-4 font-display leading-none uppercase font-semibold text-[36px]">#{String(r.id).padStart(4, "0")}{me && r.owner.toLowerCase() === me.toLowerCase() && <span className="ml-2 text-[11px] text-signal-deep">YOU</span>}</td>
                <td className="p-4"><Mono>{short(r.owner)}</Mono></td>
                <td className="p-4"><Mono>{formatHash(r.hash)}</Mono></td>
                <td className="p-4"><Mono>{formatRig(r.weight)}</Mono></td>
                <td className="p-4"><Mono>GPU {r.gpu} · cool {r.cool}</Mono></td>
                <td className="p-4"><Mono>{r.earned.toLocaleString()}</Mono></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td className="p-6 text-shell-muted" colSpan={7}>No rigs yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="text-[12px] text-shell-muted">Live from the chain, first 200 rigs. The indexer serves the full list.</div>
    </div>
  );
}
