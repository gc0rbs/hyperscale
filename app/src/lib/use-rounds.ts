"use client";
import { useMemo } from "react";
import { useBlock } from "wagmi";
import type { Address } from "viem";
import { useActiveAddress } from "./use-account";
import { erc20Abi, roundMineAbi, TICKERS } from "./contracts";
import { roundAt, STOCKS, toRoundParams, toRoundRig, type RoundRig, type RoundSnapshot } from "./round-model";
import { useReads, type Call } from "./reads";

const POLL = 5_000;
const S = [0, 1, 2, 3] as const;

export interface RoundsDeploymentLike { mine: Address; stocks: readonly Address[]; genesis: number; roundSeconds: number }

/**
 * One multicall for the whole mine state (docs/13): params, round indices, the current pot per
 * stock with its rollover, the previous round's pot and claims, work in both rounds and what is
 * scheduled next. The round index is derived from the block timestamp so the calls can be built
 * in the same render; the contract's own `currentRound()` is read alongside as a check.
 */
export function useRounds(dep: RoundsDeploymentLike) {
  const { mine, stocks } = dep;
  const block = useBlock({ query: { refetchInterval: POLL } });
  const chainTs = block.data?.timestamp;
  const cur = chainTs === undefined ? undefined : roundAt(BigInt(dep.genesis), dep.roundSeconds, chainTs);

  const calls = useMemo<Call[]>(() => {
    if (cur === undefined) return [];
    const c = BigInt(cur);
    const out: Call[] = [
      { address: mine, abi: roundMineAbi, functionName: "params" },
      { address: mine, abi: roundMineAbi, functionName: "currentRound" },
      { address: mine, abi: roundMineAbi, functionName: "closedRounds" },
      { address: mine, abi: roundMineAbi, functionName: "totalHash" },
      { address: mine, abi: roundMineAbi, functionName: "halted" },
      { address: mine, abi: roundMineAbi, functionName: "paused" },
      ...S.map((s) => ({ address: mine, abi: roundMineAbi, functionName: "pot", args: [c, s] })),
      { address: mine, abi: roundMineAbi, functionName: "roundWork", args: [c] },
      ...S.map((s) => ({ address: mine, abi: roundMineAbi, functionName: "scheduled", args: [s, c + 1n] })),
    ];
    if (cur > 0) {
      out.push(
        ...S.map((s) => ({ address: mine, abi: roundMineAbi, functionName: "pot", args: [c - 1n, s] })),
        ...S.map((s) => ({ address: mine, abi: roundMineAbi, functionName: "claimedOf", args: [c - 1n, s] })),
        { address: mine, abi: roundMineAbi, functionName: "roundWork", args: [c - 1n] },
      );
    }
    return out;
  }, [mine, cur]);
  const q = useReads(calls, { enabled: calls.length > 0, refetchInterval: POLL });

  const symbolReads = useReads(stocks.map((a) => ({ address: a, abi: erc20Abi, functionName: "symbol" })), { enabled: stocks.length > 0, tolerateFailures: true });
  const symbols = useMemo(() => (stocks.length ? stocks : [...TICKERS]).map((_, i) => {
    const r = symbolReads.data?.[i];
    return r?.status === "success" && typeof r.result === "string" && r.result ? (r.result as string) : (TICKERS[i] ?? `Stock ${i + 1}`);
  }), [stocks, symbolReads.data]);

  const snapshot: RoundSnapshot | undefined = useMemo(() => {
    if (cur === undefined || chainTs === undefined) return undefined;
    const d = q.data;
    if (!d || d.length < 15 || d.some((r) => r.status !== "success")) return undefined;
    const big = (i: number) => BigInt(d[i].result as bigint);
    const zeros = S.map(() => 0n);
    return {
      params: toRoundParams(d[0].result),
      symbols,
      round: cur,
      closedRounds: Number(d[2].result),
      totalHash: big(3),
      halted: Boolean(d[4].result),
      paused: Boolean(d[5].result),
      pot: S.map((s) => big(6 + s)),
      roundWork: big(10),
      nextScheduled: S.map((s) => big(11 + s)),
      prevPot: cur > 0 ? S.map((s) => big(15 + s)) : zeros,
      prevClaimed: cur > 0 ? S.map((s) => big(19 + s)) : zeros,
      prevRoundWork: cur > 0 ? big(23) : 0n,
      fetchedAt: Date.now(),
      chainTime: chainTs,
      chainOffset: chainTs - BigInt(Math.floor(Date.now() / 1000)),
    };
  }, [q.data, cur, chainTs, symbols]);

  return { snapshot, isLoading: q.isLoading || block.isLoading, error: q.error ?? (block.error as Error | null), refetch: () => { q.refetch(); block.refetch(); } };
}

/** The acting wallet's rigs: rigsOf, then rigs / rigHash / rigWork(cur) / rigWork(cur-1) / claimable per rig, one multicall. */
export function useMyRoundRigs(mine: Address, round: number | undefined) {
  const address = useActiveAddress();
  const ids = useReads(address ? [{ address: mine, abi: roundMineAbi, functionName: "rigsOf", args: [address] }] : [], { enabled: Boolean(address), refetchInterval: POLL });
  const rigIds = useMemo(() => ((ids.data?.[0]?.result as bigint[] | undefined) ?? []).map(BigInt), [ids.data]);
  const calls = useMemo<Call[]>(() => {
    if (round === undefined) return [];
    const c = BigInt(round);
    const prev = round > 0 ? c - 1n : c;
    return rigIds.flatMap((id) => [
      { address: mine, abi: roundMineAbi, functionName: "rigs", args: [id] },
      { address: mine, abi: roundMineAbi, functionName: "rigHash", args: [id] },
      { address: mine, abi: roundMineAbi, functionName: "rigWork", args: [id, c] },
      { address: mine, abi: roundMineAbi, functionName: "rigWork", args: [id, prev] },
      { address: mine, abi: roundMineAbi, functionName: "claimable", args: [id] },
    ]);
  }, [mine, rigIds, round]);
  const q = useReads(calls, { enabled: calls.length > 0, refetchInterval: POLL });
  const rigs: RoundRig[] = useMemo(() => {
    if (!q.data || round === undefined) return [];
    const out: RoundRig[] = [];
    rigIds.forEach((id, i) => {
      const b = i * 5;
      const raw = q.data![b]?.result;
      if (!raw) return;
      const claimable = ((q.data![b + 4]?.result as bigint[] | undefined) ?? []).map(BigInt);
      while (claimable.length < STOCKS) claimable.push(0n);
      out.push(toRoundRig(
        id,
        raw,
        BigInt((q.data![b + 1]?.result as bigint | undefined) ?? 0n),
        BigInt((q.data![b + 2]?.result as bigint | undefined) ?? 0n),
        round > 0 ? BigInt((q.data![b + 3]?.result as bigint | undefined) ?? 0n) : 0n,
        claimable,
      ));
    });
    return out;
  }, [q.data, rigIds, round]);
  return { rigs, isLoading: ids.isLoading || q.isLoading, refetch: () => { ids.refetch(); q.refetch(); } };
}
