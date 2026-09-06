"use client";
import Link from "next/link";
import { formatInt } from "@/lib/format";
import { Gem } from "./Gem";
import { ShareButton } from "./ShareButton";

export function FoundBanner({ blockIdx, symbol, fragments, fragPerToken, onDismiss }: { blockIdx: number; symbol: string; fragments: bigint; fragPerToken: bigint; onDismiss: () => void }) {
  return (
    <div className="bg-signal text-[#062126] px-4 md:px-8 py-3.5 flex items-center gap-4 md:gap-6" data-testid="found-banner">
      <Gem size={36} />
      <div className="font-display leading-none uppercase tracking-[0.02em] text-[40px] font-semibold">Block {blockIdx + 1} found · {symbol}</div>
      <div className="font-data text-[14px] hidden md:block">you mined {formatInt(fragments)} frag · {(Number(fragments) / Number(fragPerToken)).toFixed(3)} {symbol}</div>
      <ShareButton text={`Block ${blockIdx + 1} found in Hyperscale: I mined ${(Number(fragments) / Number(fragPerToken)).toFixed(3)} ${symbol} on Robinhood Chain.`} className="ml-auto text-[#062126] hidden sm:inline-flex" />
      <Link href="/claim" className="h-9 px-4 rounded-sm bg-[#062126] text-signal inline-flex items-center text-[14px] font-semibold">Claim {symbol}</Link>
      <button onClick={onDismiss} aria-label="Dismiss" className="text-[#062126]">✕</button>
    </div>
  );
}
