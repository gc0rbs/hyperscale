"use client";
import { createContext, useContext } from "react";
import { useAccount } from "wagmi";
import type { Address } from "viem";

export const DevAccountContext = createContext<{ index: number | null; setIndex: (i: number | null) => void }>({ index: null, setIndex: () => {} });

/** The address the UI acts as: the connected wallet, or a chosen Anvil dev account in dev mode. */
export function useActiveAddress(): Address | undefined {
  const { address, addresses } = useAccount();
  const dev = useContext(DevAccountContext);
  if (dev.index !== null && addresses && addresses[dev.index]) return addresses[dev.index];
  return address;
}
