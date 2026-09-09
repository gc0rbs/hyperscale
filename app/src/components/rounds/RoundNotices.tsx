import Link from "next/link";

/**
 * The public notices the client requires (docs/DECISIONS.md 2026-09-08, docs/13 §2 "Halt"). Shown
 * on the mine screen footer and repeated in /how-it-works and /terms. Short and plain on purpose.
 */
export const ROUND_NOTICES = [
  "Pots are funded by the Pons trading tax on $VRAM, swapped into Stock Tokens and added to the running round as fees arrive. A round with no fees pays only what rolled over.",
  "The operator can halt the mine at any time and take back the unclaimed and running pots. Stakes always come back in full, and shards you have already claimed stay redeemable.",
] as const;

export function RoundNotices({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`text-mine-muted leading-relaxed ${compact ? "text-[12px]" : "text-[13px]"} flex flex-col gap-1.5`} data-testid="round-notices">
      {ROUND_NOTICES.map((n) => <p key={n}>{n}</p>)}
      <p>Details in <Link href="/how-it-works" className="text-signal">How rewards work</Link> and the <Link href="/terms" className="text-signal">Terms</Link>.</p>
    </div>
  );
}
