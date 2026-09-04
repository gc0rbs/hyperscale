"use client";
import Link from "next/link";
import { TICKERS } from "@/lib/contracts";
import { formatInt } from "@/lib/format";
import { Gem } from "./Gem";
import { ShareButton } from "./ShareButton";

export function FoundBanner({ blockIdx, fragments, fragPerToken, onDismiss }: { blockIdx: number; fragments: bigint; fragPerToken: bigint; onDismiss: () => void }) {
  return (
    <div className="bg-signal text-[#062126] px-4 md:px-8 py-3.5 flex items-center gap-4 md:gap-6" data-testid="found-banner">
      <Gem size={36} />
      <div className="font-display leading-none uppercase tracking-[0.02em] text-[40px] font-semibold">Block {blockIdx + 1} found · {TICKERS[blockIdx]}</div>
      <div className="font-data text-[14px] hidden md:block">you mined {formatInt(fragments)} frag · {(Number(fragments) / Number(fragPerToken)).toFixed(3)} {TICKERS[blockIdx]}</div>
      <ShareButton text={`Block ${blockIdx + 1} found in Stock Miner: I mined ${(Number(fragments) / Number(fragPerToken)).toFixed(3)} ${TICKERS[blockIdx]} on Robinhood Chain.`} className="ml-auto text-[#062126] hidden sm:inline-flex" />
      <Link href="/claim" className="h-9 px-4 rounded-sm bg-[#062126] text-signal inline-flex items-center text-[14px] font-semibold">Claim {TICKERS[blockIdx]}</Link>
      <button onClick={onDismiss} aria-label="Dismiss" className="text-[#062126]">✕</button>
    </div>
  );
}
