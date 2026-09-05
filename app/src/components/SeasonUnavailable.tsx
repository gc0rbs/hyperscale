import Link from "next/link";
import { LogoMark } from "@/components/Icons";
import { OpeningSoon } from "@/components/OpeningSoon";
import { TICKERS } from "@/lib/contracts";

/** Shown by the game layout while no season is deployed for this chain (before `create-season`). */
export function SeasonUnavailable() {
  return (
    <main className="min-h-screen bg-mine-bg text-mine-fg">
      <header className="h-[var(--lp-header-height)] flex items-center px-6 md:px-12 border-b border-mine-line"><Link href="/" aria-label="Stock Miner home" className="inline-flex"><LogoMark size={34} /></Link></header>
      <OpeningSoon symbols={TICKERS} />
    </main>
  );
}
