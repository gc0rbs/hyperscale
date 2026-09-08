"use client";
import { useEffect, useState } from "react";
import { useTx } from "@/lib/use-tx";
import { useReads } from "@/lib/reads";
import { useRoundsDeployment } from "@/app/providers";
import { Btn, Mono } from "../ui";
import { eligibilityAbi, roundVaultAbi, stockFragmentsAbi } from "@/lib/contracts";
import { formatInt } from "@/lib/format";
import type { RoundSnapshot } from "@/lib/round-model";
import { useActiveAddress } from "@/lib/use-account";

const ZERO = "0x0000000000000000000000000000000000000000" as const;
const STOCKS = [0, 1, 2, 3] as const;

/** Parse a user amount into whole fragments: "0.5" tokens → 500,000 fragments; fragments are integers. */
export function parseAmount(str: string, unit: "frag" | "token", fragPerToken: bigint): bigint {
  const s = str.trim();
  if (!s || !/^\d*\.?\d*$/.test(s)) return 0n;
  if (unit === "frag") return BigInt(s.split(".")[0] || "0");
  const [w, f = ""] = s.split(".");
  const digits = fragPerToken.toString().length - 1; // 1_000_000 → 6
  const frac = (f + "0".repeat(digits)).slice(0, digits);
  return BigInt(w || "0") * fragPerToken + BigInt(frac || "0");
}

/**
 * Redeem shards from the rounds vault: any time, no window (docs/13 §2 "Fragments"). In kind for any
 * fragment amount (the vault pays fragments × 1e18 / fragPerToken of the Stock Token, so fractions are
 * fine), or cash out at the oracle price minus the fee, limited by the USDG reserve.
 */
