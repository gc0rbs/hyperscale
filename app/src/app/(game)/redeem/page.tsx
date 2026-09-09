"use client";
import { useEffect } from "react";
import { useTx } from "@/lib/use-tx";
import { useReads } from "@/lib/reads";
import { useAnyDeployment, useDeployment } from "@/app/providers";
import { RoundShell } from "@/components/rounds/RoundShell";
import { RoundRedeem } from "@/components/rounds/RoundRedeem";
import { SeasonShell } from "@/components/SeasonShell";
import { Btn, Mono } from "@/components/ui";
import { eligibilityAbi, redemptionVaultAbi, stockFragmentsAbi } from "@/lib/contracts";
import { formatEta, formatInt } from "@/lib/format";
import type { SeasonSnapshot } from "@/lib/season-model";
import { useActiveAddress } from "@/lib/use-account";
import { useChainNow } from "@/lib/use-now";

export default function RedeemPage() {
  const dep = useAnyDeployment();
  if (dep.kind === "rounds") return <RoundShell dark={false}>{(snap) => <RoundRedeem snap={snap} />}</RoundShell>;
  return <SeasonShell dark={false}>{(snap) => <Redeem snap={snap} />}</SeasonShell>;
}

function Redeem({ snap }: { snap: SeasonSnapshot }) {
  const dep = useDeployment();
  const account = useActiveAddress();
  const now = useChainNow(snap, 1000);
  const closed = snap.global.closeX !== 0n;
  const sealPending = !closed && snap.phase === 3; // audit B2: logically closed, close not yet persisted
  const zero = "0x0000000000000000000000000000000000000000" as const;
  const T = snap.symbols;
  const nb = snap.params.blocks;
  const feePct = snap.params.cashOutFeeBps / 100;
  const q = useReads(
    [
      ...Array.from({ length: nb }, (_, b) => b).map((b) => ({ address: dep.fragments, abi: stockFragmentsAbi, functionName: "balanceOf", args: [account ?? zero, b] })),
      { address: dep.eligibility, abi: eligibilityAbi, functionName: "isEligible", args: [account ?? zero] },
      { address: dep.vault, abi: redemptionVaultAbi, functionName: "redemptionEnd" },
      { address: dep.vault, abi: redemptionVaultAbi, functionName: "reserve" },
    ],
    { enabled: Boolean(account), refetchInterval: 8000 },
  );
  const bal = (b: number) => (q.data?.[b]?.result as bigint | undefined) ?? 0n;
  const eligible = Boolean(q.data?.[nb]?.result);
  const end = Number((q.data?.[nb + 1]?.result as bigint | undefined) ?? 0n);
  const reserve = (q.data?.[nb + 2]?.result as bigint | undefined) ?? 0n;
  const quotes = useReads(
    Array.from({ length: nb }, (_, b) => ({ address: dep.vault, abi: redemptionVaultAbi, functionName: "quoteCashOut", args: [b, bal(b)] })),
    { enabled: Boolean(q.data) && closed, refetchInterval: 15000, tolerateFailures: true },
  );
  const tx = useTx();
  useEffect(() => {
    if (tx.done?.ok) { tx.reset(); q.refetch(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tx.done]);
  const busy = tx.busy ? tx.tag : null;
  const act = (fn: "redeem" | "cashOut", b: number, frags: bigint) => { if (!account) return; tx.send(`${fn}-${b}`, { address: dep.vault, abi: redemptionVaultAbi, functionName: fn, args: [b, frags], account }); };
  const fpt = snap.params.fragPerToken;

  return (
    <div className="px-4 md:px-8 py-10 max-w-[1240px] mx-auto grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-8">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1.5"><div className="font-display uppercase tracking-[0.02em] text-[80px] font-bold leading-none">Redeem fragments</div><div className="text-shell-muted text-[15px]">{closed ? "The mine has closed." : sealPending ? "The mine has closed; the close is being recorded on chain and redemption opens with the next transaction." : "Redemption opens when the mine closes."} {Number(fpt).toLocaleString("en-US")} fragments of a block equal one whole Stock Token of that block&apos;s stock.</div></div>
        <div className="bg-shell-card border border-shell-line rounded-lg px-6 py-2">
          {T.map((t, b) => {
            const frags = bal(b);
            const whole = frags / fpt;
            const quote = quotes.data?.[b]?.result as [bigint, bigint] | undefined;
            const usdc = quote ? Number(quote[0]) / 1e6 : null;
            return (
              <div key={t} className="grid grid-cols-[1.2fr_1fr_1fr_auto] gap-4 items-center py-4 border-b border-shell-line last:border-0" data-testid={`redeem-row-${b}`}>
                <div className="flex flex-col gap-0.5"><div className="font-display leading-none uppercase text-[40px] font-semibold">{t}</div><Mono className="text-[12px] text-shell-muted">{formatInt(frags)} fragments</Mono></div>
                <div className="flex flex-col gap-0.5"><Mono className="text-[18px]">{(Number(frags) / Number(fpt)).toFixed(3)}</Mono><span className="text-[12px] text-shell-muted">{formatInt(whole)} whole available</span></div>
                <div className="flex flex-col gap-0.5"><Mono className="text-[18px]">{usdc === null ? "–" : `$${usdc.toFixed(2)}`}</Mono><span className="text-[12px] text-shell-muted">cash-out quote · {feePct}% fee</span></div>
                <div className="flex gap-2">
                  <Btn tone="shell" className="h-[38px]" disabled={!closed || !eligible || whole === 0n || busy !== null} onClick={() => act("redeem", b, whole * fpt)} title={!eligible ? "Wallet not eligible for in-kind redemption" : undefined}>Redeem</Btn>
                  <Btn tone="shellGhost" className="h-[38px]" disabled={!closed || frags === 0n || busy !== null || (usdc !== null && BigInt(Math.round(usdc * 1e6)) > reserve)} onClick={() => act("cashOut", b, frags)}>Cash out</Btn>
                </div>
              </div>
            );
          })}
        </div>
        {tx.error && <div className="text-[12px] text-[var(--heat-hot)] font-data break-all" data-testid="tx-error">{tx.error}</div>}
        <div className="text-[13px] text-shell-muted leading-relaxed">Redeeming in kind sends whole Stock Tokens to this wallet. Cash out pays USDG at the Chainlink price minus a {feePct}% fee, limited by the vault&apos;s reserve. Amounts under one whole token can only be cashed out.</div>
      </div>
      <div className="flex flex-col gap-5 lg:pt-[70px]">
        <div className={`bg-shell-card border rounded-lg p-6 flex flex-col gap-3 ${eligible ? "border-signal-deep" : "border-shell-line"}`} data-testid="eligibility">
          <div className="flex items-center gap-2.5"><span className={`w-7 h-7 rounded-full inline-flex items-center justify-center ${eligible ? "bg-[var(--signal-tint)] text-signal-deep" : "bg-shell-line text-shell-muted"}`}>{eligible ? "✓" : "–"}</span><div className="font-semibold text-[15px]">{!account ? "Connect a wallet" : eligible ? "Eligible for in-kind redemption" : "Not eligible for in-kind redemption"}</div></div>
          <div className="text-[13px] text-shell-muted leading-relaxed">{eligible ? "This wallet is on the Stock Token issuer's allowlist, so whole tokens can be sent to it directly." : "Only allowlisted wallets can receive Stock Tokens. You can still cash out fragments for USDC."}</div>
        </div>
        <div className="bg-shell-card border border-shell-line rounded-lg p-6 flex flex-col gap-3">
          <div className="flex justify-between"><div className="font-semibold text-[15px]">Redemption window</div><Mono className="text-[15px]">{closed && end ? formatEta(end - Number(now)) : "–"}</Mono></div>
          <div className="text-[13px] text-shell-muted leading-relaxed">{closed && end ? `Closes ${new Date(end * 1000).toISOString().slice(0, 10)}. Fragments left after that stay in your wallet but cannot be redeemed from this mine's vault.` : `Opens at close and lasts ${snap.params.redemptionDays} days.`}</div>
          <div className="text-[12px] text-shell-muted">USDG reserve: {(Number(reserve) / 1e6).toLocaleString()}</div>
        </div>
      </div>
    </div>
  );
}
