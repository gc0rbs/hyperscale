"use client";
import { useReads } from "@/lib/reads";
import { useDeployment } from "@/app/providers";
import { Mono } from "@/components/ui";
import { short } from "@/lib/format";
import SeasonFactoryJson from "@/abi/SeasonFactory.json";
import type { Abi } from "viem";
import { INDEXER_URL, useIndexer } from "@/lib/indexer";
import { formatEta } from "@/lib/format";

const factoryAbi = SeasonFactoryJson as Abi;

interface SeasonRow { openTime: string; shift: number; closeX: string | null; closedAt: string | null; closedByFailSafe: boolean; cancelledAt: string | null; rigCount: number; walletCount: number; blocks: { id: number; foundAt: string }[] }

/** Audit I1: history for the current mine from the indexer (duration, rigs, wallets, blocks found). */
function CurrentMine() {
  const q = useIndexer<SeasonRow>("/season", 30_000);
  const s = q.data;
  if (!s) return null;
  const open = Number(s.openTime);
  const closed = s.closedAt ? Number(s.closedAt) : null;
  return (
    <div className="bg-shell-card border border-shell-line rounded-lg p-4 grid grid-cols-2 md:grid-cols-5 gap-4" data-testid="season-summary">
      <div><div className="text-[11px] uppercase tracking-[0.08em] text-shell-muted">Opened</div><Mono className="text-[14px]">{new Date(open * 1000).toISOString().slice(0, 16).replace("T", " ")}</Mono></div>
      <div><div className="text-[11px] uppercase tracking-[0.08em] text-shell-muted">Duration</div><Mono className="text-[14px]">{closed ? formatEta(closed - open) : "running"}{s.closedByFailSafe ? " · cap" : ""}{s.cancelledAt ? " · cancelled" : ""}</Mono></div>
      <div><div className="text-[11px] uppercase tracking-[0.08em] text-shell-muted">Blocks found</div><Mono className="text-[14px]">{s.blocks.length}</Mono></div>
      <div><div className="text-[11px] uppercase tracking-[0.08em] text-shell-muted">Rigs</div><Mono className="text-[14px]">{s.rigCount}</Mono></div>
      <div><div className="text-[11px] uppercase tracking-[0.08em] text-shell-muted">Wallets</div><Mono className="text-[14px]">{s.walletCount}</Mono></div>
    </div>
  );
}

export default function SeasonsPage() {
  const dep = useDeployment();
  const count = useReads([{ address: dep.factory, abi: factoryAbi, functionName: "seasonCount" }]);
  const n = Number((count.data?.[0]?.result as bigint | undefined) ?? 0n);
  const q = useReads(Array.from({ length: n }, (_, i) => ({ address: dep.factory, abi: factoryAbi, functionName: "season", args: [BigInt(i)] })), { enabled: n > 0 });
  return (
    <main className="min-h-[calc(100vh-56px)] bg-shell-bg text-shell-fg px-4 md:px-8 py-10 max-w-[1100px] mx-auto flex flex-col gap-6">
      <div className="font-display uppercase tracking-[0.02em] text-[80px] font-bold leading-none">Mines</div>
      {INDEXER_URL && <CurrentMine />}
      <div className="bg-shell-card border border-shell-line rounded-lg">
        {(q.data ?? []).map((r, i) => {
          const [mine, fragments, vault] = (r.result as [string, string, string] | undefined) ?? ["", "", ""];
          return (
            <div key={i} className="grid grid-cols-[auto_1fr_1fr_1fr] gap-6 items-center p-4 border-b border-shell-line last:border-0">
              <div className="font-display leading-none uppercase text-[40px] font-semibold">Mine {i + 1}</div>
              <Mono className="text-[13px]">mine {short(mine)}</Mono><Mono className="text-[13px]">fragments {short(fragments)}</Mono><Mono className="text-[13px]">vault {short(vault)}</Mono>
            </div>
          );
        })}
        {n === 0 && <div className="p-6 text-shell-muted">No seasons registered.</div>}
      </div>
    </main>
  );
}
