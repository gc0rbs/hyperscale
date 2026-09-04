"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon, LogoMark } from "@/components/Icons";
import { MineralScene } from "./MineralScene";

const REWARDS = [
  { ticker: "NVDAx", name: "NVIDIA", category: "The intelligence layer", detail: "The first block mines fragments of NVDAx, a token tracking NVIDIA stock.", mark: "◉" },
  { ticker: "TSLAx", name: "TESLA", category: "A different kind of electric", detail: "The second block moves to TSLAx, a token tracking Tesla stock.", mark: "T" },
  { ticker: "AAPLx", name: "APPLE", category: "Think in fragments", detail: "The third block mines AAPLx, a token tracking Apple stock.", mark: "a" },
  { ticker: "SPYx", name: "S&P 500", category: "The bigger picture", detail: "The final block mines SPYx, a token tracking an S&P 500 ETF.", mark: "↗" },
];
const TIERS = [{ name: "Starter", tier: 0 }, { name: "Upgraded", tier: 2 }, { name: "Maxed out", tier: 5 }];

function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d={diagonal ? "M5 19 19 5M5 5h14v14" : "M4 12h16m-6-6 6 6-6 6"} stroke="currentColor" strokeWidth="1.5" /></svg>;
}

// A stable starfield fills the hero independently of the existing 3D viewport.
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
    color: index % 13 === 0 ? "#65aeb1" : "#b68b45",
  };
});

