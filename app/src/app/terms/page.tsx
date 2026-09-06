import Link from "next/link";

export const metadata = { title: "Hyperscale · Terms" };

const H = ({ children }: { children: React.ReactNode }) => <h2 className="font-display leading-none uppercase text-[40px] font-semibold mt-6">{children}</h2>;

/**
 * Placeholder terms structured per docs/07 §5. Counsel must review and replace the wording before
 * launch; the headings are the disclosures the compliance doc requires.
 */
export default function Terms() {
  return (
    <main className="min-h-screen bg-mine-bg text-mine-fg px-4 md:px-8 py-16 max-w-[820px] mx-auto text-[15px] leading-[1.65] text-mine-muted">
      <h1 className="font-display leading-[0.9] uppercase text-[80px] md:text-[112px] font-bold text-mine-fg">Terms</h1>
      <p className="mt-4">Draft for legal review. Effective date, governing law and the operating entity are to be filled in by counsel.</p>

      <H>1. Eligibility</H>
      <p>You may not use Hyperscale if you are a person or entity located in, incorporated in, or a resident of the United States of America, Canada, the United Kingdom or Switzerland, or any other jurisdiction where Robinhood Stock Tokens or this service are restricted. You are responsible for compliance with your local laws.</p>

      <H>2. What the game is</H>
      <p>Hyperscale is a skill-and-attention game in which participants stake the RIG token to operate virtual rigs that earn fragments redeemable for Robinhood Stock Tokens. Rewards depend on the work your rig performs, never on the passage of time. The mechanics are described in full at <Link href="/how-it-works" className="text-signal inline-block py-2">How rewards work</Link>, which forms part of these terms.</p>

      <H>3. Burns are final</H>
      <p>RIG spent on upgrades is transferred to a burn address and cannot be recovered by anyone under any circumstances, including cancellation of a season.</p>

      <H>4. Seasons can end early</H>
      <p>Each season has a hard cap. If the final block is not found by the cap, the season ends, fragments earned so far remain claimable, and the unmined part of the pool is carried to a later season. Durations shown in the app are estimates.</p>

      <H>5. Emergency pause and cancellation</H>
      <p>The operator may pause a season in an emergency. If a pause exceeds the grace period, participants may withdraw their stakes, which cancels the season; unclaimed fragments are forfeited and the pool is swept to the treasury.</p>

      <H>6. Redemption window</H>
      <p>Fragments may be redeemed for Stock Tokens or cashed out for USDG only during the redemption window after a season closes. After the window, unredeemed amounts are swept to the treasury and can no longer be redeemed from that season.</p>

      <H>7. Stock Tokens</H>
      <p>Robinhood Stock Tokens are tokenized instruments that track the price of an underlying security. They confer no ownership, voting or dividend rights in the underlying company. Their availability and transferability are determined by their issuer, not by Hyperscale.</p>

      <H>8. No advice, no guarantee</H>
      <p>Nothing in the app is financial advice. Smart contracts are immutable once deployed and are used at your own risk. The operator does not guarantee uptime, price feeds, or the value of any token.</p>

      <p className="mt-10"><Link href="/" className="text-signal inline-block py-2">Back to the mine</Link></p>
    </main>
  );
}
