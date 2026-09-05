import Link from "next/link";
import { LogoMark } from "@/components/Icons";

export function SeasonUnavailable() {
  return (
      <main className="min-h-screen bg-mine-bg text-mine-fg p-8 flex flex-col items-start justify-center gap-6 max-w-none">
        <Link href="/" aria-label="Stock Miner home"><LogoMark size={48} /></Link>
        <h1 className="font-display leading-none uppercase text-[96px] font-semibold">The next mine is coming.</h1>
        <p className="text-mine-muted max-w-[480px]">There isn’t an active season available here yet. Explore how Stock Miner works while the next mine gets ready.</p>
        <Link href="/#how-it-works" className="text-ember underline underline-offset-4">Explore the game →</Link>
      </main>
    );
}
