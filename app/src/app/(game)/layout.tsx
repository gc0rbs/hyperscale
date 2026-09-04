import Link from "next/link";
import { getDeployment } from "@/lib/deployment";
import { Providers } from "../providers";
import { Nav } from "@/components/Nav";
import { DevAccountProvider } from "@/components/DevAccountProvider";
import { LogoMark } from "@/components/Icons";

export const dynamic = "force-dynamic";

export default function GameLayout({ children }: { children: React.ReactNode }) {
  const deployment = getDeployment();
  if (!deployment) {
    return (
      <main className="min-h-screen bg-mine-bg text-mine-fg p-8 flex flex-col items-start justify-center gap-6 max-w-none">
        <Link href="/" aria-label="Stock Miner home"><LogoMark size={48} /></Link>
        <h1 className="font-display leading-none uppercase text-[96px] font-semibold">The next mine is coming.</h1>
        <p className="text-mine-muted max-w-[480px]">There isn’t an active season available here yet. Explore how Stock Miner works while the next mine gets ready.</p>
        <Link href="/#how-it-works" className="text-ember underline underline-offset-4">Explore the game →</Link>
      </main>
    );
  }
  return <Providers deployment={deployment}><DevAccountProvider><Nav />{children}</DevAccountProvider></Providers>;
}
