/**
 * Low-rate deployer for a real chain (docs/RUNBOOK.md steps 1 and 1b). The public Robinhood Chain
 * RPC rate-limits Foundry's forked simulation, so this sends one transaction at a time with viem and
 * writes the same deployment files the Forge scripts would.
 *
 *   PRIVATE_KEY=0x… CHAIN_ID=4663 RPC_URL=… pnpm --filter @stock-miner/ops deploy-mainnet factory [--base-uri URL]
 *   PRIVATE_KEY=0x… CHAIN_ID=4663 RPC_URL=… pnpm --filter @stock-miner/ops deploy-mainnet adapters --chain robinhood
 *   PRIVATE_KEY=0x… CHAIN_ID=4663 RPC_URL=… pnpm --filter @stock-miner/ops deploy-mainnet season --season seasons/<name>.json
 *
 * `factory` deploys the three deployers and the SeasonFactory, then inits the deployers →
 * deployments/<chainId>-factory.json. `adapters` deploys OpenEligibility and ChainlinkOracle over the
 * chain profile's stock and feed maps, checks every feed answers → deployments/<chainId>-adapters.json.
 * `season` calls `SeasonFactory.create` with a plan JSON from `ops plan` (simulated first, so an
 * `InvalidParams` reason shows before any gas is spent) → deployments/<chainId>.json, the file the app,
 * keeper, watcher and indexer read. Anvil rehearsal: `--mock-feeds` deploys MockAggregators with
 * fixed prices instead of real feeds.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { formatEther, type Address, type Hex } from "viem";
import { paramsHash, seasonParamsStruct } from "./plan.js";
import type { SeasonParamsJson } from "./lib/validate.js";
import { artifact, REPO_ROOT } from "./lib/artifacts.js";
import { arg, chainId, clients, DEPLOYMENTS, hasFlag, loadChainProfile, loadFactoryDeployment, type Deployment } from "./lib/season.js";

const stage = process.argv[2];
const { pub, wallet, account } = clients("PRIVATE_KEY");

async function deploy(file: string, name: string, args: unknown[] = []): Promise<Address> {
  const a = artifact(file, name);
  const hash = await wallet.deployContract({ abi: a.abi, bytecode: a.bytecode, args });
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== "success" || !r.contractAddress) throw new Error(`${name} deployment reverted (${hash})`);
  console.log(`[deploy] ${name} ${r.contractAddress} gas=${r.gasUsed}`);
  return r.contractAddress;
}
async function send(file: string, name: string, address: Address, functionName: string, args: unknown[]) {
  const a = artifact(file, name);
  const hash = await wallet.writeContract({ abi: a.abi, address, functionName, args });
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`${name}.${functionName} reverted (${hash})`);
  console.log(`[deploy] ${name}.${functionName} ok gas=${r.gasUsed}`);
}

async function main() {
  const id = chainId();
  const live = await pub.getChainId();
  if (live !== id) throw new Error(`RPC is chain ${live}, CHAIN_ID is ${id}`);
  const bal = await pub.getBalance({ address: account.address });
  console.log(`[deploy] chain ${id} deployer ${account.address} balance ${formatEther(bal)} ETH`);
  if (bal === 0n) throw new Error("deployer has no ETH for gas");
  mkdirSync(DEPLOYMENTS, { recursive: true });

  if (stage === "factory") {
    const baseUri = arg("--base-uri", process.env.FRAG_BASE_URI ?? "https://hyperscaling.xyz/api/frag/{id}.json")!;
    const md = await deploy("Deployers.sol", "MineDeployer");
    const fd = await deploy("Deployers.sol", "FragmentsDeployer");
    const vd = await deploy("Deployers.sol", "VaultDeployer");
    const factory = await deploy("SeasonFactory.sol", "SeasonFactory", [baseUri, md, fd, vd]);
    await send("Deployers.sol", "MineDeployer", md, "init", [factory]);
    await send("Deployers.sol", "FragmentsDeployer", fd, "init", [factory]);
    await send("Deployers.sol", "VaultDeployer", vd, "init", [factory]);
    const out = { chainId: id, deployer: account.address, factory, mineDeployer: md, fragmentsDeployer: fd, vaultDeployer: vd, baseUri };
    const p = join(DEPLOYMENTS, `${id}-factory.json`);
    writeFileSync(p, JSON.stringify(out, null, 2) + "\n");
    console.log(`[deploy] wrote ${p}`);
    return;
  }
  if (stage === "adapters") {
    const chainName = arg("--chain", "robinhood")!;
    const tpl = JSON.parse(readFileSync(arg("--params", join(REPO_ROOT, "specs", "params", "season-default.json"))!, "utf8"));
    const syms: string[] = tpl.stocks.map((s: { symbol: string }) => s.symbol);
    let stocks: Address[]; let feeds: Address[];
    if (hasFlag("--mock-feeds")) {
      if (id !== 31337) throw new Error("--mock-feeds is for Anvil only");
      const fac = JSON.parse(readFileSync(join(DEPLOYMENTS, `${id}-factory.json`), "utf8"));
      stocks = fac.stocks as Address[];
      feeds = [];
      const prices = [230n, 999n, 1719n, 717n];
      for (let i = 0; i < 4; i++) {
        const f = await deploy("MockAggregator.sol", "MockAggregator", [8]);
        await send("MockAggregator.sol", "MockAggregator", f, "set", [prices[i] * 10n ** 8n, BigInt(Math.floor(Date.now() / 1000))]);
        feeds.push(f);
      }
    } else {
      const chain = loadChainProfile(chainName) as ReturnType<typeof loadChainProfile> & { feeds?: Record<string, string> };
      const zero = /^0x0{40}$/i;
      stocks = syms.map((s) => chain.stocks?.[s] as Address);
      feeds = syms.map((s) => chain.feeds?.[s] as Address);
      syms.forEach((s, i) => { if (!stocks[i] || zero.test(stocks[i]) || !feeds[i] || zero.test(feeds[i])) throw new Error(`profile ${chainName}: missing stock or feed for ${s}`); });
    }
    const eligibility = await deploy("OpenEligibility.sol", "OpenEligibility");
    const oracle = await deploy("ChainlinkOracle.sol", "ChainlinkOracle", [stocks, feeds]);
    const oAbi = artifact("ChainlinkOracle.sol", "ChainlinkOracle").abi;
    for (let i = 0; i < stocks.length; i++) {
      const [price, at] = (await pub.readContract({ abi: oAbi, address: oracle, functionName: "usdPrice", args: [stocks[i]] })) as [bigint, bigint];
      console.log(`[deploy] ${syms[i]} price ${(Number(price) / 1e8).toFixed(2)} USD updatedAt ${new Date(Number(at) * 1000).toISOString()}`);
      if (price === 0n) throw new Error(`${syms[i]} feed returned no price`);
    }
    const out = { chainId: id, eligibility, stocks, feeds, oracle };
    const p = join(DEPLOYMENTS, `${id}-adapters.json`);
    writeFileSync(p, JSON.stringify(out, null, 2) + "\n");
    console.log(`[deploy] wrote ${p}`);
    return;
  }
  if (stage === "season") {
    const fileArg = arg("--season");
    if (!fileArg) throw new Error("--season <path to a plan JSON from `ops plan`> is required");
    const file = resolve(fileArg); // absolute: fund/keeper resolve relative paths against contracts/
    const season = JSON.parse(readFileSync(file, "utf8")) as {
      chainId: number; params: SeasonParamsJson; eligibility: Address; oracle: Address; usdc: Address; transfersEnabled: boolean; paramsHash?: Hex;
    };
    if (season.chainId !== id) throw new Error(`season file is for chain ${season.chainId}, CHAIN_ID is ${id}`);
    const factory = (arg("--factory") as Address | undefined) ?? loadFactoryDeployment(id).factory;
    const p = seasonParamsStruct(season.params);
    const hash = paramsHash(season.params);
    if (season.paramsHash && season.paramsHash.toLowerCase() !== hash.toLowerCase()) throw new Error(`params were edited after planning: file hash ${season.paramsHash}, computed ${hash}`);
    const fabi = artifact("SeasonFactory.sol", "SeasonFactory").abi;
    const args = [p, season.eligibility, season.oracle, season.usdc, season.transfersEnabled] as const;
    const { request, result } = await pub.simulateContract({ abi: fabi, address: factory, functionName: "create", args, account });
    const [seasonId, mine, fragments, vault] = result as unknown as [bigint, Address, Address, Address];
    console.log(`[deploy] create simulated: season ${seasonId} mine ${mine} fragments ${fragments} vault ${vault}`);
    if (hasFlag("--dry-run")) { console.log("[deploy] --dry-run: not broadcasting"); return; }
    const txHash = await wallet.writeContract(request);
    const r = await pub.waitForTransactionReceipt({ hash: txHash });
    if (r.status !== "success") throw new Error(`SeasonFactory.create reverted (${txHash})`);
    console.log(`[deploy] SeasonFactory.create ok gas=${r.gasUsed} block=${r.blockNumber}`);
    const out: Deployment = {
      chainId: id, seasonId: Number(seasonId), rig: p.rig, lp: p.lpToken, usdc: season.usdc, oracle: season.oracle, eligibility: season.eligibility,
      factory, mine, fragments, vault, stocks: p.stocks, openTime: Number(p.openTime), block: Number(r.blockNumber), seasonFile: file,
      paramsHash: hash, difficultyTotal: p.difficulty.reduce((a, b) => a + b, 0n).toString(),
    };
    const outPath = join(DEPLOYMENTS, `${id}.json`);
    writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
    console.log(`[deploy] wrote ${outPath}`);
    return;
  }
  throw new Error("usage: deploy-mainnet factory|adapters|season");
}

main().catch((e: Error) => { console.error("[deploy] failed:", e.message); process.exit(1); });
