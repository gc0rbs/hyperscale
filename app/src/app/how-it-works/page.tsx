import Link from "next/link";
import { FramedIcon } from "@/components/Icons";
import { ROUND_NOTICES } from "@/components/rounds/RoundNotices";
import { BRAND, TOKEN } from "@/lib/brand";

export const metadata = { title: `${BRAND} · How rewards work` };

const Sec = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="flex flex-col gap-3 max-w-[720px]">
    <h2 className="font-display leading-none uppercase text-[48px] font-semibold">{title}</h2>
    <div className="text-mine-muted text-[15px] leading-[1.6] flex flex-col gap-3">{children}</div>
  </section>
);

/** FR-A6 and docs/07 §5: the plain-language explanation the terms point at (docs/13). Every number here is a default; the live parameters are on chain. */
export default function HowItWorks() {
  return (
    <main className="min-h-screen bg-mine-bg text-mine-fg px-4 md:px-8 py-16 flex flex-col gap-14 max-w-[1100px] mx-auto">
      <div className="flex flex-col gap-4">
        <h1 className="font-display leading-[0.9] uppercase text-[80px] md:text-[128px] font-bold">How rewards work</h1>
        <p className="text-mine-muted text-[17px] max-w-[640px]">{BRAND} pays by work: every hour the pot is split by the compute each GPU served. This page explains exactly what pays, what burns, and what stops the game. It is the reference the terms point to.</p>
      </div>

      <Sec title="A round every hour">
        <p>The game runs continuously in rounds of one hour. Every round has a pot of the four Stock Tokens. When the round closes on the clock, the pot is split among the GPUs by the compute they served in that hour: your share is your compute over everyone&apos;s. You then have fifteen minutes to claim, with one click for every GPU you own. Whatever is not claimed in that window rolls into the next round&apos;s pot. A round nobody worked in rolls its whole pot forward.</p>
        <p>Compute is throughput multiplied by seconds. Nothing runs on your device: throughput is a number the contract derives from your stake and upgrades, and the contract credits work by the chain&apos;s clock. More throughput from other players means a smaller share of the same pot for you.</p>
      </Sec>

      <Sec title="Where the pot comes from">
        <div className="flex flex-col gap-2 border border-mine-line rounded-sm p-4" data-testid="round-notices">
          {ROUND_NOTICES.map((n) => <p key={n}>{n}</p>)}
        </div>
        <p>The fee stream is split across the four stocks (default 15% NVDA, 20% MU, 25% SNDK, 40% QQQ) before it is swapped, so every pot holds all four. The pot is locked the moment the round closes; the mine page shows it filling during the hour and says how much of it rolled over.</p>
      </Sec>

      <Sec title={`Upgrades burn ${TOKEN}`}>
        <div className="flex gap-3 items-center"><FramedIcon name="rig" size={40} /><FramedIcon name="cooling" size={40} /><FramedIcon name="overclock" size={40} /></div>
        <p>GPU tiers, cooling tiers and overclocks are paid in {TOKEN}, priced as a share of your GPU&apos;s stake, and sent to a burn address. That {TOKEN} is gone permanently, whatever happens afterwards. Overclocks expire at a round boundary; tiers are permanent for that GPU.</p>
      </Sec>

      <Sec title="Stakes come back">
        <p>Your GPU stays online across rounds until you decommission it. Then your staked {TOKEN} comes back minus an exit fee (default 3%); the GPU&apos;s work in the round it left still counts. A 1% activation fee is charged when a GPU is created. If the game is ever halted, every deposit comes back in full with no fee.</p>
      </Sec>

      <Sec title="Claiming and redeeming">
        <p>Claimed shards are yours: one million shards of a stock equal one Robinhood Stock Token of that stock, and shards are not transferable. Shards can be redeemed for the Stock Token itself, in any fraction, or cashed out to USDG at the Chainlink price minus a fee (default 1%), at any time while the vault holds the stock behind them. There is no redemption deadline.</p>
      </Sec>

      <Sec title="Pause and halt">
        <p>The guardian can pause the game in an emergency. A pause blocks every action, claims included; if it lasts longer than the grace period (default 30 minutes), any player can withdraw their stake, which halts the game for good. The operator can also halt the game directly at any time. After a halt no round closes, deposits come back in full, shards already claimed stay redeemable, and the unclaimed and running pots return to the operator. Burned {TOKEN} is never refunded.</p>
      </Sec>

      <Sec title="Who can play">
        <p>Robinhood Stock Tokens are not available to persons in the United States, Canada, the United Kingdom or Switzerland, and neither is {BRAND}. Stock Tokens are tokenized debt instruments that track a share price; they carry no voting or ownership rights. Nothing here is investment advice.</p>
      </Sec>

      <div className="flex gap-4 text-[14px]"><Link href="/terms" className="text-signal inline-block py-2">Terms</Link><Link href="/" className="text-signal inline-block py-2">Back to the game</Link></div>
    </main>
  );
}
