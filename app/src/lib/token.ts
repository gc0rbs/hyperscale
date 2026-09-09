import { isAddress, type Address } from "viem";

/**
 * Public identity of the game token ($VRAM) for the marketing site. NEXT_PUBLIC_* values are inlined
 * at build time, so the address and purchase link live in the hosting env (docs/RUNBOOK.md §10):
 *   NEXT_PUBLIC_RIG_ADDRESS  the Pons token (the mine's `rig`; the variable keeps the contract name)
 *   NEXT_PUBLIC_RIG_BUY_URL  the official purchase page (Pons token page or DEX swap link)
 * Until both are set the site shows "coming soon" rather than a wrong address. Nothing is hard-coded
 * per chain any more: the 2026-09-05 RIG token is not the $VRAM token (docs/DECISIONS.md 2026-09-09),
 * and the rounds mine reads its token from the chain after `launch`.
 */
const EXPLORERS: Record<number, string> = {
  4663: "https://robinhoodchain.blockscout.com",
};

const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 31337);
const raw = process.env.NEXT_PUBLIC_RIG_ADDRESS?.trim() ?? "";
export const RIG_ADDRESS: Address | null = raw && isAddress(raw) && !/^0x0{40}$/i.test(raw) ? (raw as Address) : null;

const buy = process.env.NEXT_PUBLIC_RIG_BUY_URL?.trim() ?? "";
export const RIG_BUY_URL: string | null = /^https:\/\/\S+$/.test(buy) ? buy : null;

export const RIG_EXPLORER_URL: string | null = RIG_ADDRESS && EXPLORERS[chainId] ? `${EXPLORERS[chainId]}/token/${RIG_ADDRESS}` : null;
