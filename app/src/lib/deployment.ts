import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Address } from "viem";

export interface Deployment {
  chainId: number;
  seasonId: number;
  rig: Address;
  lp: Address;
  usdc: Address;
  oracle: Address;
  eligibility: Address;
  factory: Address;
  mine: Address;
  fragments: Address;
  vault: Address;
  stocks: Address[];
  openTime: number;
  rpcUrl: string;
}

/**
 * Server-only. Addresses come from NEXT_PUBLIC_* env when set (production), otherwise from
 * contracts/deployments/<chainId>.json written by `pnpm --filter @stock-miner/ops deploy-demo`.
 */
export function getDeployment(): Deployment | null {
  const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 31337);
  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8545";
  if (process.env.NEXT_PUBLIC_MINE_ADDRESS) {
    const env = (k: string) => process.env[k] as Address;
    return {
      chainId,
      seasonId: Number(process.env.NEXT_PUBLIC_SEASON_ID ?? 0),
      rig: env("NEXT_PUBLIC_RIG_ADDRESS"),
      lp: env("NEXT_PUBLIC_LP_ADDRESS"),
      usdc: env("NEXT_PUBLIC_USDC_ADDRESS"),
      oracle: env("NEXT_PUBLIC_ORACLE_ADDRESS"),
      eligibility: env("NEXT_PUBLIC_ELIGIBILITY_ADDRESS"),
      factory: env("NEXT_PUBLIC_FACTORY_ADDRESS"),
      mine: env("NEXT_PUBLIC_MINE_ADDRESS"),
      fragments: env("NEXT_PUBLIC_FRAGMENTS_ADDRESS"),
      vault: env("NEXT_PUBLIC_VAULT_ADDRESS"),
      stocks: (process.env.NEXT_PUBLIC_STOCK_ADDRESSES ?? "").split(",") as Address[],
      openTime: Number(process.env.NEXT_PUBLIC_OPEN_TIME ?? 0),
      rpcUrl,
    };
  }
  const dir = process.env.DEPLOYMENTS_DIR ?? join(process.cwd(), "..", "contracts", "deployments");
  const file = join(dir, `${chainId}.json`);
  if (!existsSync(file)) return null;
  const j = JSON.parse(readFileSync(file, "utf8"));
  return { ...j, chainId, rpcUrl } as Deployment;
}
