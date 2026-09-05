import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createConfig } from "ponder";
import type { Address } from "viem";
import { RedemptionVaultAbi } from "./abis/RedemptionVault";
import { SeasonMineAbi } from "./abis/SeasonMine";
import { StockFragmentsAbi } from "./abis/StockFragments";

/**
 * One season per Ponder instance. Addresses come from `contracts/deployments/<chainId>.json`
 * (written by `pnpm --filter @stock-miner/ops deploy-demo`), each overridable by env:
 *
 *   CHAIN_ID                  default 31337 (Anvil)
 *   PONDER_RPC_URL_<chainId>  default http://127.0.0.1:8545
 *   DEPLOYMENTS_FILE          default ../contracts/deployments/<chainId>.json
 *   SEASON_MINE_ADDRESS, STOCK_FRAGMENTS_ADDRESS, REDEMPTION_VAULT_ADDRESS
 *   START_BLOCK               default: the `block` recorded in the deployments file, else 0
 */
interface Deployment {
  chainId?: number;
  mine?: Address;
  fragments?: Address;
  vault?: Address;
  factory?: Address;
  rig?: Address;
  openTime?: number;
  block?: number;
}

const here = dirname(fileURLToPath(import.meta.url));
const chainId = Number(process.env.CHAIN_ID ?? "31337");
const rpc = process.env[`PONDER_RPC_URL_${chainId}`] ?? "http://127.0.0.1:8545";
const deploymentsFile =
  process.env.DEPLOYMENTS_FILE ?? resolve(here, `../contracts/deployments/${chainId}.json`);

const deployment: Deployment = existsSync(deploymentsFile)
  ? (JSON.parse(readFileSync(deploymentsFile, "utf8")) as Deployment)
  : {};

function pick(envName: string, fromFile: Address | undefined, label: string): Address {
  const value = process.env[envName] ?? fromFile;
  if (!value) {
    throw new Error(
      `indexer: no ${label} address. Run \`pnpm --filter @stock-miner/ops deploy-demo\` ` +
        `(writes ${deploymentsFile}) or set ${envName}.`,
    );
  }
  return value.toLowerCase() as Address;
}

// An empty START_BLOCK (compose passes "" when unset) means "use the deployment file".
const startBlock = Number(process.env.START_BLOCK || deployment.block || 0);

export default createConfig({
  chains: {
    season: { id: chainId, rpc },
  },
  contracts: {
    SeasonMine: {
      chain: "season",
      abi: SeasonMineAbi,
      address: pick("SEASON_MINE_ADDRESS", deployment.mine, "SeasonMine"),
      startBlock,
    },
    StockFragments: {
      chain: "season",
      abi: StockFragmentsAbi,
      address: pick("STOCK_FRAGMENTS_ADDRESS", deployment.fragments, "StockFragments"),
      startBlock,
    },
    RedemptionVault: {
      chain: "season",
      abi: RedemptionVaultAbi,
      address: pick("REDEMPTION_VAULT_ADDRESS", deployment.vault, "RedemptionVault"),
      startBlock,
    },
  },
});
