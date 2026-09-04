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
  error: Error | null;
  refetch: () => void;
}

/** Thin, loosely-typed wrapper over wagmi's multicall hook: ABIs are JSON here, so results are `unknown`. */
export function useReads(contracts: readonly Call[], query?: { enabled?: boolean; refetchInterval?: number }): Reads {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = useReadContracts({ contracts: contracts as any, query: { enabled: query?.enabled ?? true, refetchInterval: query?.refetchInterval } } as any);
  return q as unknown as Reads;
}
