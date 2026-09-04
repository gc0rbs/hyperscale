"use client";
import { useMemo } from "react";
import { useBlock } from "wagmi";
import { useActiveAddress } from "./use-account";
import type { Address } from "viem";
import { seasonMineAbi, redemptionVaultAbi } from "./contracts";
import { toConfig, toParams, toRigState, type RigSnapshot, type SeasonSnapshot } from "./season-model";
import { advance, settle } from "./mine-math";
import { useReads, type Call, type ReadResult } from "./reads";

const POLL = 10_000;

export function useSeason(mine: Address, vault: Address) {
  const globalCalls: Call[] = [
    { address: mine, abi: seasonMineAbi, functionName: "params" },
    { address: mine, abi: seasonMineAbi, functionName: "shift" },
    { address: mine, abi: seasonMineAbi, functionName: "workInShift" },
    { address: mine, abi: seasonMineAbi, functionName: "lastX" },
    { address: mine, abi: seasonMineAbi, functionName: "totalHash" },
    { address: mine, abi: seasonMineAbi, functionName: "closeX" },
    { address: mine, abi: seasonMineAbi, functionName: "phase" },
    { address: vault, abi: redemptionVaultAbi, functionName: "funded" },
    ...[0, 1, 2, 3].map((b) => ({ address: mine, abi: seasonMineAbi, functionName: "ratePerWork", args: [b] })),
  ];
  const q = useReads(globalCalls, { refetchInterval: POLL });

  const shift = q.data?.[1]?.result as number | undefined;
  const boundaryCalls = useMemo(() => {
    if (shift === undefined) return [] as Call[];
    const calls: Call[] = [];
    for (let k = 0; k < Math.min(shift, 32); k++) calls.push({ address: mine, abi: seasonMineAbi, functionName: "shiftEndX", args: [k] });
    for (let k = shift; k < Math.min(shift + 3, 33); k++) calls.push({ address: mine, abi: seasonMineAbi, functionName: "ocExpiring", args: [k] });
    return calls;
  }, [mine, shift]);
  const b = useReads(boundaryCalls, { enabled: boundaryCalls.length > 0, refetchInterval: POLL });
  const block = useBlock({ query: { refetchInterval: POLL } });
  const chainTs = block.data?.timestamp;

  const snapshot: SeasonSnapshot | undefined = useMemo(() => {
    if (!q.data || q.data.some((r) => r.status !== "success")) return undefined;
    if (chainTs === undefined) return undefined;
    if (shift === undefined) return undefined;
    if (boundaryCalls.length > 0 && !b.data) return undefined;
    const params = toParams(q.data[0].result);
    const rate = [8, 9, 10, 11].map((i) => q.data![i].result as bigint);
    const shiftEndX: Record<number, bigint> = {};
    const ocExpiring: Record<number, bigint> = {};
    const nEnds = Math.min(shift, 32);
    (b.data ?? []).forEach((r: ReadResult, i: number) => {
      if (r.status !== "success") return;
      if (i < nEnds) shiftEndX[i] = r.result as bigint;
      else ocExpiring[shift + (i - nEnds)] = r.result as bigint;
    });
    return {
      params,
      config: toConfig(params, rate),
      global: { shift, workInShift: q.data[2].result as bigint, lastX: q.data[3].result as bigint, totalHash: q.data[4].result as bigint, closeX: q.data[5].result as bigint, ocExpiring, shiftEndX },
      phase: Number(q.data[6].result),
      funded: Boolean(q.data[7].result),
      fetchedAt: Date.now(),
      chainTime: chainTs,
      chainOffset: chainTs - BigInt(Math.floor(Date.now() / 1000)),
    };
  }, [q.data, b.data, shift, boundaryCalls.length, chainTs]);

  return { snapshot, isLoading: q.isLoading, error: q.error ?? b.error, refetch: () => { q.refetch(); b.refetch(); block.refetch(); } };
}

export function useMyRigs(mine: Address, snapshot?: SeasonSnapshot) {
  const address = useActiveAddress();
  const ids = useReads(address ? [{ address: mine, abi: seasonMineAbi, functionName: "rigsOf", args: [address] }] : [], { enabled: Boolean(address), refetchInterval: POLL });
  const rigIds = (ids.data?.[0]?.result as bigint[] | undefined) ?? [];
  return useRigs(mine, rigIds, snapshot);
}

export function useRigs(mine: Address, rigIds: readonly bigint[], snapshot?: SeasonSnapshot) {
  const calls = useMemo<Call[]>(
    () =>
      rigIds.flatMap((id) => [
        { address: mine, abi: seasonMineAbi, functionName: "rigs", args: [id] },
        { address: mine, abi: seasonMineAbi, functionName: "rigHash", args: [id] },
        ...[0, 1, 2, 3].map((b) => ({ address: mine, abi: seasonMineAbi, functionName: "pending", args: [id, b] })),
      ]),
    [mine, rigIds],
  );
  const q = useReads(calls, { enabled: calls.length > 0, refetchInterval: POLL });
  const rigs: RigSnapshot[] = useMemo(() => {
    if (!q.data) return [];
    const out: RigSnapshot[] = [];
    rigIds.forEach((id, i) => {
      const base = i * 6;
      const raw = q.data![base]?.result as Record<string, unknown> | undefined;
      if (!raw) return;
      const state = toRigState(raw);
      let live = state;
      if (snapshot) {
        const { g } = advance(snapshot.config, snapshot.global, snapshot.chainTime);
        live = settle(snapshot.config, state, g);
      }
      out.push({
        id,
        owner: raw.owner as Address,
        asset: Number(raw.asset),
        amount: BigInt(raw.amount as bigint),
        weight: BigInt(raw.weight as bigint),
        gpuTier: Number(raw.gpuTier),
        coolingTier: Number(raw.coolingTier),
        claimedMask: Number(raw.claimedMask),
        state: live,
        pendingChain: [0, 1, 2, 3].map((b) => (q.data![base + 2 + b]?.result as bigint | undefined) ?? 0n),
        liveHash: (q.data![base + 1]?.result as bigint | undefined) ?? 0n,
      });
    });
    return out;
  }, [q.data, rigIds, snapshot]);
  return { rigs, isLoading: q.isLoading, refetch: q.refetch };
}
