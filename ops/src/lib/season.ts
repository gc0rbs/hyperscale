import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createPublicClient, createWalletClient, defineChain, http, type Address, type Chain, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { artifact, REPO_ROOT } from "./artifacts.js";

export const ANVIL_KEYS: Hex[] = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
  "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
];

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
  /** block the season was created in (indexer start block) */
  block?: number;
  difficultyTotal: string;
  seasonFile?: string;
  paramsHash?: Hex;
}

export interface FactoryDeployment {
  chainId: number;
  deployer: Address;
  factory: Address;
  mineDeployer: Address;
  fragmentsDeployer: Address;
  vaultDeployer: Address;
  baseUri: string;
  rig?: Address;
  lp?: Address;
  usdc?: Address;
  oracle?: Address;
  eligibility?: Address;
  stocks?: Address[];
}

export interface ChainProfile {
  name: string;
  chainId: number;
  rpcUrl: string;
  explorerApi: string | null;
  mocks: boolean;
  rig?: Address;
  lpToken?: Address;
  lpPairKind?: string;
  usdc?: Address;
  oracle?: Address;
  eligibility?: Address;
  treasury?: Address;
  stocks?: Record<string, Address>;
  /** Chain-wide contracts the round mine's funder uses: weth, uniswapV3Factory, ponsFactory, ponsFeeEscrow, ponsMemeHook. */
  external?: Record<string, Address>;
}

export const DEPLOYMENTS = join(REPO_ROOT, "contracts", "deployments");

export function chainId(): number {
  return Number(process.env.CHAIN_ID ?? 31337);
}

export function loadDeployment(id = chainId()): Deployment {
  const p = join(DEPLOYMENTS, `${id}.json`);
  if (existsSync(p)) return JSON.parse(readFileSync(p, "utf8")) as Deployment;
  // No deployments file (a host without the mount, e.g. the Railway keeper/watch services): the mine
  // address comes from env; the other addresses are optional and only some scripts need them.
  const mine = process.env.MINE_ADDRESS as Address | undefined;
  if (!mine) throw new Error(`no season deployment for chain ${id} (${p}); run CreateSeason first or set MINE_ADDRESS`);
  const zero = "0x0000000000000000000000000000000000000000" as Address;
  const env = (k: string) => (process.env[k] as Address | undefined) ?? zero;
  return {
    chainId: id,
    seasonId: Number(process.env.SEASON_ID ?? 0),
    rig: env("RIG_ADDRESS"), lp: zero, usdc: env("USDC_ADDRESS"), oracle: env("ORACLE_ADDRESS"),
    eligibility: env("ELIGIBILITY_ADDRESS"), factory: env("FACTORY_ADDRESS"), mine,
    fragments: env("FRAGMENTS_ADDRESS"), vault: env("VAULT_ADDRESS"),
    stocks: (process.env.STOCK_ADDRESSES ?? "").split(",").filter(Boolean) as Address[],
    openTime: Number(process.env.OPEN_TIME ?? 0),
    difficultyTotal: "0",
  };
}

/** deployments/<chainId>-adapters.json from DeployAdapters.s.sol, if present. */
export function loadAdapters(id = chainId()): { oracle: Address; eligibility: Address; stocks: Address[]; feeds: Address[] } | null {
  const p = join(DEPLOYMENTS, `${id}-adapters.json`);
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as { oracle: Address; eligibility: Address; stocks: Address[]; feeds: Address[] }) : null;
}

export function loadFactoryDeployment(id = chainId()): FactoryDeployment {
  const p = join(DEPLOYMENTS, `${id}-factory.json`);
  if (!existsSync(p)) throw new Error(`no factory deployment for chain ${id} (${p}); run DeployFactory first`);
  return JSON.parse(readFileSync(p, "utf8")) as FactoryDeployment;
}

/** Expands `${ENV}` placeholders in a profile string. */
function expand(s: string | null | undefined): string | null {
  if (s == null) return null;
  // `${VAR}` and `${VAR:-default}` (the chain profiles use the latter for public RPCs)
  return s.replace(/\$\{([A-Z0-9_]+)(?::-([^}]*))?\}/g, (_, k: string, d?: string) => process.env[k] || d || "");
}

export function loadChainProfile(name: string): ChainProfile {
  const p = join(REPO_ROOT, "ops", "chains", `${name}.json`);
  if (!existsSync(p)) throw new Error(`unknown chain profile ${name} (${p})`);
  const raw = JSON.parse(readFileSync(p, "utf8")) as ChainProfile;
  return { ...raw, rpcUrl: expand(raw.rpcUrl) ?? "", explorerApi: expand(raw.explorerApi) };
}

export function viemChain(id = chainId(), rpc = process.env.RPC_URL ?? "http://127.0.0.1:8545"): Chain {
  if (id === 31337) return foundry;
  return defineChain({
    id,
    name: `chain-${id}`,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpc] } },
  });
}

export function clients(keyEnv = "KEEPER_KEY") {
  const rpc = process.env.RPC_URL ?? "http://127.0.0.1:8545";
  const id = chainId();
  let key = (process.env[keyEnv] ?? process.env.PRIVATE_KEY) as Hex | undefined;
  if (!key) {
    // Audit R1: the public Anvil keys are a convenience for chain 31337 only; anywhere else fail closed.
    if (id !== 31337) throw new Error(`${keyEnv} (or PRIVATE_KEY) must be set for chain ${id}`);
    key = ANVIL_KEYS[1];
  }
  const account = privateKeyToAccount(key);
  const chain = viemChain(id, rpc);
  const pub = createPublicClient({ chain, transport: http(rpc) });
  const wallet = createWalletClient({ account, chain, transport: http(rpc) });
  return { pub, wallet, account, chain };
}

export const mineAbi = artifact("SeasonMine.sol", "SeasonMine").abi;
export const vaultAbi = artifact("RedemptionVault.sol", "RedemptionVault").abi;
export const fragmentsAbi = artifact("StockFragments.sol", "StockFragments").abi;
export const erc20Abi = artifact("MockERC20.sol", "MockERC20").abi;
export const stockAbi = artifact("MockStockToken.sol", "MockStockToken").abi;
export const rigAbi = artifact("RIG.sol", "RIG").abi;
export const eligibilityAbi = artifact("AllowlistEligibility.sol", "AllowlistEligibility").abi;

export interface Eta { toShiftEnd: bigint; toBlockFound: bigint; toClose: bigint; idle: boolean }

export const PHASES = ["Funding", "PreOpen", "Open", "Closed", "Cancelled"] as const;

export async function readState(mine: Address) {
  const { pub } = clients();
  const [phase, shift, totalHash, closeX, eta, lastX] = await Promise.all([
    pub.readContract({ abi: mineAbi, address: mine, functionName: "phase" }) as Promise<number>,
    pub.readContract({ abi: mineAbi, address: mine, functionName: "shift" }) as Promise<number>,
    pub.readContract({ abi: mineAbi, address: mine, functionName: "totalHash" }) as Promise<bigint>,
    pub.readContract({ abi: mineAbi, address: mine, functionName: "closeX" }) as Promise<bigint>,
    pub.readContract({ abi: mineAbi, address: mine, functionName: "eta" }) as Promise<Eta>,
    pub.readContract({ abi: mineAbi, address: mine, functionName: "lastX" }) as Promise<bigint>,
  ]);
  const block = await pub.getBlock();
  return { phase, shift, totalHash, closeX, eta, lastX, now: block.timestamp };
}

export function arg(flag: string, def?: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1];
  return def;
}

export function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}
