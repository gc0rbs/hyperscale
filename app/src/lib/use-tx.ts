"use client";
import { useEffect, useState } from "react";
import { usePublicClient, useWaitForTransactionReceipt, useWriteContract } from "wagmi";

/**
 * One transaction state machine for every write flow (audit B7): busy is derived from wagmi, never
 * held in local state, so a wallet rejection, a preflight failure or a mined revert always releases
 * the controls; a mined receipt counts as success only when its on-chain status says so.
 */
export type TxStatus = "idle" | "wallet" | "mining" | "success" | "reverted" | "error";

const FRIENDLY: Record<string, string> = {
  "User rejected": "You rejected the request in your wallet.",
  "user rejected": "You rejected the request in your wallet.",
  BelowMinStake: "That stake is below the season's minimum.",
  HeatTooHigh: "Heat would exceed 100. Wait for a shift end or buy cooling.",
  MaxOverclocks: "This rig already has the maximum active overclocks.",
  MaxTier: "This rig is already at the top tier.",
  WrongPhase: "The mine is not in a phase that allows this action.",
  EnforcedPause: "The mine is paused. Try again after it is unpaused.",
  PauseGraceNotElapsed: "The pause has not outlived its grace period yet.",
  AlreadyClaimed: "Nothing to claim for that block.",
  RigInactive: "This rig has already stopped.",
  NotOwner: "This rig belongs to another wallet.",
  NotEligible: "This wallet is not eligible for in-kind redemption. Cash out instead.",
  StalePrice: "The oracle price is stale; cash-out is paused until the feed updates. Redeem in kind instead.",
  WindowClosed: "The redemption window has closed.",
  NotClosed: "Redemption opens when the mine closes.",
  InsufficientReserve: "The USDG reserve cannot cover this cash-out. Redeem in kind instead.",
  Halted: "The mine is halted. Withdraw your stake with Emergency withdraw.",
  NotHalted: "Emergency withdraw only works once the mine is halted. Use Decommission instead.",
  NothingToClaim: "Nothing to claim for the last round.",
  ClaimWindowClosed: "The claim window for that round has closed; the remainder rolled into the next pot.",
  ReserveInsufficient: "The USDG reserve cannot cover this cash-out. Redeem in kind, or cash out a smaller amount.",
  RoundStarted: "That round has already started.",
  "insufficient funds": "Not enough ETH for gas.",
  "insufficient allowance": "Approve RIG first.",
  "transfer amount exceeds balance": "Not enough RIG in the wallet.",
};

export function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  for (const k of Object.keys(FRIENDLY)) if (msg.includes(k)) return FRIENDLY[k];
  return msg.split("\n")[0].slice(0, 200);
}

export interface TxDone { tag: string; ok: boolean }

export function useTx() {
  const write = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: write.data });
  const pub = usePublicClient();
  const [tag, setTag] = useState<string | null>(null);
  const [done, setDone] = useState<TxDone | null>(null);
  const [preflight, setPreflight] = useState<string | null>(null);
  const [simulating, setSimulating] = useState(false);

  useEffect(() => {
    if (!tag) return;
    if (receipt.data) setDone({ tag, ok: receipt.data.status === "success" });
    else if (write.error || receipt.error) setDone({ tag, ok: false });
  }, [tag, receipt.data, write.error, receipt.error]);

  const busy = simulating || write.isPending || (Boolean(write.data) && receipt.isLoading);
  const status: TxStatus = simulating || write.isPending ? "wallet" : write.data && receipt.isLoading ? "mining" : receipt.data ? (receipt.data.status === "success" ? "success" : "reverted") : preflight || write.error || receipt.error ? "error" : "idle";
  const error = preflight ?? (write.error ? friendlyError(write.error) : receipt.error ? friendlyError(receipt.error) : receipt.data?.status === "reverted" ? "The transaction was mined but reverted on chain. Nothing changed." : null);

  /** Simulates first so the contract's revert reason reaches the user, then hands the call to the wallet. */
  const send = async (nextTag: string, params: Parameters<typeof write.writeContract>[0]) => {
    setDone(null);
    setPreflight(null);
    setTag(nextTag);
    if (pub) {
      setSimulating(true);
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await pub.simulateContract(params as any);
      } catch (e) {
        setSimulating(false);
        setPreflight(friendlyError(e));
        setDone({ tag: nextTag, ok: false });
        return;
      }
      setSimulating(false);
    }
    write.writeContract(params);
  };
  const reset = () => { setTag(null); setDone(null); setPreflight(null); write.reset(); };
  return { send, busy, status, error, done, tag, reset, hash: write.data };
}
