"use client";
import { useEffect, useState } from "react";
import { useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { useReads } from "@/lib/reads";
import { useDeployment } from "@/app/providers";
import { SeasonShell } from "@/components/SeasonShell";
import { Btn, Mono } from "@/components/ui";
import { TICKERS, eligibilityAbi, redemptionVaultAbi, stockFragmentsAbi } from "@/lib/contracts";
import { formatEta, formatInt } from "@/lib/format";
import type { SeasonSnapshot } from "@/lib/season-model";
import { useActiveAddress } from "@/lib/use-account";
import { useChainNow } from "@/lib/use-now";

export default function RedeemPage() {
  return <SeasonShell dark={false}>{(snap) => <Redeem snap={snap} />}</SeasonShell>;
}

function Redeem({ snap }: { snap: SeasonSnapshot }) {
  const dep = useDeployment();
  const account = useActiveAddress();
  const now = useChainNow(snap, 1000);
  const closed = snap.global.closeX !== 0n;
  const zero = "0x0000000000000000000000000000000000000000" as const;
  const q = useReads(
    [
      ...[0, 1, 2, 3].map((b) => ({ address: dep.fragments, abi: stockFragmentsAbi, functionName: "balanceOf", args: [account ?? zero, b] })),
      { address: dep.eligibility, abi: eligibilityAbi, functionName: "isEligible", args: [account ?? zero] },
      { address: dep.vault, abi: redemptionVaultAbi, functionName: "redemptionEnd" },
      { address: dep.vault, abi: redemptionVaultAbi, functionName: "reserve" },
    ],
    { enabled: Boolean(account), refetchInterval: 8000 },
  );
  const bal = (b: number) => (q.data?.[b]?.result as bigint | undefined) ?? 0n;
  const eligible = Boolean(q.data?.[4]?.result);
  const end = Number((q.data?.[5]?.result as bigint | undefined) ?? 0n);
  const reserve = (q.data?.[6]?.result as bigint | undefined) ?? 0n;
  const quotes = useReads(
    [0, 1, 2, 3].map((b) => ({ address: dep.vault, abi: redemptionVaultAbi, functionName: "quoteCashOut", args: [b, bal(b)] })),
    { enabled: Boolean(q.data) && closed, refetchInterval: 15000 },
  );
  const write = useWriteContract();
  const rcpt = useWaitForTransactionReceipt({ hash: write.data });
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    if (rcpt.isSuccess && busy) { setBusy(null); write.reset(); q.refetch(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rcpt.isSuccess]);
  const act = (fn: "redeem" | "cashOut", b: number, frags: bigint) => { if (!account) return; setBusy(`${fn}-${b}`); write.writeContract({ address: dep.vault, abi: redemptionVaultAbi, functionName: fn, args: [b, frags], account }); };
  const fpt = snap.params.fragPerToken;

  return (
    <div className="px-4 md:px-8 py-10 max-w-[1240px] mx-auto grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-8">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1.5"><div className="font-display uppercase tracking-[0.02em] text-[80px] font-bold leading-none">Redeem fragments</div><div className="text-shell-muted text-[15px]">{closed ? "Season closed." : "Redemption opens when the mine closes."} One million fragments of a block equal one whole Stock Token of that block&apos;s stock.</div></div>
        <div className="bg-shell-card border border-shell-line rounded-lg px-6 py-2">
          {TICKERS.map((t, b) => {
            const frags = bal(b);
            const whole = frags / fpt;
            const quote = quotes.data?.[b]?.result as [bigint, bigint] | undefined;
            const usdc = quote ? Number(quote[0]) / 1e6 : null;
            return (
              <div key={t} className="grid grid-cols-[1.2fr_1fr_1fr_auto] gap-4 items-center py-4 border-b border-shell-line last:border-0" data-testid={`redeem-row-${b}`}>
                <div className="flex flex-col gap-0.5"><div className="font-display leading-none uppercase text-[40px] font-semibold">{t}</div><Mono className="text-[12px] text-shell-muted">{formatInt(frags)} fragments</Mono></div>
                <div className="flex flex-col gap-0.5"><Mono className="text-[18px]">{(Number(frags) / Number(fpt)).toFixed(3)}</Mono><span className="text-[12px] text-shell-muted">{formatInt(whole)} whole available</span></div>
                <div className="flex flex-col gap-0.5"><Mono className="text-[18px]">{usdc === null ? "–" : `$${usdc.toFixed(2)}`}</Mono><span className="text-[12px] text-shell-muted">cash-out quote · 1% fee</span></div>
                <div className="flex gap-2">
                  <Btn tone="shell" className="h-[38px]" disabled={!closed || !eligible || whole === 0n || busy !== null} onClick={() => act("redeem", b, whole * fpt)} title={!eligible ? "Wallet not eligible for in-kind redemption" : undefined}>Redeem</Btn>
                  <Btn tone="shellGhost" className="h-[38px]" disabled={!closed || frags === 0n || busy !== null || (usdc !== null && BigInt(Math.round(usdc * 1e6)) > reserve)} onClick={() => act("cashOut", b, frags)}>Cash out</Btn>
                </div>
              </div>
            );
          })}
        </div>
        {write.error && <div className="text-[12px] text-[var(--heat-hot)] font-data break-all">{write.error.message.split("\n")[0]}</div>}
        <div className="text-[13px] text-shell-muted leading-relaxed">Redeeming in kind sends whole Stock Tokens to this wallet. Cash out pays USDC at the oracle price minus a 1% fee, limited by the vault&apos;s reserve. Amounts under one whole token can only be cashed out.</div>
      </div>
      <div className="flex flex-col gap-5 lg:pt-[70px]">
        <div className={`bg-shell-card border rounded-lg p-6 flex flex-col gap-3 ${eligible ? "border-signal-deep" : "border-shell-line"}`} data-testid="eligibility">
          <div className="flex items-center gap-2.5"><span className={`w-7 h-7 rounded-full inline-flex items-center justify-center ${eligible ? "bg-[var(--signal-tint)] text-signal-deep" : "bg-shell-line text-shell-muted"}`}>{eligible ? "✓" : "–"}</span><div className="font-semibold text-[15px]">{!account ? "Connect a wallet" : eligible ? "Eligible for in-kind redemption" : "Not eligible for in-kind redemption"}</div></div>
          <div className="text-[13px] text-shell-muted leading-relaxed">{eligible ? "This wallet is on the Stock Token issuer's allowlist, so whole tokens can be sent to it directly." : "Only allowlisted wallets can receive Stock Tokens. You can still cash out fragments for USDC."}</div>
        </div>
        <div className="bg-shell-card border border-shell-line rounded-lg p-6 flex flex-col gap-3">
          <div className="flex justify-between"><div className="font-semibold text-[15px]">Redemption window</div><Mono className="text-[15px]">{closed && end ? formatEta(end - Number(now)) : "–"}</Mono></div>
          <div className="text-[13px] text-shell-muted leading-relaxed">{closed && end ? `Closes ${new Date(end * 1000).toISOString().slice(0, 10)}. Fragments left after that stay in your wallet but cannot be redeemed from this season's vault.` : "Opens at close and lasts 30 days."}</div>
          <div className="text-[12px] text-shell-muted">USDC reserve: {(Number(reserve) / 1e6).toLocaleString()}</div>
        </div>
      </div>
    </div>
  );
}
