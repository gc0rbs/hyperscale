import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isAddress, type Address } from "viem";

export interface Deployment {
  chainId: number;
  seasonId: number;
  /** Player-facing season number when it differs from seasonId + 1 (an earlier index never opened). */
  seasonNumber?: number;
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
  // Read through a computed key so Next.js does not inline these at build time: the hosting env
  // (Railway variables) is read at request time and a season change needs no rebuild.
  const rt = (k: string) => process.env[k];
  const chainId = Number(rt("NEXT_PUBLIC_CHAIN_ID") ?? 31337);
  const rpcUrl = rt("NEXT_PUBLIC_RPC_URL") ?? "http://127.0.0.1:8545";
  if (rt("NEXT_PUBLIC_MINE_ADDRESS")) {
    // Audit R3: a partial or malformed address set must fail at startup, not as undefined calls later.
    const env = (k: string): Address => {
      const v = process.env[k];
      if (!v || !isAddress(v)) throw new Error(`${k} is missing or not an address (${v ?? "unset"})`);
      return v as Address;
    };
    const stocks = (rt("NEXT_PUBLIC_STOCK_ADDRESSES") ?? "").split(",").map((s) => s.trim());
    if (stocks.length !== 4 || stocks.some((s) => !isAddress(s))) throw new Error("NEXT_PUBLIC_STOCK_ADDRESSES must list four addresses");
    return {
      chainId,
      seasonId: Number(rt("NEXT_PUBLIC_SEASON_ID") ?? 0),
      seasonNumber: rt("NEXT_PUBLIC_SEASON_NUMBER") ? Number(rt("NEXT_PUBLIC_SEASON_NUMBER")) : undefined,
      rig: env("NEXT_PUBLIC_RIG_ADDRESS"),
      lp: env("NEXT_PUBLIC_LP_ADDRESS"),
      usdc: env("NEXT_PUBLIC_USDC_ADDRESS"),
      oracle: env("NEXT_PUBLIC_ORACLE_ADDRESS"),
      eligibility: env("NEXT_PUBLIC_ELIGIBILITY_ADDRESS"),
      factory: env("NEXT_PUBLIC_FACTORY_ADDRESS"),
      mine: env("NEXT_PUBLIC_MINE_ADDRESS"),
      fragments: env("NEXT_PUBLIC_FRAGMENTS_ADDRESS"),
      vault: env("NEXT_PUBLIC_VAULT_ADDRESS"),
      stocks: stocks as Address[],
      openTime: Number(rt("NEXT_PUBLIC_OPEN_TIME") ?? 0),
      rpcUrl,
    };
  }
  const dir = rt("DEPLOYMENTS_DIR") ?? join(process.cwd(), "..", "contracts", "deployments");
  const file = join(dir, `${chainId}.json`);
  if (!existsSync(file)) return null;
  const j = JSON.parse(readFileSync(file, "utf8"));
  return { ...j, chainId, rpcUrl } as Deployment;
}
