"use client";
import { createConfig, http } from "wagmi";
import { injected, mock } from "wagmi/connectors";
import { defineChain, type Address } from "viem";
import { foundry } from "viem/chains";

/** Anvil's first five default accounts; usable as unlocked signers in dev and e2e. */
export const DEV_ACCOUNTS: Address[] = [
  "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  "0x90F79bf6EB2c4f870365E785982E1f101E93b9cc",
  "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
];

/** Placeholder until PRD §10 assumptions are verified; chain id and RPC come from env. */
export const robinhoodChain = defineChain({
  id: Number(process.env.NEXT_PUBLIC_ROBINHOOD_CHAIN_ID ?? 0) || 46630,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8545"] } },
});

export function makeWagmiConfig(chainId: number, rpcUrl: string) {
  const chain = chainId === foundry.id ? { ...foundry, rpcUrls: { default: { http: [rpcUrl] } } } : robinhoodChain;
  const devAccounts = process.env.NEXT_PUBLIC_DEV_ACCOUNTS === "1" || chainId === foundry.id;
  return createConfig({
    chains: [chain],
    connectors: devAccounts
      ? [injected(), mock({ accounts: DEV_ACCOUNTS as [Address, ...Address[]], features: { reconnect: true } })]
      : [injected()],
    transports: { [chain.id]: http(rpcUrl) },
    ssr: true,
    batch: { multicall: true },
  });
}
