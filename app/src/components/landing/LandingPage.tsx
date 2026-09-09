"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LogoMark } from "@/components/Icons";
import { BRAND, TOKEN_TICKER } from "@/lib/brand";
import { RIG_ADDRESS, RIG_BUY_URL, RIG_EXPLORER_URL } from "@/lib/token";
import { Atmosphere, SceneCanvas } from "./SceneCanvas";
import { useScrollChapters } from "./useScrollChapters";

/** Landing copy from the Hyperscaler design handoff (2026-09-09), adjusted to the hourly round mine (docs/13). */
const REWARDS = [
  { ticker: "NVDA", name: "NVIDIA", category: "NVIDIA · GPUs", detail: "Redeem NVDA shards for tokens that track NVIDIA stock.", mark: "01" },
  { ticker: "MU", name: "MICRON", category: "MICRON · Memory", detail: "Redeem MU shards for tokens that track Micron stock.", mark: "02" },
  { ticker: "SNDK", name: "SANDISK", category: "SANDISK · Storage", detail: "Redeem SNDK shards for tokens that track Sandisk stock.", mark: "03" },
  { ticker: "QQQ", name: "NASDAQ 100 ETF", category: "NASDAQ-100 ETF", detail: "Redeem QQQ shards for tokens that track the Nasdaq-100 ETF.", mark: "04" },
];

function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d={diagonal ? "M5 19 19 5M5 5h14v14" : "M4 12h16m-6-6 6 6-6 6"} stroke="currentColor" strokeWidth="1.5" /></svg>;
}

// One starfield spans the header and hero, independently of the 3D viewport.
const HERO_STARS = Array.from({ length: 240 }, (_, index) => {
  const sample = (salt: number) => {
    const value = Math.sin((index + 1) * salt) * 43758.5453;
    return value - Math.floor(value);
  };
  return {
    x: `${(sample(12.9898) * 100).toFixed(3)}%`,
    y: `${(sample(78.233) * 100).toFixed(3)}%`,
    radius: (0.35 + sample(39.425) * 0.45).toFixed(3),
    opacity: (0.25 + sample(93.175) * 0.5).toFixed(3),
    color: index % 13 === 0 ? "#53db72" : "#758079",
  };
});

