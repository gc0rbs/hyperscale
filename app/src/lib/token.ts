import { isAddress, type Address } from "viem";

/**
 * Public identity of the $RIG token for the marketing site. NEXT_PUBLIC_* values are inlined at
 * build time, so the address and purchase link live in the hosting env (docs/RUNBOOK.md §10):
 *   NEXT_PUBLIC_RIG_ADDRESS  the graduated Pons token (also used by the mine)
 *   NEXT_PUBLIC_RIG_BUY_URL  the official purchase page (Pons token page or DEX swap link)
 * Until both are set the site shows "coming soon" rather than a wrong address.
 */
const EXPLORERS: Record<number, string> = {
  4663: "https://robinhoodchain.blockscout.com",
};

/** Launched token per chain, so the site shows the address even before the hosting env is updated. */
const KNOWN_RIG: Record<number, Address> = {
  4663: "0x3c31029d4eb1cd8bca6b26e03af647de5dfa943f", // Stock Miner (RIG), Pons launch 2026-09-05
};

const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 31337);
const raw = process.env.NEXT_PUBLIC_RIG_ADDRESS?.trim() ?? "";
export const RIG_ADDRESS: Address | null = raw && isAddress(raw) && !/^0x0{40}$/i.test(raw) ? (raw as Address) : KNOWN_RIG[chainId] ?? null;

const buy = process.env.NEXT_PUBLIC_RIG_BUY_URL?.trim() ?? "";
export const RIG_BUY_URL: string | null = /^https:\/\/\S+$/.test(buy) ? buy : null;

export const RIG_EXPLORER_URL: string | null = RIG_ADDRESS && EXPLORERS[chainId] ? `${EXPLORERS[chainId]}/token/${RIG_ADDRESS}` : null;
