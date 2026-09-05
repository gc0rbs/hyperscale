"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useContext, useState } from "react";
import { useAccount, useChainId, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { useDeployment } from "@/app/providers";
import { useSeason } from "@/lib/use-season";
import { DevAccountContext, useActiveAddress } from "@/lib/use-account";
import { short } from "@/lib/format";
import { LogoMark } from "./Icons";
import "@/components/landing/landing.css";

const LINKS = [["/mine", "Mine"], ["/claim", "Claim"], ["/redeem", "Redeem"], ["/leaderboard", "Leaderboard"]] as const;

/** The landing page's header, reused verbatim (same classes from landing.css) so the app and the site share one chrome. */
export function Nav() {
  const path = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const links = (onPick?: () => void) =>
    LINKS.map(([href, label]) => (
      <Link key={href} href={href} aria-current={path.startsWith(href) ? "page" : undefined} onClick={onPick}>{label}</Link>
    ));
  return (
    <div className="lp-chrome">
      <header className="lp-header">
        <div className="lp-brand"><Link href="/" className="lp-logo" aria-label="Stock Miner home"><LogoMark size={34} /></Link><SeasonStatus /></div>
        <nav className="lp-desktop-nav" aria-label="Main navigation">{links()}</nav>
        <div className="lp-header-actions"><WalletButton /></div>
        <button className="lp-menu-toggle" aria-expanded={menuOpen} aria-controls="mobile-navigation" aria-label={menuOpen ? "Close menu" : "Open menu"} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? "−" : "+"}</button>
        {menuOpen && <nav id="mobile-navigation" className="lp-mobile-nav" aria-label="Mobile navigation">{links(() => setMenuOpen(false))}</nav>}
      </header>
    </div>
  );
}

const PHASES = ["Funding", "Pre-open", "Mine open", "Mine sealed", "Cancelled"] as const;

/** Header status cluster from the launch mockup (design/launch/53): live dot, season name, phase chip. */
function SeasonStatus() {
  const dep = useDeployment();
  const { snapshot } = useSeason(dep.mine, dep.vault, dep.stocks);
  const phase = snapshot?.phase;
  const tone = phase === 2 ? "live" : phase === 0 || phase === 1 ? "soon" : phase === undefined ? "idle" : "done";
  return (
    <div className={`lp-status lp-status-${tone}`} data-testid="season-status" data-phase={phase ?? ""}>
      <span className="lp-status-dot" aria-hidden />
      <span className="lp-status-name">Season {dep.seasonNumber ?? dep.seasonId + 1}</span>
      <span className="lp-status-chip">{phase === undefined ? "Reading" : PHASES[phase] ?? "Unknown"}</span>
    </div>
  );
}

function Arrow() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 19 19 5M5 5h14v14" stroke="currentColor" strokeWidth="1.5" /></svg>;
}

export function WalletButton() {
  const { isConnected, addresses, connector } = useAccount();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const dev = useContext(DevAccountContext);
  const active = useActiveAddress();
  const mock = connectors.find((c) => c.id === "mock");
  const dep = useDeployment();
  const chainId = useChainId();
  const { switchChain, isPending: switching } = useSwitchChain();
  if (!isConnected) {
    return (
      <>
        {mock && <button onClick={() => connect({ connector: mock })} className="lp-buy-token" data-testid="connect-dev">Dev accounts</button>}
        {connectors.filter((c) => c.id !== "mock").slice(0, 1).map((c) => (
          <button key={c.uid} onClick={() => connect({ connector: c })} disabled={isPending} className="lp-nav-cta"><span>Connect wallet</span><Arrow /></button>
        ))}
      </>
    );
  }
  const wrongNetwork = chainId !== dep.chainId;
  return (
    <>
      {wrongNetwork && (
        <button onClick={() => switchChain({ chainId: dep.chainId })} disabled={switching} className="lp-nav-cta" style={{ background: "var(--heat-hot)", color: "#fff" }} data-testid="switch-network"><span>{switching ? "Switching…" : "Switch network"}</span></button>
      )}
      {connector?.id === "mock" && addresses && (
        <select aria-label="Acting as" data-testid="dev-account" className="lp-account-select" value={dev.index ?? 0} onChange={(e) => dev.setIndex(Number(e.target.value))}>
          {addresses.map((a, i) => <option key={a} value={i}>Dev {i} · {short(a)}</option>)}
        </select>
      )}
      <button onClick={() => disconnect()} className="lp-nav-cta" title="Disconnect"><span>{active ? short(active) : "…"}</span><Arrow /></button>
    </>
  );
}
