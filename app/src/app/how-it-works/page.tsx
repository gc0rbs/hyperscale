import Link from "next/link";
import { FramedIcon } from "@/components/Icons";

export const metadata = { title: "Stock Miner · How rewards work" };

const Sec = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="flex flex-col gap-3 max-w-[720px]">
    <h2 className="font-display leading-none uppercase text-[48px] font-semibold">{title}</h2>
    <div className="text-mine-muted text-[15px] leading-[1.6] flex flex-col gap-3">{children}</div>
  </section>
);

/** FR-A6 and docs/07 §5: the plain-language explanation the terms point at. Every number here is a default; the season's own parameters are on chain. */
export default function HowItWorks() {
  return (
    <main className="min-h-screen bg-mine-bg text-mine-fg px-4 md:px-8 py-16 flex flex-col gap-14 max-w-[1100px] mx-auto">
      <div className="flex flex-col gap-4">
        <h1 className="font-display leading-[0.9] uppercase text-[80px] md:text-[128px] font-bold">How rewards work</h1>
        <p className="text-mine-muted text-[17px] max-w-[640px]">Stock Miner is a game of work, not time. This page explains exactly what pays, what burns, and what ends a season. It is the reference the terms point to.</p>
      </div>

      <Sec title="Work finds blocks">
        <p>A season has four blocks. Each block needs a fixed amount of work, measured in hashrate multiplied by seconds. Every active rig contributes work every second. When the total reaches the block&apos;s difficulty, the block is found and the next one starts. Block 4 found means the season is over. Nothing is scheduled: more total hashrate finds blocks sooner.</p>
      </Sec>

      <Sec title="Your pay depends only on your rig">
        <p>Each block pays a fixed number of fragments per unit of work, set when the season is created. Your rig earns its own hashrate multiplied by the seconds it mines in that block, at that rate. Other rigs do not dilute you. They make the block end sooner, so you spend less time in it, but every second you mined was paid at the same rate.</p>
        <p>One million fragments of a block equal one Robinhood Stock Token of that block&apos;s stock. Fragments are not transferable.</p>
      </Sec>

      <Sec title="Upgrades burn RIG">
        <div className="flex gap-3 items-center"><FramedIcon name="rig" size={40} /><FramedIcon name="cooling" size={40} /><FramedIcon name="overclock" size={40} /></div>
        <p>GPU tiers, cooling tiers and overclocks are paid in RIG, priced as a share of your rig&apos;s stake, and sent to a burn address. That RIG is gone permanently, whatever happens afterwards. Upgrades do not carry over to the next season.</p>
      </Sec>

      <Sec title="Stakes come back">
        <p>Your staked RIG is returned in full when the season closes. You can leave earlier at any time with an early-exit fee (default 3%); fragments earned so far are kept. A 1% activation fee is charged when a rig is created.</p>
      </Sec>

      <Sec title="The cap">
        <p>Every season has a hard cap (default six hours). If block 4 has not been found by then, the season ends. Fragments earned so far are yours; the part of the pool that was never mined rolls into a later season. The cap is shown on the mine page from the start as the latest possible end. No reward ever depends on the clock.</p>
      </Sec>

      <Sec title="Claiming and redeeming">
        <p>Fragments for a block can be claimed as soon as that block is found. After the season closes there is a redemption window (default 30 days) during which fragments can be exchanged for the Stock Token itself, or cashed out to USDG at the Chainlink price minus a fee (default 1%). After the window, anything unredeemed is swept to the treasury.</p>
      </Sec>

      <Sec title="Emergency stop">
        <p>The only administrative power over a live season is a pause. If a pause lasts longer than the grace period (default 30 minutes), any player can withdraw their stake, which cancels the season: unclaimed fragments are forfeited and the pool goes to the treasury. Burned RIG is never refunded.</p>
      </Sec>

      <Sec title="Who can play">
        <p>Robinhood Stock Tokens are not available to persons in the United States, Canada, the United Kingdom or Switzerland, and neither is Stock Miner. Stock Tokens are tokenized debt instruments that track a share price; they carry no voting or ownership rights. Nothing here is investment advice, and every duration shown in the app is an estimate.</p>
      </Sec>

      <div className="flex gap-4 text-[14px]"><Link href="/terms" className="text-signal inline-block py-2">Terms</Link><Link href="/" className="text-signal inline-block py-2">Back to the mine</Link></div>
    </main>
  );
}
