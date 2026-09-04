"use client";
import { useReads } from "@/lib/reads";
import { useDeployment } from "@/app/providers";
import { Mono } from "@/components/ui";
import { short } from "@/lib/format";
import SeasonFactoryJson from "@/abi/SeasonFactory.json";
import type { Abi } from "viem";

const factoryAbi = SeasonFactoryJson as Abi;

export default function SeasonsPage() {
  const dep = useDeployment();
  const count = useReads([{ address: dep.factory, abi: factoryAbi, functionName: "seasonCount" }]);
  const n = Number((count.data?.[0]?.result as bigint | undefined) ?? 0n);
  const q = useReads(Array.from({ length: n }, (_, i) => ({ address: dep.factory, abi: factoryAbi, functionName: "season", args: [BigInt(i)] })), { enabled: n > 0 });
  return (
    <main className="min-h-[calc(100vh-var(--lp-header-height))] bg-shell-bg text-shell-fg px-4 md:px-8 py-10 max-w-[1100px] mx-auto flex flex-col gap-6">
      <div className="font-display uppercase tracking-[0.02em] text-[80px] font-bold leading-none">Seasons</div>
      <div className="bg-shell-card border border-shell-line rounded-lg">
        {(q.data ?? []).map((r, i) => {
          const [mine, fragments, vault] = (r.result as [string, string, string] | undefined) ?? ["", "", ""];
          return (
            <div key={i} className="grid grid-cols-[auto_1fr_1fr_1fr] gap-6 items-center p-4 border-b border-shell-line last:border-0">
              <div className="font-display leading-none uppercase text-[40px] font-semibold">Season {i + 1}</div>
              <Mono className="text-[13px]">mine {short(mine)}</Mono><Mono className="text-[13px]">fragments {short(fragments)}</Mono><Mono className="text-[13px]">vault {short(vault)}</Mono>
            </div>
          );
        })}
        {n === 0 && <div className="p-6 text-shell-muted">No seasons registered.</div>}
      </div>
    </main>
  );
}
