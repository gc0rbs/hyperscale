import Link from "next/link";
import { ROUND_NOTICES } from "@/components/rounds/RoundNotices";
import { BRAND, TOKEN } from "@/lib/brand";

export const metadata = { title: `${BRAND} · Terms` };

const H = ({ children }: { children: React.ReactNode }) => <h2 className="font-display leading-none uppercase text-[40px] font-semibold mt-6">{children}</h2>;

/**
 * Placeholder terms structured per docs/07 §5 for the round mine (docs/13). Counsel must review and
 * replace the wording before launch; the headings are the disclosures the compliance doc requires.
 */
export default function Terms() {
  return (
    <main className="min-h-screen bg-mine-bg text-mine-fg px-4 md:px-8 py-16 max-w-[820px] mx-auto text-[15px] leading-[1.65] text-mine-muted">
      <h1 className="font-display leading-[0.9] uppercase text-[80px] md:text-[112px] font-bold text-mine-fg">Terms</h1>
      <p className="mt-4">Draft for legal review. Effective date, governing law and the operating entity are to be filled in by counsel.</p>

      <H>1. Eligibility</H>
      <p>You may not use {BRAND} if you are a person or entity located in, incorporated in, or a resident of the United States of America, Canada, the United Kingdom or Switzerland, or any other jurisdiction where Robinhood Stock Tokens or this service are restricted. You are responsible for compliance with the laws that apply to you.</p>

      <H>2. What the game is</H>
      <p>{BRAND} is a skill-and-attention game in which participants stake the {TOKEN} token to operate virtual GPUs that earn shards redeemable for Robinhood Stock Tokens. Rewards depend on the work your GPU performs relative to every other GPU in the same round, and on the fees that funded that round. The mechanics are described in full at <Link href="/how-it-works" className="text-signal inline-block py-2">How rewards work</Link>, which forms part of these terms.</p>

      <H>3. Burns are final</H>
      <p>{TOKEN} spent on upgrades is transferred to a burn address and cannot be recovered by anyone under any circumstances, including a halt of the game.</p>

      <H>4. Rounds, claims and rollover</H>
      <p>Each round&apos;s pot is split by the compute served in that round and is claimable for fifteen minutes after the round closes. Amounts not claimed in that window roll into the next round&apos;s pot and cannot be recovered by the participant who earned them. A pause during a claim window can cause it to lapse; the unclaimed amount rolls over as usual.</p>

      <H>5. Funding and the operator&apos;s powers</H>
      {ROUND_NOTICES.map((n) => <p key={n}>{n}</p>)}
      <p>The guardian may pause the game in an emergency. If a pause exceeds the grace period, participants may withdraw their stakes, which halts the game permanently with the same effects as an operator halt.</p>

      <H>6. Stakes and fees</H>
      <p>A stake is returned when its GPU is decommissioned, minus the exit fee shown at the time, or in full after a halt. An activation fee is charged when a GPU is created. All fees are shown before you confirm.</p>

      <H>7. Redemption</H>
      <p>Shards may be redeemed for Stock Tokens by eligible wallets, or cashed out for USDG at the oracle price minus the cash-out fee subject to the available reserve, at any time while the vault holds the corresponding stock. Cash-out depends on a price feed and a reserve that the operator does not guarantee.</p>

      <H>8. Stock Tokens</H>
      <p>Robinhood Stock Tokens are tokenized instruments that track the price of an underlying security. They confer no ownership, voting or dividend rights in the underlying company. Their availability and transferability are determined by their issuer, not by {BRAND}.</p>

      <H>9. No advice, no guarantee</H>
      <p>Nothing in the app is financial advice. Smart contracts are immutable once deployed and are used at your own risk. The operator does not guarantee uptime, price feeds, or the value of any token.</p>

      <p className="mt-10"><Link href="/" className="text-signal inline-block py-2">Back to the game</Link></p>
    </main>
  );
}
