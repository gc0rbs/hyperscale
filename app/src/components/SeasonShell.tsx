"use client";
import { useDeployment } from "@/app/providers";
import { useSeason } from "@/lib/use-season";
import type { SeasonSnapshot } from "@/lib/season-model";

/** Loads the season snapshot once for a page and renders children with it. */
export function SeasonShell({ children, dark = true }: { children: (snap: SeasonSnapshot) => React.ReactNode; dark?: boolean }) {
  const dep = useDeployment();
  const { snapshot, isLoading, error } = useSeason(dep.mine, dep.vault);
  const cls = dark ? "bg-mine-bg text-mine-fg" : "bg-shell-bg text-shell-fg";
  if (error) return <main className={`min-h-[calc(100vh-var(--lp-header-height))] ${cls} p-8 font-data text-[13px]`}>RPC error: {error.message.split("\n")[0]}</main>;
  if (!snapshot || isLoading) return <main className={`min-h-[calc(100vh-var(--lp-header-height))] ${cls} p-8 text-mine-muted`} data-testid="loading">Reading the mine…</main>;
  return <main className={`min-h-[calc(100vh-var(--lp-header-height))] ${cls}`}>{children(snapshot)}</main>;
}
