"use client";
import { useState } from "react";

/** Web Share where available (mobile), clipboard elsewhere. Text only: the OG card carries the visuals. */
export function ShareButton({ text, className = "" }: { text: string; className?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "shared">("idle");
  async function share() {
    const url = typeof window !== "undefined" ? window.location.origin : "";
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: "Stock Miner", text, url });
        setState("shared");
      } else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        setState("copied");
      }
    } catch {
      /* cancelled */
    }
    setTimeout(() => setState("idle"), 2000);
  }
  return (
    <button type="button" onClick={share} data-testid="share" className={`h-9 px-4 rounded-sm border border-current inline-flex items-center text-[14px] font-semibold ${className}`}>
      {state === "copied" ? "Copied" : state === "shared" ? "Shared" : "Share"}
    </button>
  );
}