export function LandingPage() {
  const { hero, rig, mine, coreProgress, rigPower, reward, rewardPose } = useScrollChapters();
  const [assembled, setAssembled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const purchaseDialog = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState(false);
  const copyAddress = async () => {
    if (!RIG_ADDRESS) return;
    try { await navigator.clipboard.writeText(RIG_ADDRESS); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard blocked: the address is selectable */ }
  };

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("landing-active", "lp-motion-ready");
    const elements = document.querySelectorAll(".lp-reveal");
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    elements.forEach((element) => observer.observe(element));
    return () => { observer.disconnect(); root.classList.remove("landing-active", "lp-motion-ready"); };
  }, []);

  const buyLink = (onPick?: () => void) => RIG_BUY_URL
    ? <a className="lp-buy-token" href={RIG_BUY_URL} target="_blank" rel="noopener noreferrer" onClick={onPick}>Buy {TOKEN_TICKER}</a>
    : <button className="lp-buy-token" onClick={() => { onPick?.(); purchaseDialog.current?.showModal(); }}>Buy {TOKEN_TICKER}</button>;

  return (
    <div className="stock-landing">
      <a className="lp-skip" href="#main-content">Skip to content</a>
      <header className="lp-header">
        <Link href="/" className="lp-logo" aria-label={`${BRAND} home`}><LogoMark size={34} /></Link>
        <nav className="lp-desktop-nav" aria-label="Main navigation"><a href="#how-it-works">How it works</a><a href="#the-mine">Rewards</a><a href="#questions">FAQs</a>{buyLink()}</nav>
        <div className="lp-header-actions"><Link className="lp-nav-cta" href="/mine"><span>Open game</span><Arrow diagonal /></Link></div>
        <button className="lp-menu-toggle" aria-expanded={menuOpen} aria-controls="mobile-navigation" aria-label={menuOpen ? "Close menu" : "Open menu"} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? "−" : "+"}</button>
        {menuOpen && <nav id="mobile-navigation" className="lp-mobile-nav" aria-label="Mobile navigation"><a href="#how-it-works" onClick={() => setMenuOpen(false)}>How it works</a><a href="#the-mine" onClick={() => setMenuOpen(false)}>Rewards</a><a href="#questions" onClick={() => setMenuOpen(false)}>FAQs</a>{buyLink(() => setMenuOpen(false))}</nav>}
      </header>
      <dialog ref={purchaseDialog} className="lp-purchase-dialog" aria-labelledby="purchase-title" aria-describedby="purchase-description" onClick={(event) => { if (event.target === event.currentTarget) purchaseDialog.current?.close(); }}>
        <div className="lp-purchase-content"><LogoMark size={64} /><h2 id="purchase-title">GET <span>{TOKEN_TICKER}.</span></h2>
          {RIG_ADDRESS ? (
            <>
              <p id="purchase-description">{TOKEN_TICKER} is the only token the game accepts. Check the contract address before you buy; anything else with the name is not it.</p>
              <div className="lp-ca" data-testid="rig-ca"><span className="lp-ca-label">Contract address · Robinhood Chain</span><code className="lp-ca-address">{RIG_ADDRESS}</code><button type="button" className="lp-ca-copy" onClick={copyAddress} aria-live="polite">{copied ? "Copied" : "Copy"}</button></div>
              <div className="lp-purchase-actions">
                {RIG_BUY_URL && <a className="lp-button lp-button-primary" href={RIG_BUY_URL} target="_blank" rel="noopener noreferrer" data-testid="rig-buy">Buy {TOKEN_TICKER} <Arrow diagonal /></a>}
                {RIG_EXPLORER_URL && <a className="lp-button lp-button-outline" href={RIG_EXPLORER_URL} target="_blank" rel="noopener noreferrer">View on Blockscout <Arrow diagonal /></a>}
                <form method="dialog"><button className="lp-text-link lp-purchase-close">Close</button></form>
              </div>
            </>
          ) : (
            <><p id="purchase-description">Coming soon on Pons. The official purchase page isn’t live yet.</p><form method="dialog"><button className="lp-button lp-button-primary">Got it <Arrow /></button></form></>
          )}
        </div>
      </dialog>

      <main id="main-content">
        <section ref={hero} className="lp-hero" aria-labelledby="hero-title">
          <svg className="lp-hero-starfield" aria-hidden="true" focusable="false">
            {HERO_STARS.map((star, index) => <circle key={index} cx={star.x} cy={star.y} r={star.radius} fill={star.color} opacity={star.opacity} />)}
          </svg>
          <div className="lp-hero-copy lp-reveal">
            <h1 id="hero-title">BUILD A VIRTUAL GPU.<br /><span>EARN STOCK TOKENS.</span></h1>
            <p><strong>{BRAND} is an AI-compute strategy game.</strong> Build a virtual GPU, work through hourly rounds, and earn tokens that track stocks.</p>
            <div className="lp-hero-actions"><Link href="/mine/new" className="lp-button lp-button-primary">Set up your GPU <Arrow diagonal /></Link><a href="#how-it-works" className="lp-text-link">How it works <span>↓</span></a></div>
            <div className="lp-hero-note"><span className="lp-tiny-cross">+</span> PLAY IN YOUR BROWSER. NO PHYSICAL GPU NEEDED.</div>
          </div>
          <div className="lp-hero-art">
            <SceneCanvas kind="core" value={coreProgress} label="A vivid green silicon processor with softly illuminated green circuitry. Its board, memory modules and cooling layers separate smoothly as you scroll." />
            <div className="lp-core-callout"><span className="lp-callout-line" /><span>YOUR VIRTUAL GPU.<br />BUILT TO UPGRADE.</span></div>
          </div>
          <div className="lp-hero-bottom"><span><span className="lp-power">01</span> NEW ROUND EVERY HOUR. <span className="lp-power">04</span> STOCK-TOKEN REWARDS.</span><a href="#how-it-works">SEE HOW TO PLAY <span>↓</span></a></div>
        </section>

        <div className="lp-reward-strip" aria-label="Example stock-token rewards"><span className="lp-strip-label">TOKENS YOU CAN EARN<span>FOUR REWARD TYPES</span></span>{REWARDS.map((item) => <a href="#the-mine" key={item.ticker}><span className="lp-stock-symbol">{item.mark}</span><span>{item.ticker}<small>{item.name}</small></span><span className="lp-strip-plus">+</span></a>)}</div>

        <section ref={rig} id="how-it-works" className="lp-rig-section lp-section lp-scroll-story" aria-labelledby="rig-title">
          <div className="lp-story-stage"><Atmosphere variant="rig" /><div className="lp-rig-layout">
            <div className="lp-section-copy lp-reveal">
              <h2 id="rig-title">START WITH {TOKEN_TICKER}.<br /><span>UPGRADE YOUR GPU.</span></h2>
              <ol className="lp-steps" aria-label="How to play">
                <li><strong>Deposit {TOKEN_TICKER}.</strong><p>Use the game’s token to activate your virtual GPU.</p></li>
                <li><strong>Earn while you’re away.</strong><p>Your GPU works through every round and earns reward pieces called shards.</p></li>
                <li><strong>Upgrade for more power.</strong><p>Spend {TOKEN_TICKER} on better hardware, cooling or a temporary boost to earn a bigger share of every round.</p></li>
              </ol>
              <p className="lp-cost-note"><strong>Know the costs.</strong> Your deposit comes back when you decommission your GPU, minus a small exit fee. Setup has a fee, and {TOKEN_TICKER} spent on upgrades is permanently burned.</p>
            </div>
            <div className="lp-rig-art"><SceneCanvas kind="rig" value={rigPower} label="A virtual server node scales through three configurations as you scroll. Additional compute sleds come online and green liquid cooling lights up." /></div>
          </div></div>
        </section>

        <section ref={mine} id="the-mine" className="lp-mine-section lp-section lp-scroll-story" aria-labelledby="mine-title">
          <div className="lp-story-stage"><Atmosphere variant="reward" /><div className="lp-mine-heading lp-reveal"><h2 id="mine-title">EVERY HOUR, A NEW POT.<br /><span>FOUR REWARDS INSIDE.</span></h2><p>Each round’s pot holds pieces of four different stock tokens. These pieces are called <strong>shards</strong>. Your share is your GPU’s work over everyone’s.</p></div>
          <div className="lp-mine-layout">
            <div className="lp-block-art"><div key={reward} className="lp-block-index" aria-hidden="true">0{reward + 1}</div><SceneCanvas kind="reward" value={rewardPose} label={`Four processor cards representing the reward pot, with the ${REWARDS[reward].ticker} card brought forward as you scroll.`} /></div>
            <div className="lp-block-list lp-reveal"><div className="lp-block-list-label">YOUR REWARDS, EVERY ROUND<span>01 — 04</span></div><ol className="lp-reward-options" aria-label="Rewards in the pot">{REWARDS.map((item, index) => <li key={item.ticker} className={`lp-block-option ${reward === index ? "is-selected" : ""}`} aria-current={reward === index ? "step" : undefined}><span className="lp-block-number">0{index + 1}</span><span className="lp-block-name"><strong>{item.ticker}</strong><small>{item.category}</small></span><span className="lp-block-arrow">{reward === index ? "↗" : "·"}</span></li>)}</ol><p key={reward} className="lp-reward-detail">{REWARDS[reward].detail}</p></div>
          </div>
          <div className="lp-mine-footnote lp-reveal"><span className="lp-small-gem" aria-hidden="true">⌁</span><p><strong>The pot fills from trading fees on {TOKEN_TICKER}.</strong> It is locked when the round closes, split by work, and claimable for fifteen minutes. Whatever goes unclaimed rolls into the next round.</p></div></div>
        </section>

        <section id="the-rewards" className="lp-collect-section lp-section" aria-labelledby="collect-title">
          <Atmosphere variant="token" />
          <div className="lp-collect-layout"><div className="lp-collect-copy lp-reveal"><h2 id="collect-title">REDEEM SHARDS.<br /><span>GET STOCK TOKENS.</span></h2>
            <ol className="lp-steps lp-steps-compact" aria-label="How to redeem rewards">
              <li><strong>Claim your shards.</strong><p>One click after each round closes, inside the fifteen-minute claim window.</p></li>
              <li><strong>Exchange for stock tokens.</strong><p>Redeem at any time. Smaller amounts redeem proportionally.</p></li>
            </ol>
            <div className="lp-equation"><span><strong>1,000,000</strong><small>SHARDS</small></span><span className="lp-equals">=</span><span><strong>1</strong><small>STOCK TOKEN</small></span></div>
            <p className="lp-collect-note"><strong>Stock tokens track stocks.</strong> They aren’t direct share ownership. Redemption depends on eligibility; a USDG cash-out may be available depending on reserves and fees.</p>
            <Link href="/mine/new" className="lp-button lp-button-dark">Set up your GPU <Arrow diagonal /></Link></div>
            <div className="lp-token-art"><SceneCanvas kind="token" value={assembled ? 1 : 0} label="Glowing square shards assemble into a stock-token module when activated." /><button className="lp-scene-action" onClick={() => setAssembled(!assembled)} aria-pressed={assembled}><span className="lp-action-icon">{assembled ? "−" : "+"}</span>{assembled ? "Separate the shards" : "Assemble a token"}<span className="lp-action-hint">PREVIEW</span></button><span className="lp-token-caption">SHARDS COMBINE INTO STOCK TOKENS.</span></div></div>
          <div id="questions" className="lp-questions lp-reveal"><div><h3>BEFORE<br />YOU PLAY.</h3></div><div className="lp-faq-list">
            <details><summary>Do I need a real GPU?<span>+</span></summary><p><strong>No special hardware is needed.</strong> The GPUs and the work are virtual. Your GPU keeps working when you close the page.</p></details>
            <details><summary>What is a round?<span>+</span></summary><p><strong>A round is one hour of the shared game.</strong> Everyone’s virtual GPUs work through the same round. When it closes, the pot is split by the work each GPU did, and claims are open for fifteen minutes. Anything unclaimed rolls into the next pot.</p></details>
            <details><summary>What does it cost?<span>+</span></summary><ul className="lp-answer-list"><li><strong>Setup:</strong> Starting a GPU has a fee.</li><li><strong>Deposit:</strong> Comes back when you decommission your GPU, minus a small exit fee.</li><li><strong>Upgrades:</strong> The {TOKEN_TICKER} you spend is permanently burned.</li></ul><p>Review the fees shown before you deposit.</p></details>
            <details><summary>How are rewards paid?<span>+</span></summary><ul className="lp-answer-list"><li><strong>Claim:</strong> Collect shards within fifteen minutes of a round closing.</li><li><strong>Redeem:</strong> Eligible wallets exchange shards for the matching stock token at any time.</li><li><strong>Cash payout:</strong> May be available, depending on reserves and fees.</li></ul><p>Rewards depend on your GPU’s work and on the trading fees that funded the round.</p></details>
            <details><summary>Can the team stop the game?<span>+</span></summary><p><strong>Yes.</strong> The operator can halt the game at any time and take back the unclaimed and running pots. Deposits always come back in full, and shards you have already claimed stay redeemable. The <Link href="/terms">Terms</Link> spell this out.</p></details>
          </div></div>
        </section>
      </main>
      <footer className="lp-footer"><div className="lp-footer-top"><Link href="/" className="lp-logo"><LogoMark size={36} /><span>{BRAND.toUpperCase()}</span></Link><span>VIRTUAL GPUS. STOCK-TOKEN REWARDS.</span><a href="#main-content">BACK TO THE TOP ↑</a></div>{RIG_ADDRESS && <div className="lp-footer-ca" data-testid="footer-ca"><span>{TOKEN_TICKER} CONTRACT · ROBINHOOD CHAIN</span><code>{RIG_ADDRESS}</code><button type="button" onClick={copyAddress}>{copied ? "COPIED" : "COPY"}</button>{RIG_EXPLORER_URL && <a href={RIG_EXPLORER_URL} target="_blank" rel="noopener noreferrer">BLOCKSCOUT ↗</a>}{RIG_BUY_URL && <a href={RIG_BUY_URL} target="_blank" rel="noopener noreferrer">BUY {TOKEN_TICKER} ↗</a>}</div>}<div className="lp-footer-bottom"><span>© {new Date().getFullYear()} {BRAND.toUpperCase()}</span><span>PLAY IN YOUR BROWSER.</span><Link href="/mine">Open game <Arrow diagonal /></Link></div></footer>
    </div>
  );
}
