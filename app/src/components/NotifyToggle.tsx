"use client";
import type { useNotifyPref } from "@/lib/use-notify";

type Pref = ReturnType<typeof useNotifyPref>;

/** Bell pill: off → asks permission; on → click to stop. Hidden when the browser has no Notification API. */
export function NotifyToggle({ pref, className = "" }: { pref: Pref; className?: string }) {
  if (!pref.supported) return null;
  return (
    <button
      type="button"
      onClick={() => (pref.on ? pref.disable() : void pref.enable())}
      aria-pressed={pref.on}
      data-testid="notify-toggle"
      className={`h-8 px-3 rounded-full text-[12px] font-semibold border inline-flex items-center gap-1.5 transition-colors ${pref.on ? "border-signal text-signal bg-[var(--signal-tint,rgba(69,196,219,0.12))]" : "border-mine-line text-mine-muted hover:text-mine-fg"} ${className}`}
      title={pref.on ? "Notifying you when a block is found or the mine closes" : "Get a notification when a block is found or the mine closes"}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
      {pref.on ? "Notifying" : "Notify me"}
    </button>
  );
}