export function RoundRedeem({ snap }: { snap: RoundSnapshot }) {
  const dep = useRoundsDeployment();
  const account = useActiveAddress();
  const T = snap.symbols;
  const fpt = snap.params.fragPerToken;
  const [unit, setUnit] = useState<"frag" | "token">("frag");
  const [inputs, setInputs] = useState<Record<number, string>>({});

  const q = useReads(
    [
      ...STOCKS.map((s) => ({ address: dep.fragments, abi: stockFragmentsAbi, functionName: "balanceOf", args: [account ?? ZERO, s] })),
      { address: dep.eligibility, abi: eligibilityAbi, functionName: "isEligible", args: [account ?? ZERO] },
      { address: dep.vault, abi: roundVaultAbi, functionName: "reserve" },
      { address: dep.vault, abi: roundVaultAbi, functionName: "cashOutFeeBps" },
    ],
    { enabled: Boolean(account), refetchInterval: 8000 },
  );
  const bal = (s: number) => BigInt((q.data?.[s]?.result as bigint | undefined) ?? 0n);
  const eligible = Boolean(q.data?.[4]?.result);
  const reserve = BigInt((q.data?.[5]?.result as bigint | undefined) ?? 0n);
  const feePct = Number((q.data?.[6]?.result as number | undefined) ?? 100) / 100;

  // Amount per stock: the typed value, or the full balance by default.
  const amounts = STOCKS.map((s) => (inputs[s] === undefined ? bal(s) : parseAmount(inputs[s], unit, fpt)));
  const quotes = useReads(
    STOCKS.map((s) => ({ address: dep.vault, abi: roundVaultAbi, functionName: "quoteCashOut", args: [s, amounts[s]] })),
    { enabled: Boolean(q.data), refetchInterval: 15000, tolerateFailures: true },
  );
  const tx = useTx();
  useEffect(() => {
    if (tx.done?.ok) { tx.reset(); q.refetch(); setInputs({}); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tx.done]);
  const act = (fn: "redeem" | "cashOut", s: number) => { if (!account) return; tx.send(`${fn}-${s}`, { address: dep.vault, abi: roundVaultAbi, functionName: fn, args: [s, amounts[s]], account }); };
  const show = (frags: bigint) => (unit === "frag" ? frags.toString() : (Number(frags) / Number(fpt)).toString());

  return (
    <div className="px-4 md:px-8 py-10 max-w-[1240px] mx-auto grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-8">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1.5"><div className="font-display uppercase tracking-[0.02em] text-[80px] font-bold leading-none">Redeem shards</div><div className="text-shell-muted text-[15px]">Any time, no window. {Number(fpt).toLocaleString("en-US")} shards equal one whole Stock Token; you can redeem any fraction in kind or cash it out.</div></div>
        <div className="flex gap-2 items-center"><span className="text-[12px] text-shell-muted">Amounts in</span>{(["frag", "token"] as const).map((u) => <button key={u} onClick={() => { setUnit(u); setInputs({}); }} className={`h-8 px-3 rounded-full text-[12px] font-semibold border ${unit === u ? "border-signal-deep text-signal-deep" : "border-shell-line text-shell-muted"}`} data-testid={`unit-${u}`}>{u === "frag" ? "shards" : "tokens"}</button>)}</div>
        <div className="bg-shell-card border border-shell-line rounded-lg px-6 py-2">
          {T.map((t, s) => {
            const frags = bal(s);
            const amt = amounts[s];
            const quote = quotes.data?.[s]?.result as [bigint, bigint] | undefined;
            const usdc = quote ? Number(quote[0]) / 1e6 : null;
            const overReserve = quote !== undefined && BigInt(quote[0]) > reserve;
            const tooMuch = amt > frags;
            return (
              <div key={t} className="grid grid-cols-1 md:grid-cols-[1fr_1.2fr_1fr_auto] gap-4 items-center py-4 border-b border-shell-line last:border-0" data-testid={`redeem-row-${s}`}>
                <div className="flex flex-col gap-0.5"><div className="font-display leading-none uppercase text-[40px] font-semibold">{t}</div><Mono className="text-[12px] text-shell-muted">{formatInt(frags)} shards · {(Number(frags) / Number(fpt)).toFixed(4)} {t}</Mono></div>
                <div className="flex flex-col gap-1">
                  <input aria-label={`${t} amount`} data-testid={`amount-${s}`} value={inputs[s] ?? show(frags)} onChange={(ev) => setInputs({ ...inputs, [s]: ev.target.value.replace(/[^0-9.]/g, "") })} inputMode="decimal" className={`h-10 px-3 bg-shell-bg border rounded-sm font-data text-[16px] outline-none focus:border-signal-deep ${tooMuch ? "border-[var(--heat-hot)]" : "border-shell-line"}`} />
                  <div className="flex justify-between text-[11px] text-shell-muted"><span>{unit === "frag" ? `${(Number(amt) / Number(fpt)).toFixed(4)} ${t}` : `${formatInt(amt)} shards`}</span><button className="text-signal-deep" onClick={() => setInputs({ ...inputs, [s]: show(frags) })}>max</button></div>
                </div>
                <div className="flex flex-col gap-0.5"><Mono className="text-[18px]">{usdc === null ? "–" : `$${usdc.toFixed(2)}`}</Mono><span className="text-[12px] text-shell-muted">{quotes.data?.[s]?.status === "failure" ? "price feed stale" : `cash-out quote · ${feePct}% fee`}{overReserve ? " · exceeds reserve" : ""}</span></div>
                <div className="flex gap-2">
                  <Btn tone="shell" className="h-[38px]" disabled={!eligible || amt === 0n || tooMuch || tx.busy} onClick={() => act("redeem", s)} title={!eligible ? "Wallet not eligible for in-kind redemption" : undefined} data-testid={`redeem-${s}`}>Redeem</Btn>
                  <Btn tone="shellGhost" className="h-[38px]" disabled={amt === 0n || tooMuch || tx.busy || !quote || overReserve || quote[0] === 0n} onClick={() => act("cashOut", s)} data-testid={`cashout-${s}`}>Cash out</Btn>
                </div>
              </div>
            );
          })}
        </div>
        {tx.error && <div className="text-[12px] text-[var(--heat-hot)] font-data break-all" data-testid="tx-error">{tx.error}</div>}
        <div className="text-[13px] text-shell-muted leading-relaxed">Redeeming in kind sends the Stock Token amount to this wallet (fractions included). Cash out pays USDG at the oracle price minus a {feePct}% fee, limited by the vault&apos;s reserve.</div>
      </div>
      <div className="flex flex-col gap-5 lg:pt-[70px]">
        <div className={`bg-shell-card border rounded-lg p-6 flex flex-col gap-3 ${eligible ? "border-signal-deep" : "border-shell-line"}`} data-testid="eligibility">
          <div className="flex items-center gap-2.5"><span className={`w-7 h-7 rounded-full inline-flex items-center justify-center ${eligible ? "bg-[var(--signal-tint)] text-signal-deep" : "bg-shell-line text-shell-muted"}`}>{eligible ? "✓" : "–"}</span><div className="font-semibold text-[15px]">{!account ? "Connect a wallet" : eligible ? "Eligible for in-kind redemption" : "Not eligible for in-kind redemption"}</div></div>
          <div className="text-[13px] text-shell-muted leading-relaxed">{eligible ? "This wallet is on the Stock Token issuer's allowlist, so tokens can be sent to it directly." : "Only allowlisted wallets can receive Stock Tokens. You can still cash out shards for USDG."}</div>
        </div>
        <div className="bg-shell-card border border-shell-line rounded-lg p-6 flex flex-col gap-3">
          <div className="font-semibold text-[15px]">No window</div>
          <div className="text-[13px] text-shell-muted leading-relaxed">Shards stay redeemable for as long as the vault holds the stock behind them, which it always does for shards already claimed, even after a halt.</div>
          <div className="text-[12px] text-shell-muted">USDG reserve: {(Number(reserve) / 1e6).toLocaleString()}</div>
        </div>
      </div>
    </div>
  );
}
