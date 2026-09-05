"use client";
import { useQuery } from "@tanstack/react-query";

/** Optional Ponder indexer (audit I1). Unset NEXT_PUBLIC_INDEXER_URL means every screen reads the chain directly. */
export const INDEXER_URL = (process.env.NEXT_PUBLIC_INDEXER_URL ?? "").replace(/\/$/, "");

export function useIndexer<T>(path: string, refetchInterval = 15_000) {
  return useQuery<T>({
    queryKey: ["indexer", path],
    enabled: Boolean(INDEXER_URL),
    refetchInterval,
    queryFn: async () => {
      const r = await fetch(`${INDEXER_URL}${path}`, { headers: { accept: "application/json" } });
      if (!r.ok) throw new Error(`indexer ${r.status}`);
      return (await r.json()) as T;
    },
  });
}
