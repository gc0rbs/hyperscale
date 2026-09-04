"use client";
import { useEffect, useState } from "react";
import { DevAccountContext } from "@/lib/use-account";

const KEY = "stockminer.devAccount";

/** Which Anvil dev account the UI acts as; persisted per browser so reloads keep it. */
export function DevAccountProvider({ children }: { children: React.ReactNode }) {
  const [index, setIndexState] = useState<number | null>(null);
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(KEY);
      if (v !== null) setIndexState(Number(v));
    } catch {}
  }, []);
  const setIndex = (i: number | null) => {
    setIndexState(i);
    try {
      if (i === null) window.localStorage.removeItem(KEY);
      else window.localStorage.setItem(KEY, String(i));
    } catch {}
  };
  return <DevAccountContext.Provider value={{ index, setIndex }}>{children}</DevAccountContext.Provider>;
}
