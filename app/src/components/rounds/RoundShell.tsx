"use client";
import { useEffect, useState } from "react";
import { useRoundsDeployment } from "@/app/providers";
import { useRounds } from "@/lib/use-rounds";
import type { RoundSnapshot } from "@/lib/round-model";
import { Btn } from "../ui";

/** Loads the rounds snapshot once for a page and renders children with it (the rounds twin of SeasonShell). */
export function RoundShell({ children, dark = true }: { children: (snap: RoundSnapshot) => React.ReactNode; dark?: boolean }) {
  const dep = useRoundsDeployment();
  const { snapshot, error, refetch } = useRounds(dep);
  const cls = dark ? "bg-mine-bg text-mine-fg" : "bg-shell-bg text-shell-fg";
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (snapshot) { setSlow(false); return; }
    const t = setTimeout(() => setSlow(true), 10_000);
    return () => clearTimeout(t);
  }, [snapshot]);
  // Audit B8: an RPC failure is an error state with a retry, never an endless spinner.
  if (!snapshot && (error || slow)) {
    return (
      <main className={`min-h-[calc(100vh-var(--lp-header-height))] ${cls} p-8 flex flex-col gap-4 max-w-[640px]`} data-testid="rpc-error">
        <div className="font-display uppercase text-[56px] leading-none font-semibold">Cannot reach the chain</div>
        <div className="font-data text-[13px] text-mine-muted break-all">{error ? error.message.split("\n")[0] : "The RPC endpoint has not answered in ten seconds."}</div>
        <div className="text-[14px] text-mine-muted">Your nodes and shards are on chain and unaffected. Check your connection or try another RPC in your wallet, then retry.</div>
        <div><Btn tone="signal" onClick={() => { setSlow(false); refetch(); }}>Retry</Btn></div>
      </main>
    );
  }
  if (!snapshot) return <main className={`min-h-[calc(100vh-var(--lp-header-height))] ${cls} p-8 text-mine-muted`} data-testid="loading">Reading the cluster…</main>;
  return (
    <main className={`min-h-[calc(100vh-var(--lp-header-height))] ${cls}`}>
      {error && <div className="px-4 md:px-8 py-2 text-[12px] font-data bg-[var(--heat-hot)] text-white">Chain reads are failing: {error.message.split("\n")[0]}. Showing the last good state. <button className="underline" onClick={() => refetch()}>Retry</button></div>}
      {children(snapshot)}
    </main>
  );
}
