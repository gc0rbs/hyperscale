import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isAddress, type Address } from "viem";

/** A season deployment (SeasonMine + RedemptionVault): the 2026-09-05 mainnet seasons still run under it. */
export interface Deployment {
  kind: "season";
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

/** The continuous mine with hourly rounds (docs/13-ROUNDS.md): RoundMine + RoundVault + StockFragments. */
export interface RoundsDeployment {
  kind: "rounds";
  chainId: number;
  rig: Address;
  usdc: Address;
  eligibility: Address;
  mine: Address;
  fragments: Address;
  vault: Address;
  stocks: Address[];
  /** Start of round 0 (unix seconds). */
  genesis: number;
  roundSeconds: number;
  claimSeconds: number;
  rpcUrl: string;
}

export type AnyDeployment = Deployment | RoundsDeployment;

// Read through a computed key so Next.js does not inline these at build time: the hosting env
// (Railway variables) is read at request time and a deployment change needs no rebuild.
const rt = (k: string) => process.env[k];

// Audit R3: a partial or malformed address set must fail at startup, not as undefined calls later.
function envAddress(k: string): Address {
  const v = rt(k);
  if (!v || !isAddress(v)) throw new Error(`${k} is missing or not an address (${v ?? "unset"})`);
  return v as Address;
}

function envStocks(): Address[] {
  const stocks = (rt("NEXT_PUBLIC_STOCK_ADDRESSES") ?? "").split(",").map((s) => s.trim());
  if (stocks.length !== 4 || stocks.some((s) => !isAddress(s))) throw new Error("NEXT_PUBLIC_STOCK_ADDRESSES must list four addresses");
  return stocks as Address[];
}

function envNumber(k: string, fallback?: number): number {
  const v = rt(k);
  if (v === undefined || v === "") {
    if (fallback === undefined) throw new Error(`${k} is missing`);
    return fallback;
  }
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${k} is not a number (${v})`);
  return n;
}

function deploymentsDir(): string {
  return rt("DEPLOYMENTS_DIR") ?? join(process.cwd(), "..", "contracts", "deployments");
}

/**
 * Server-only. The rounds deployment comes from NEXT_PUBLIC_ROUNDS_* env when set (production),
 * otherwise from contracts/deployments/<chainId>-rounds.json written by the rounds deploy script.
 */
export function getRoundsDeployment(): RoundsDeployment | null {
  const chainId = Number(rt("NEXT_PUBLIC_CHAIN_ID") ?? 31337);
  const rpcUrl = rt("NEXT_PUBLIC_RPC_URL") ?? "http://127.0.0.1:8545";
  if (rt("NEXT_PUBLIC_ROUNDS_MINE_ADDRESS")) {
    return {
      kind: "rounds",
      chainId,
      rig: envAddress("NEXT_PUBLIC_RIG_ADDRESS"),
      usdc: envAddress("NEXT_PUBLIC_USDC_ADDRESS"),
      eligibility: envAddress("NEXT_PUBLIC_ELIGIBILITY_ADDRESS"),
      mine: envAddress("NEXT_PUBLIC_ROUNDS_MINE_ADDRESS"),
      fragments: envAddress("NEXT_PUBLIC_ROUNDS_FRAGMENTS_ADDRESS"),
      vault: envAddress("NEXT_PUBLIC_ROUNDS_VAULT_ADDRESS"),
      stocks: envStocks(),
      genesis: envNumber("NEXT_PUBLIC_GENESIS"),
      roundSeconds: envNumber("NEXT_PUBLIC_ROUND_SECONDS", 3600),
      claimSeconds: envNumber("NEXT_PUBLIC_CLAIM_SECONDS", 900),
      rpcUrl,
    };
  }
  const file = join(deploymentsDir(), `${chainId}-rounds.json`);
  if (!existsSync(file)) return null;
  const j = JSON.parse(readFileSync(file, "utf8"));
  return {
    kind: "rounds",
    chainId,
    rig: j.rig,
    usdc: j.usdc,
    eligibility: j.eligibility,
    mine: j.mine,
    fragments: j.fragments,
    vault: j.vault,
    stocks: j.stocks,
    genesis: Number(j.genesis),
    roundSeconds: Number(j.roundSeconds ?? 3600),
    claimSeconds: Number(j.claimSeconds ?? 900),
    rpcUrl,
  };
}

/**
 * Server-only. Season addresses come from NEXT_PUBLIC_* env when set (production), otherwise from
 * contracts/deployments/<chainId>.json written by `pnpm --filter @stock-miner/ops deploy-demo`.
 */
export function getSeasonDeployment(): Deployment | null {
  const chainId = Number(rt("NEXT_PUBLIC_CHAIN_ID") ?? 31337);
  const rpcUrl = rt("NEXT_PUBLIC_RPC_URL") ?? "http://127.0.0.1:8545";
  if (rt("NEXT_PUBLIC_MINE_ADDRESS")) {
    return {
      kind: "season",
      chainId,
      seasonId: Number(rt("NEXT_PUBLIC_SEASON_ID") ?? 0),
      seasonNumber: rt("NEXT_PUBLIC_SEASON_NUMBER") ? Number(rt("NEXT_PUBLIC_SEASON_NUMBER")) : undefined,
      rig: envAddress("NEXT_PUBLIC_RIG_ADDRESS"),
      lp: envAddress("NEXT_PUBLIC_LP_ADDRESS"),
      usdc: envAddress("NEXT_PUBLIC_USDC_ADDRESS"),
      oracle: envAddress("NEXT_PUBLIC_ORACLE_ADDRESS"),
      eligibility: envAddress("NEXT_PUBLIC_ELIGIBILITY_ADDRESS"),
      factory: envAddress("NEXT_PUBLIC_FACTORY_ADDRESS"),
      mine: envAddress("NEXT_PUBLIC_MINE_ADDRESS"),
      fragments: envAddress("NEXT_PUBLIC_FRAGMENTS_ADDRESS"),
      vault: envAddress("NEXT_PUBLIC_VAULT_ADDRESS"),
      stocks: envStocks(),
      openTime: Number(rt("NEXT_PUBLIC_OPEN_TIME") ?? 0),
      rpcUrl,
    };
  }
  const file = join(deploymentsDir(), `${chainId}.json`);
  if (!existsSync(file)) return null;
  const j = JSON.parse(readFileSync(file, "utf8"));
  return { ...j, kind: "season", chainId, rpcUrl } as Deployment;
}

/**
 * The deployment the game renders: the rounds mine when one is configured, otherwise the season
 * (the 2026-09-05 mainnet seasons still run for redemption). Server-only.
 */
export function getDeployment(): AnyDeployment | null {
  return getRoundsDeployment() ?? getSeasonDeployment();
}
