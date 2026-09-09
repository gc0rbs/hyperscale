/**
 * Copies the ABIs the app and indexer need from contracts/out into app/src/abi/*.json.
 * Run after `forge build`: `pnpm --filter @stock-miner/ops sync-abi`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { artifact, REPO_ROOT } from "./lib/artifacts.js";

const WANTED: [string, string][] = [
  ["SeasonMine.sol", "SeasonMine"],
  ["StockFragments.sol", "StockFragments"],
  ["RedemptionVault.sol", "RedemptionVault"],
  ["SeasonFactory.sol", "SeasonFactory"],
  ["RoundMine.sol", "RoundMine"],
  ["RoundVault.sol", "RoundVault"],
  ["FeeFunder.sol", "FeeFunder"],
  ["MockWETH.sol", "MockWETH"],
  ["MockV3Pool.sol", "MockV3Pool"],
  ["Deployers.sol", "MineDeployer"],
  ["Deployers.sol", "FragmentsDeployer"],
  ["Deployers.sol", "VaultDeployer"],
  ["RIG.sol", "RIG"],
  ["MockERC20.sol", "MockERC20"],
  ["MockStockToken.sol", "MockStockToken"],
  ["MockPriceOracle.sol", "MockPriceOracle"],
  ["AllowlistEligibility.sol", "AllowlistEligibility"],
];

const dir = join(REPO_ROOT, "app", "src", "abi");
mkdirSync(dir, { recursive: true });
for (const [file, name] of WANTED) {
  const { abi } = artifact(file, name);
  writeFileSync(join(dir, `${name}.json`), JSON.stringify(abi, null, 2) + "\n");
}
console.log(`synced ${WANTED.length} ABIs to app/src/abi`);