export function LandingPage() {
  const hero = useRef<HTMLElement>(null);
  const [coreProgress, setCoreProgress] = useState(0);
  const [tier, setTier] = useState(0);
  const [reward, setReward] = useState(0);
  const [assembled, setAssembled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const element = hero.current;
      if (!element) return;
      const bounds = element.getBoundingClientRect();
      const heroBottom = window.scrollY + bounds.bottom;
      const progress = Math.min(1, Math.max(0, window.scrollY / Math.max(1, heroBottom)));
      setCoreProgress(progress);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const observer = new ResizeObserver(schedule);
    if (hero.current) observer.observe(hero.current);
    update();
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("landing-active");
    const elements = document.querySelectorAll(".lp-reveal");
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08 });
    elements.forEach((element) => observer.observe(element));
    return () => { observer.disconnect(); root.classList.remove("landing-active"); };
  }, []);

  return (
    <div className="stock-landing">
      <a className="lp-skip" href="#main-content">Skip to content</a>
      <header className="lp-header">
        <Link href="/" className="lp-logo" aria-label="Stock Miner home"><LogoMark size={34} /><span>STOCK MINER</span></Link>
        <nav className="lp-desktop-nav" aria-label="Main navigation"><a href="#how-it-works">The game</a><a href="#the-mine">The rewards</a><a href="#questions">Good to know</a></nav>
        <Link className="lp-nav-cta" href="/mine">Enter the mine <Arrow diagonal /></Link>
        <button className="lp-menu-toggle" aria-expanded={menuOpen} aria-controls="mobile-navigation" aria-label={menuOpen ? "Close menu" : "Open menu"} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? "−" : "+"}</button>
        {menuOpen && <nav id="mobile-navigation" className="lp-mobile-nav" aria-label="Mobile navigation"><a href="#how-it-works" onClick={() => setMenuOpen(false)}>The game</a><a href="#the-mine" onClick={() => setMenuOpen(false)}>The rewards</a><a href="#questions" onClick={() => setMenuOpen(false)}>Good to know</a></nav>}
      </header>

      <main id="main-content">
        <section ref={hero} className="lp-hero" aria-labelledby="hero-title">
          <svg className="lp-hero-starfield" aria-hidden="true" focusable="false">
            {HERO_STARS.map((star, index) => <circle key={index} cx={star.x} cy={star.y} r={star.radius} fill={star.color} opacity={star.opacity} />)}
          </svg>
          <div className="lp-hero-copy">
            <h1 id="hero-title">MINE YOUR<br /><span>NEXT MOVE.</span></h1>
            <p>Build a virtual rig. Unearth stock-token rewards.<br className="lp-desktop-break" /> Make every move count.</p>
            <div className="lp-hero-actions"><Link href="/mine/new" className="lp-button lp-button-gold">Start mining <Arrow diagonal /></Link><a href="#how-it-works" className="lp-text-link">How it works <span>↓</span></a></div>
            <div className="lp-hero-note"><span className="lp-tiny-cross">+</span> ALL THE STRATEGY. NONE OF THE HARDWARE.</div>
          </div>
          <div className="lp-hero-art">
            <MineralScene kind="core" value={coreProgress} label="An amber mineral core edged in cyan light. Its dark rock shell opens as you scroll through the hero." />
            <div className="lp-core-callout"><span className="lp-callout-line" /><span>THERE’S MORE<br />BENEATH THE SURFACE.</span></div>
          </div>
          <div className="lp-hero-bottom"><span><span className="lp-gold">04</span> BLOCKS. <span className="lp-gold">01</span> SHARED MINE. YOUR NEXT MOVE.</span><a href="#how-it-works">SCROLL TO GO DEEPER <span>↓</span></a></div>
        </section>

        <div className="lp-reward-strip" aria-label="Example stock-token rewards"><span className="lp-strip-label">IN THE MINE<span>STOCK-TOKEN REWARDS</span></span>{REWARDS.map((item) => <a href="#the-mine" key={item.ticker} onClick={() => setReward(REWARDS.indexOf(item))}><span className="lp-stock-symbol">{item.mark}</span><span>{item.ticker}<small>{item.name}</small></span><span className="lp-strip-plus">+</span></a>)}</div>

        <section id="how-it-works" className="lp-rig-section lp-section" aria-labelledby="rig-title">
          <div className="lp-rig-layout">
            <div className="lp-section-copy lp-reveal"><h2 id="rig-title">SMALL RIG.<br /><span>BIG AMBITIONS.</span></h2><p>Your rig is your way into the mine. Deposit the game’s token, <strong>$RIG</strong>, to switch it on. It works while you’re away, collecting fragments as the mine moves forward.</p><div className="lp-feature"><span className="lp-feature-icon"><Icon name="rig" /></span><div><h3>Put your tokens to work.</h3><p>Your deposit powers a virtual machine. No expensive computer. No noisy equipment.</p></div></div><div className="lp-feature"><span className="lp-feature-icon"><Icon name="overclock" /></span><div><h3>Make it your machine.</h3><p>Add GPU power, improve cooling, or time a temporary boost. More power means more fragments per second.</p></div></div><div className="lp-small-note">Your deposited tokens unlock when the season ends. Optional upgrades spend $RIG permanently.</div></div>
            <div className="lp-rig-lab lp-reveal"><div className="lp-lab-label"><span className="lp-status-dot" /> RIG CONFIGURATOR <span>PREVIEW / NO WALLET NEEDED</span></div><MineralScene kind="rig" value={TIERS[tier].tier} label="A detailed virtual mining rig with glowing amber processors and cyan cooling fins. Its hardware grows with the selected GPU tier." /><div className="lp-rig-spec"><span>MINING POWER</span><strong aria-live="polite">{(1 + TIERS[tier].tier * 0.2).toFixed(1)}<small>×</small></strong><span>GPU TIER 0{TIERS[tier].tier}</span></div><div className="lp-rig-controls" role="group" aria-label="Preview GPU upgrades">{TIERS.map((item, index) => <button key={item.name} aria-pressed={tier === index} onClick={() => setTier(index)}><span>0{index + 1}</span>{item.name}<span className="lp-control-dot" /></button>)}</div><p className="lp-lab-caption">Try a different build. Find your kind of power.</p></div>
          </div>
        </section>

        <section id="the-mine" className="lp-mine-section lp-section" aria-labelledby="mine-title">
          <div className="lp-mine-heading lp-reveal"><h2 id="mine-title">THE DEEPER YOU GO.<br /><span>THE MORE YOU DISCOVER.</span></h2><p>Everyone works through the same four blocks. Each one holds a different stock-token reward. Your rig’s work earns you little pieces of it. We call them fragments.</p></div>
          <div className="lp-mine-layout">
            <div className="lp-block-art lp-reveal"><div className="lp-block-index" aria-hidden="true">0{reward + 1}</div><MineralScene kind="reward" value={reward} label={`A luminous, faceted amber crystal representing the ${REWARDS[reward].ticker} reward block.`} /><div className="lp-sample-label"><span className="lp-status-dot" /> REWARD SPECIMEN / 0{reward + 1}<span>MOVE TO EXPLORE</span></div></div>
            <div className="lp-block-list lp-reveal"><div className="lp-block-list-label">EXPLORE THE BLOCKS <span>01 — 04</span></div>{REWARDS.map((item, index) => <button key={item.ticker} className={`lp-block-option ${reward === index ? "is-selected" : ""}`} aria-pressed={reward === index} onClick={() => setReward(index)}><span className="lp-block-number">0{index + 1}</span><span className="lp-block-name"><strong>{item.ticker}</strong><small>{item.category}</small></span><span className="lp-block-arrow">{reward === index ? "↗" : "+"}</span></button>)}<p className="lp-reward-detail" aria-live="polite">{REWARDS[reward].detail}</p></div>
          </div>
          <div className="lp-mine-footnote lp-reveal"><span className="lp-small-gem">◇</span><p><strong>Progress sets the pace.</strong> Blocks open through the mine’s combined work. The season ends after block four, or when its maximum duration is reached.</p><span>EVERY MOVE MATTERS.</span></div>
        </section>

        <section id="the-rewards" className="lp-collect-section lp-section" aria-labelledby="collect-title">
          <div className="lp-collect-layout"><div className="lp-collect-copy lp-reveal"><h2 id="collect-title">FRAGMENTS.<br />MEET <span>STOCKS.</span></h2><p>Those little pieces have a bigger purpose. Claim your fragments and exchange them for the matching stock token.</p><div className="lp-equation"><span><strong>1,000,000</strong><small>FRAGMENTS</small></span><span className="lp-equals">=</span><span><strong>1</strong><small>STOCK TOKEN</small></span></div><p className="lp-collect-note">Redeem smaller amounts proportionally. Stock tokens track the underlying asset; they aren’t direct share ownership. Availability depends on eligibility and the season’s rules.</p><Link href="/mine/new" className="lp-button lp-button-dark">Make your first move <Arrow diagonal /></Link></div><div className="lp-token-art lp-reveal"><MineralScene kind="token" value={assembled ? 1 : 0} label="Golden mineral fragments orbit an engraved stock-token coin and assemble around it when activated." /><button className="lp-scene-action" onClick={() => setAssembled(!assembled)} aria-pressed={assembled}><span className="lp-action-icon">{assembled ? "−" : "+"}</span>{assembled ? "Scatter the fragments" : "Bring it together"}<span className="lp-action-hint">TRY IT</span></button><span className="lp-token-caption">LITTLE PIECES. BIGGER POSSIBILITIES.</span></div></div>
          <div id="questions" className="lp-questions lp-reveal"><div><h3>A FEW GOOD<br />QUESTIONS.</h3></div><div className="lp-faq-list"><details><summary>Do I need a mining computer?<span>+</span></summary><p>No. Your rig is virtual and runs through the game’s contracts. Your browser doesn’t mine cryptocurrency or use your computer’s processing power to earn rewards. You can close the page and your active rig keeps working.</p></details><details><summary>What happens to the tokens I deposit?<span>+</span></summary><p>Your deposited stake can be withdrawn when the season closes. Leaving early has a fee. Activation also has a fee, and $RIG spent on optional upgrades is permanently burned. Review the current season’s costs before joining.</p></details><details><summary>How do I collect my rewards?<span>+</span></summary><p>Claim fragments from completed blocks, then redeem them during the season’s redemption window. Eligible wallets can receive the matching stock token; a USDC cash-out may be available subject to reserves and fees. Rewards depend on your rig’s work and the season’s funded pool.</p></details></div></div>
        </section>
      </main>
      <footer className="lp-footer"><div className="lp-footer-top"><Link href="/" className="lp-logo"><LogoMark size={30} /><span>STOCK MINER</span></Link><span>A LITTLE STRATEGY. A NEW FRONTIER.</span><a href="#main-content">BACK TO THE SURFACE ↑</a></div><div className="lp-footer-bottom"><span>© {new Date().getFullYear()} STOCK MINER</span><span>A VIRTUAL MINING GAME. REAL DECISIONS.</span><Link href="/seasons">Explore seasons <Arrow diagonal /></Link></div></footer>
    </div>
  );
}
