"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useContext } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { DevAccountContext, useActiveAddress } from "@/lib/use-account";
import { short } from "@/lib/format";
import { LogoMark } from "./Icons";

const LINKS = [["/mine", "Mine"], ["/claim", "Claim"], ["/redeem", "Redeem"], ["/leaderboard", "Leaderboard"]] as const;

export function Nav() {
  const path = usePathname();
  return (
    <header className="h-14 flex items-center gap-4 md:gap-8 px-4 md:px-8 bg-shell-card text-shell-fg border-b border-shell-line">
      <Link href="/" className="flex items-center gap-2.5">
        <LogoMark size={26} />
        <span className="font-display uppercase tracking-[0.02em] text-[34px] font-bold leading-none whitespace-nowrap translate-y-[2px]">Stock Miner</span>
      </Link>
      <nav className="hidden md:flex gap-6 text-[15px] font-medium text-shell-muted">
        {LINKS.map(([href, label]) => <Link key={href} href={href} className={path.startsWith(href) ? "text-shell-fg" : ""}>{label}</Link>)}
      </nav>
      <div className="ml-auto"><WalletButton /></div>
    </header>
  );
}

export function WalletButton() {
  const { isConnected, addresses, connector } = useAccount();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const dev = useContext(DevAccountContext);
  const active = useActiveAddress();
  const mock = connectors.find((c) => c.id === "mock");
  if (!isConnected) {
    return (
      <div className="flex gap-2">
        {connectors.filter((c) => c.id !== "mock").slice(0, 1).map((c) => (
          <button key={c.uid} onClick={() => connect({ connector: c })} disabled={isPending} className="h-9 px-3.5 border border-[var(--shell-line-strong)] rounded-full text-[13px]">Connect wallet</button>
        ))}
        {mock && <button onClick={() => connect({ connector: mock })} className="h-9 px-3.5 border border-dashed border-[var(--shell-line-strong)] rounded-full text-[13px] text-shell-muted" data-testid="connect-dev">Dev accounts</button>}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      {connector?.id === "mock" && addresses && (
        <select aria-label="Acting as" data-testid="dev-account" className="h-9 px-2 border border-[var(--shell-line-strong)] rounded-full text-[12px] font-data bg-white" value={dev.index ?? 0} onChange={(e) => dev.setIndex(Number(e.target.value))}>
          {addresses.map((a, i) => <option key={a} value={i}>Dev {i} · {short(a)}</option>)}
        </select>
      )}
      <button onClick={() => disconnect()} className="h-9 px-3.5 border border-[var(--shell-line-strong)] rounded-full text-[13px] font-data" title="Disconnect">
        {active ? short(active) : "…"}
      </button>
    </div>
  );
}
