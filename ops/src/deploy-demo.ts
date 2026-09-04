/**
 * Deploys a funded demo season to a local Anvil (mirrors contracts/script/DeployDemo.s.sol) and
 * writes contracts/deployments/<chainId>.json. Used by the app's dev setup and Playwright.
 *
 *   pnpm --filter @stock-miner/ops deploy-demo            # defaults: pace 7200 s at 500k hash
 *   PACE_SECONDS=600 DEMO_HASH=500000 OPEN_DELAY=0 MAX_DURATION=2592000 pnpm --filter @stock-miner/ops deploy-demo
 * Opens OPEN_DELAY + 120 s after deploy (default: two minutes). MAX_DURATION defaults to 30 days so time-warped
 * demos never hit the cap; real seasons set it to a few hours (docs/04 §5.2).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createPublicClient, createWalletClient, http, parseEther, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { artifact, REPO_ROOT } from "./lib/artifacts.js";

const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const PACE = BigInt(process.env.PACE_SECONDS ?? "7200");
const DEMO_HASH = BigInt(process.env.DEMO_HASH ?? "500000");
const OPEN_DELAY = BigInt(process.env.OPEN_DELAY ?? "0");
const MAX_DURATION = Number(process.env.MAX_DURATION ?? String(30 * 86400));
const KEYS: Hex[] = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
  "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
];
const WAD = 10n ** 18n;

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
  difficultyTotal: string;
}

export async function deployDemo(): Promise<Deployment> {
  const account = privateKeyToAccount(KEYS[0]);
  const pub = createPublicClient({ chain: foundry, transport: http(RPC), pollingInterval: 250 });
  const wallet = createWalletClient({ account, chain: foundry, transport: http(RPC), pollingInterval: 250 });
  const accounts = KEYS.map((k) => privateKeyToAccount(k).address);

  async function deploy(file: string, name: string, args: unknown[] = []): Promise<Address> {
    const { abi, bytecode } = artifact(file, name);
    const hash = await wallet.deployContract({ abi, bytecode, args });
    const rcpt = await pub.waitForTransactionReceipt({ hash });
    if (!rcpt.contractAddress) throw new Error(`no address for ${name}`);
    return rcpt.contractAddress;
  }
  async function write(file: string, name: string, address: Address, fn: string, args: unknown[] = []) {
    const { abi } = artifact(file, name);
    const hash = await wallet.writeContract({ abi, address, functionName: fn, args });
    const rcpt = await pub.waitForTransactionReceipt({ hash });
    if (rcpt.status !== "success") throw new Error(`${name}.${fn} reverted`);
    return rcpt;
  }

  const rig = await deploy("RIG.sol", "RIG", [account.address]);
  const lp = await deploy("MockERC20.sol", "MockERC20", ["RIG/USDC LP", "RIG-LP", 18]);
  const usdc = await deploy("MockERC20.sol", "MockERC20", ["USD Coin", "USDC", 6]);
  const oracle = await deploy("MockPriceOracle.sol", "MockPriceOracle");
  const eligibility = await deploy("AllowlistEligibility.sol", "AllowlistEligibility", [account.address]);
  const md = await deploy("Deployers.sol", "MineDeployer");
  const fd = await deploy("Deployers.sol", "FragmentsDeployer");
  const vd = await deploy("Deployers.sol", "VaultDeployer");
  const factory = await deploy("SeasonFactory.sol", "SeasonFactory", ["http://localhost:3000/api/frag/{id}.json", md, fd, vd]);
  await write("Deployers.sol", "MineDeployer", md, "init", [factory]);
  await write("Deployers.sol", "FragmentsDeployer", fd, "init", [factory]);
  await write("Deployers.sol", "VaultDeployer", vd, "init", [factory]);

  const syms = ["NVDAx", "TSLAx", "AAPLx", "SPYx"];
  const prices = [172n * 10n ** 8n, 350n * 10n ** 8n, 230n * 10n ** 8n, 767n * 10n ** 8n];
  const pool = [5n * WAD, 6n * WAD, 10n * WAD, 6n * WAD];
  const diffShare = [2000n, 2500n, 2500n, 3000n];
  const now = (await pub.getBlock()).timestamp;
  const stocks: Address[] = [];
  for (let i = 0; i < 4; i++) {
    const s = await deploy("MockStockToken.sol", "MockStockToken", [syms[i], syms[i]]);
    stocks.push(s);
    await write("MockPriceOracle.sol", "MockPriceOracle", oracle, "set", [s, prices[i], now]);
  }

  const dTotal = DEMO_HASH * WAD * PACE;
  const difficulty = diffShare.map((bps) => {
    const raw = (dTotal * bps) / 10_000n;
    return raw - (raw % 8n);
  });
  const openTime = now + OPEN_DELAY + 120n;
  const params = {
    rig, lpToken: lp, lpWeightPerToken: 25n * 10n ** 17n, openTime, maxDurationSeconds: MAX_DURATION,
    blocks: 4, shiftsPerBlock: 8, stocks, poolTokens: pool, difficulty, fragPerToken: 1_000_000n,
    minStakeWeight: 100n * WAD, activationFeeBps: 100, earlyExitFeeBps: 300,
    gpuMultBps: [10000, 12000, 14000, 16000, 18000, 20000], gpuCostBps: [400, 600, 900, 1300, 1800],
    coolCostBps: [300, 500, 800], heatPerOc: [40, 30, 22, 15], coolPerShift: [10, 18, 26, 36], heatMax: 100,
    ocCostBps: 200, ocBoostBps: 5000, maxActiveOc: 3, ocShiftSpan: 1, redemptionDays: 30, cashOutFeeBps: 100,
    pauseGraceSeconds: 1800, treasury: account.address,
  };
  const fabi = artifact("SeasonFactory.sol", "SeasonFactory").abi;
  const { result } = await pub.simulateContract({ abi: fabi, address: factory, functionName: "create", args: [params, eligibility, oracle, usdc, false], account });
  await write("SeasonFactory.sol", "SeasonFactory", factory, "create", [params, eligibility, oracle, usdc, false]);
  const [seasonId, mine, fragments, vault] = result as [bigint, Address, Address, Address];

  for (let i = 0; i < 4; i++) {
    await write("MockStockToken.sol", "MockStockToken", stocks[i], "setAllowed", [vault, true]);
    await write("MockStockToken.sol", "MockStockToken", stocks[i], "mint", [account.address, pool[i]]);
    await write("MockStockToken.sol", "MockStockToken", stocks[i], "approve", [vault, pool[i]]);
  }
  await write("MockERC20.sol", "MockERC20", usdc, "mint", [account.address, 50_000n * 10n ** 6n]);
  await write("MockERC20.sol", "MockERC20", usdc, "approve", [vault, 50_000n * 10n ** 6n]);
  await write("RedemptionVault.sol", "RedemptionVault", vault, "fund", [50_000n * 10n ** 6n]);

  for (const a of accounts) {
    if (a !== account.address) await write("RIG.sol", "RIG", rig, "transfer", [a, parseEther("2000000")]);
    await write("MockERC20.sol", "MockERC20", lp, "mint", [a, parseEther("200000")]);
    await write("AllowlistEligibility.sol", "AllowlistEligibility", eligibility, "set", [a, true]);
    for (const s of stocks) await write("MockStockToken.sol", "MockStockToken", s, "setAllowed", [a, true]);
  }

  const chainId = await pub.getChainId();
  const dep: Deployment = {
    chainId, seasonId: Number(seasonId), rig, lp, usdc, oracle, eligibility, factory, mine, fragments, vault, stocks,
    openTime: Number(openTime), difficultyTotal: dTotal.toString(),
  };
  const dir = join(REPO_ROOT, "contracts", "deployments");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${chainId}.json`), JSON.stringify(dep, null, 2) + "\n");
  return dep;
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop()!);
if (isMain) {
  deployDemo().then((d) => console.log(JSON.stringify({ mine: d.mine, vault: d.vault, openTime: d.openTime }, null, 2)));
}
