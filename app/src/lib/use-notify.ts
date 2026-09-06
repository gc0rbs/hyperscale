"use client";
import { useEffect, useRef, useState } from "react";

const KEY = "sm.notify";

/**
 * Opt-in browser notifications (docs/06 §2, design brief §6 "long haul offers notifications").
 * Local `Notification`s only: they fire while a Hyperscale tab is open, which covers a ≤6h season
 * without a push server. The preference lives in localStorage; permission is the browser's.
 */
export function useNotifyPref() {
  const [on, setOn] = useState(false);
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    const ok = typeof window !== "undefined" && "Notification" in window;
    setSupported(ok);
    try {
      setOn(ok && localStorage.getItem(KEY) === "1" && Notification.permission === "granted");
    } catch {
      /* storage blocked: stay off */
    }
  }, []);
  async function enable(): Promise<boolean> {
    if (!supported) return false;
    const r = await Notification.requestPermission();
    const ok = r === "granted";
    try { localStorage.setItem(KEY, ok ? "1" : "0"); } catch { /* ignore */ }
    setOn(ok);
    return ok;
  }
  function disable() {
    try { localStorage.setItem(KEY, "0"); } catch { /* ignore */ }
    setOn(false);
  }
  return { on, supported, enable, disable };
}

export function notify(title: string, body: string, tag: string) {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    new Notification(title, { body, tag, icon: "/icon.svg" });
  } catch {
    /* some browsers throw outside a service worker; the in-page banner still shows */
  }
}

/**
 * Fires when the observed mine state advances: a block found, the mine closed, and (long haul only)
 * a new shift. The first observation is silent so a reload never replays old events.
 */
export function useMineNotifications(on: boolean, blocksFound: number, closed: boolean, shift: number, longHaul: boolean, tickers: readonly string[]) {
  const prev = useRef<{ blocksFound: number; closed: boolean; shift: number } | null>(null);
  useEffect(() => {
    const p = prev.current;
    prev.current = { blocksFound, closed, shift };
    if (!p || !on) return;
    if (blocksFound > p.blocksFound) {
      const b = blocksFound - 1;
      notify(
        `Block ${b + 1} found · ${tickers[b]}`,
        closed ? "That was the last block. The mine is sealed: withdraw, claim, redeem." : `Block ${b + 2} is mining now. Your ${tickers[b]} fragments are claimable.`,
        `block-${b}`,
      );
      return;
    }
    if (closed && !p.closed) {
      notify("The mine has closed", "Withdraw your deposits, claim, then redeem.", "closed");
      return;
    }
    if (longHaul && shift > p.shift) notify(`Shift ${shift} started`, "Heat and overclocks were settled at the boundary.", `shift-${shift}`);
  }, [on, blocksFound, closed, shift, longHaul, tickers]);
}
