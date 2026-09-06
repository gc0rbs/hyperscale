"use client";
import { createConfig, http } from "wagmi";
import { injected, mock, walletConnect } from "wagmi/connectors";
import { defineChain, type Address, type Chain } from "viem";
import { foundry } from "viem/chains";

/** Anvil's first five default accounts; usable as unlocked signers in dev and e2e. */
export const DEV_ACCOUNTS: Address[] = [
  "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  "0x90F79bf6EB2c4f870365E785982E1f101E93b9cc",
  "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
];

/** Robinhood Chain mainnet (verified 2026-09-04: Arbitrum Orbit, gas in ETH, Blockscout explorer). */
export const robinhood = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" } },
});

/** Robinhood Chain testnet (chain id 46630; RPC verified 2026-09-04, explorer to confirm). */
export const robinhoodTestnet = defineChain({
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.chain.robinhood.com"] } },
  testnet: true,
});

export function chainFor(chainId: number, rpcUrl: string): Chain {
  const base = chainId === foundry.id ? foundry : chainId === robinhood.id ? robinhood : chainId === robinhoodTestnet.id ? robinhoodTestnet : null;
  if (base) return { ...base, rpcUrls: { default: { http: [rpcUrl] } } };
  return defineChain({ id: chainId, name: `Chain ${chainId}`, nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } } });
}

/**
 * Connectors: injected wallets always; WalletConnect when NEXT_PUBLIC_WC_PROJECT_ID is set; the mock
 * connector with the Anvil accounts only on Anvil or with NEXT_PUBLIC_DEV_ACCOUNTS=1.
 */
export function makeWagmiConfig(chainId: number, rpcUrl: string) {
  const chain = chainFor(chainId, rpcUrl);
  const devAccounts = process.env.NEXT_PUBLIC_DEV_ACCOUNTS === "1" || chainId === foundry.id;
  const wcId = process.env.NEXT_PUBLIC_WC_PROJECT_ID;
  const connectors = [
    injected(),
    ...(wcId ? [walletConnect({ projectId: wcId, showQrModal: true, metadata: { name: "Hyperscale", description: "Run the compute, own the chips, on Robinhood Chain", url: process.env.NEXT_PUBLIC_APP_URL ?? (typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"), icons: [] } })] : []),
    ...(devAccounts ? [mock({ accounts: DEV_ACCOUNTS as [Address, ...Address[]], features: { reconnect: true } })] : []),
  ];
  return createConfig({
    chains: [chain],
    connectors,
    transports: { [chain.id]: http(rpcUrl) },
    ssr: true,
    batch: { multicall: true },
  });
}
