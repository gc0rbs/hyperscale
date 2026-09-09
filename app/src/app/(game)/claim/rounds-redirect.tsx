"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Rounds have no per-block claims: the claim panel lives on the mine screen. */
export function RoundsClaimRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/mine"); }, [router]);
  return <main className="min-h-[calc(100vh-var(--lp-header-height))] bg-mine-bg text-mine-muted p-8">Claims happen on the mine screen: taking you there…</main>;
}
