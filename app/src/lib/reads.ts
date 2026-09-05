"use client";
import { useReadContracts } from "wagmi";
import type { Abi, Address } from "viem";

export interface Call {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
}
export interface ReadResult {
  status: "success" | "failure";
  result?: unknown;
  error?: Error;
}
export interface Reads {
  data?: ReadResult[];
  isLoading: boolean;
  /** The aggregate query error, or the first per-call failure (audit B8: RPC failures must surface). */
  error: Error | null;
  refetch: () => void;
}

/** Thin, loosely-typed wrapper over wagmi's multicall hook: ABIs are JSON here, so results are `unknown`. */
export function useReads(contracts: readonly Call[], query?: { enabled?: boolean; refetchInterval?: number; tolerateFailures?: boolean }): Reads {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = useReadContracts({ contracts: contracts as any, query: { enabled: query?.enabled ?? true, refetchInterval: query?.refetchInterval } } as any) as unknown as Reads;
  const firstFailure = query?.tolerateFailures ? undefined : q.data?.find((r) => r.status === "failure")?.error;
  return { data: q.data, isLoading: q.isLoading, error: q.error ?? firstFailure ?? null, refetch: q.refetch };
}
