/**
 * Deploys the continuous round mine (docs/13): RoundMine + StockFragments + RoundVault, which reference
 * each other in their constructors, so the three CREATE addresses are predicted from the deployer's
 * nonce first. One transaction at a time (the public Robinhood RPC rate-limits Forge's simulation).
 *
 *   # Anvil demo: mock token set, round 0 funded, players allowlisted, genesis in two minutes
 *   pnpm --filter @stock-miner/ops deploy-rounds demo [--round-seconds 3600] [--claim-seconds 900]
 *
 *   # Mainnet: token set, adapters and treasury from the chain profile; genesis = next full hour
 *   PRIVATE_KEY=0x… CHAIN_ID=4663 RPC_URL=… pnpm --filter @stock-miner/ops deploy-rounds mainnet --chain robinhood [--dry-run]
 *   # Before the token exists: rig and genesis stay zero; `rounds-admin launch` sets both once
 *   PRIVATE_KEY=0x… CHAIN_ID=4663 RPC_URL=… pnpm --filter @stock-miner/ops deploy-rounds mainnet --chain robinhood --prelaunch
 *
 * Writes contracts/deployments/<chainId>-rounds.json (mine, fragments, vault, tokens, genesis, params),
 * the file the app, keeper, watcher and indexer read (or the ROUNDS_* env values on Railway).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { encodeAbiParameters, formatEther, getContractAddress, keccak256, parseEther, type Address } from "viem";
import { artifact, REPO_ROOT } from "./lib/artifacts.js";
import { privateKeyToAccount } from "viem/accounts";
import { ANVIL_KEYS, arg, chainId, clients, DEPLOYMENTS, hasFlag, loadAdapters, loadChainProfile } from "./lib/season.js";

const WAD = 10n ** 18n;

export interface RoundParamsJson {
  rig: string; stocks: string[]; treasury: string; genesis: number; roundSeconds: number; claimSeconds: number;
  fragPerToken: string; minStakeWeight: string; activationFeeBps: number; exitFeeBps: number;
  gpuMultBps: number[]; gpuCostBps: number[]; coolCostBps: number[]; heatPerOc: number[]; coolPerRound: number[];
  heatMax: number; ocCostBps: number; ocBoostBps: number; maxActiveOc: number; ocRoundSpan: number; pauseGraceSeconds: number;
}

export interface RoundsDeployment {
  chainId: number;
  operator: Address;
  rig: Address;
  usdc: Address;
  oracle: Address;
  eligibility: Address;
  mine: Address;
  fragments: Address;
  vault: Address;
  /** FeeFunder: the Pons fee wallet. Redirect the token's creator fees here (rounds-admin set-source). */
  feeFunder: Address;
  weth: Address;
  pools: Address[];
  /** Pons: the locker that pays the creator fee share, the launch factory, the Uniswap factory (mainnet). */
  ponsLocker?: Address;
  ponsFactory?: Address;
  uniswapV3Factory?: Address;
  stocks: Address[];
  symbols: string[];
  genesis: number;
  roundSeconds: number;
  claimSeconds: number;
  block: number;
  params: RoundParamsJson;
  paramsHash: `0x${string}`;
}

/** Template values (docs/03 tables) with the rounds fields from specs/params/rounds-default.json. */
export function roundParamsFromTemplate(tpl: Record<string, unknown>, rig: Address, stocks: Address[], treasury: Address, genesis: number, roundSeconds: number, claimSeconds: number): RoundParamsJson {
  const n = (k: string) => Number(tpl[k]);
  const arr = (k: string) => (tpl[k] as number[]).map(Number);
  return {
    rig, stocks, treasury, genesis, roundSeconds, claimSeconds,
    fragPerToken: String(tpl.fragPerToken), minStakeWeight: (BigInt(String(tpl.minStakeWeight)) * WAD).toString(),
    activationFeeBps: n("activationFeeBps"), exitFeeBps: n("exitFeeBps"),
    gpuMultBps: arr("gpuMultBps"), gpuCostBps: arr("gpuCostBps"), coolCostBps: arr("coolCostBps"),
    heatPerOc: arr("heatPerOc"), coolPerRound: arr("coolPerRound"), heatMax: n("heatMax"),
    ocCostBps: n("ocCostBps"), ocBoostBps: n("ocBoostBps"), maxActiveOc: n("maxActiveOc"), ocRoundSpan: n("ocRoundSpan"),
    pauseGraceSeconds: n("pauseGraceSeconds"),
  };
}

export function roundParamsStruct(p: RoundParamsJson) {
  return {
    rig: p.rig as Address, stocks: p.stocks as Address[], treasury: p.treasury as Address, genesis: BigInt(p.genesis),
    roundSeconds: p.roundSeconds, claimSeconds: p.claimSeconds, fragPerToken: BigInt(p.fragPerToken), minStakeWeight: BigInt(p.minStakeWeight),
    activationFeeBps: p.activationFeeBps, exitFeeBps: p.exitFeeBps,
    gpuMultBps: p.gpuMultBps as [number, number, number, number, number, number],
    gpuCostBps: p.gpuCostBps as [number, number, number, number, number],
    coolCostBps: p.coolCostBps as [number, number, number],
    heatPerOc: p.heatPerOc as [number, number, number, number], coolPerRound: p.coolPerRound as [number, number, number, number],
    heatMax: p.heatMax, ocCostBps: p.ocCostBps, ocBoostBps: p.ocBoostBps, maxActiveOc: p.maxActiveOc, ocRoundSpan: p.ocRoundSpan,
    pauseGraceSeconds: p.pauseGraceSeconds,
  };
}

const roundParamsAbi = [{
  type: "tuple",
  components: [
    { name: "rig", type: "address" }, { name: "stocks", type: "address[]" }, { name: "treasury", type: "address" },
    { name: "genesis", type: "uint64" }, { name: "roundSeconds", type: "uint32" }, { name: "claimSeconds", type: "uint32" },
    { name: "fragPerToken", type: "uint256" }, { name: "minStakeWeight", type: "uint256" },
    { name: "activationFeeBps", type: "uint16" }, { name: "exitFeeBps", type: "uint16" }, { name: "gpuMultBps", type: "uint16[6]" },
    { name: "gpuCostBps", type: "uint16[5]" }, { name: "coolCostBps", type: "uint16[3]" }, { name: "heatPerOc", type: "uint8[4]" },
    { name: "coolPerRound", type: "uint8[4]" }, { name: "heatMax", type: "uint8" }, { name: "ocCostBps", type: "uint16" },
    { name: "ocBoostBps", type: "uint16" }, { name: "maxActiveOc", type: "uint8" }, { name: "ocRoundSpan", type: "uint8" },
    { name: "pauseGraceSeconds", type: "uint32" },
  ],
}] as const;

export function roundParamsHash(p: RoundParamsJson) {
  return keccak256(encodeAbiParameters(roundParamsAbi, [roundParamsStruct(p)]));
}

/** Mirror of the RoundMine constructor checks so a bad file fails before gas is spent. */
export function validateRoundParams(p: RoundParamsJson): string[] {
  const errs: string[] = [];
  const zero = /^0x0{40}$/i;
  if (p.stocks.length !== 4 || p.stocks.some((s) => zero.test(s))) errs.push("stocks");
  if (zero.test(p.treasury)) errs.push("addresses");
  if (zero.test(p.rig) !== (p.genesis === 0)) errs.push("launch pair"); // pre-launch: both zero
  if (p.roundSeconds === 0) errs.push("round");
  if (p.claimSeconds === 0 || p.claimSeconds >= p.roundSeconds) errs.push("claim < round");
  if (BigInt(p.fragPerToken) === 0n || BigInt(p.fragPerToken) > WAD) errs.push("fragPerToken");
  if (BigInt(p.minStakeWeight) === 0n) errs.push("minStakeWeight");
  if (p.gpuMultBps.length !== 6 || p.gpuMultBps[0] !== 10_000 || p.gpuMultBps.some((v, i) => i > 0 && v <= p.gpuMultBps[i - 1])) errs.push("gpuMultBps");
  if (p.ocBoostBps * p.maxActiveOc > 30_000) errs.push("ocBoost*maxActiveOc");
  if (p.maxActiveOc === 0 || p.ocRoundSpan === 0) errs.push("overclock config");
  if (p.heatPerOc.some((h) => h > p.heatMax)) errs.push("heatPerOc > heatMax");
  if (p.activationFeeBps > 1000 || p.exitFeeBps > 2000) errs.push("fees");
  if (p.pauseGraceSeconds === 0) errs.push("grace");
  return errs;
}

async function main() {
  const stage = process.argv[2];
  const id = chainId();
  const { pub, wallet, account } = clients("PRIVATE_KEY");
  const live = await pub.getChainId();
  if (live !== id) throw new Error(`RPC is chain ${live}, CHAIN_ID is ${id}`);
  const bal = await pub.getBalance({ address: account.address });
  console.log(`[rounds] chain ${id} deployer ${account.address} balance ${formatEther(bal)} ETH`);
  if (bal === 0n) throw new Error("deployer has no ETH for gas");
  mkdirSync(DEPLOYMENTS, { recursive: true });
  const tpl = JSON.parse(readFileSync(arg("--params", join(REPO_ROOT, "specs", "params", "rounds-default.json"))!, "utf8"));
  const roundSeconds = Number(arg("--round-seconds", String(tpl.roundSeconds)));
  const claimSeconds = Number(arg("--claim-seconds", String(tpl.claimSeconds)));
  const syms: string[] = tpl.stocks.map((s: { symbol: string }) => s.symbol);

  async function deploy(file: string, name: string, args: unknown[] = []): Promise<Address> {
    const a = artifact(file, name);
    const hash = await wallet.deployContract({ abi: a.abi, bytecode: a.bytecode, args });
    const r = await pub.waitForTransactionReceipt({ hash });
    if (r.status !== "success" || !r.contractAddress) throw new Error(`${name} deployment reverted (${hash})`);
    console.log(`[rounds] ${name} ${r.contractAddress} gas=${r.gasUsed}`);
    return r.contractAddress;
  }
  async function send(file: string, name: string, address: Address, functionName: string, args: unknown[], value?: bigint) {
    const a = artifact(file, name);
    const hash = await wallet.writeContract({ abi: a.abi, address, functionName, args, value });
    const r = await pub.waitForTransactionReceipt({ hash });
    if (r.status !== "success") throw new Error(`${name}.${functionName} reverted (${hash})`);
  }

  let rig: Address, usdc: Address, oracle: Address, eligibility: Address, treasury: Address, stocks: Address[];
  let operator: Address = account.address;
  let genesis: number;
  let weth: Address;
  let pools: Address[] = [];
  const shareBps: number[] = tpl.stocks.map((s: { symbol: string }) => Number((tpl.feeShareBps as Record<string, number> | undefined)?.[s.symbol] ?? 2500));
  const now = Number((await pub.getBlock()).timestamp);
  if (stage === "demo") {
    if (id !== 31337) throw new Error("demo is for Anvil only");
    rig = await deploy("RIG.sol", "RIG", [account.address]);
    usdc = await deploy("MockERC20.sol", "MockERC20", ["USD Coin", "USDG", 6]);
    oracle = await deploy("MockPriceOracle.sol", "MockPriceOracle");
    eligibility = await deploy("AllowlistEligibility.sol", "AllowlistEligibility", [account.address]);
    treasury = account.address;
    stocks = [];
    const prices = [230n, 999n, 1719n, 717n];
    for (let i = 0; i < 4; i++) {
      const s = await deploy("MockStockToken.sol", "MockStockToken", [syms[i], syms[i]]);
      stocks.push(s);
      await send("MockPriceOracle.sol", "MockPriceOracle", oracle, "set", [s, prices[i] * 10n ** 8n, BigInt(now)]);
    }
    genesis = now + Number(process.env.GENESIS_DELAY ?? 120);
    // Mock WETH and one fixed-price WETH/stock pool per stock so the FeeFunder path runs on Anvil.
    weth = await deploy("MockWETH.sol", "MockWETH");
    const stockPerEth = [10n, 2n, 1n, 4n]; // NVDA, MU, SNDK, QQQ per WETH on the mocks
    for (let i = 0; i < 4; i++) {
      const wethFirst = weth.toLowerCase() < stocks[i].toLowerCase();
      const rate = wethFirst ? stockPerEth[i] * WAD : WAD / stockPerEth[i] * 1n; // token1 per token0
      const pool = await deploy("MockV3Pool.sol", "MockV3Pool", [weth, stocks[i], 3000, wethFirst ? rate : (WAD * WAD) / (stockPerEth[i] * WAD)]);
      await send("MockStockToken.sol", "MockStockToken", stocks[i], "setAllowed", [pool, true]);
      await send("MockStockToken.sol", "MockStockToken", stocks[i], "mint", [pool, parseEther("100000")]);
      pools.push(pool);
    }
  } else if (stage === "mainnet") {
    const chain = loadChainProfile(arg("--chain", "robinhood")!);
    const adapters = loadAdapters(id);
    const zero = /^0x0{40}$/i;
    // --prelaunch: the token does not exist yet. rig and genesis stay zero and `rounds-admin launch`
    // sets both once, so the mine can be deployed, verified, funded and wired to the site days ahead.
    const prelaunch = hasFlag("--prelaunch");
    // A live deploy must name the token explicitly; the profile's `rig` is never used for the round mine.
    rig = prelaunch ? ("0x0000000000000000000000000000000000000000" as Address) : ((arg("--rig") ?? "") as Address);
    usdc = chain.usdc as Address;
    oracle = (chain.oracle && !zero.test(chain.oracle) ? chain.oracle : adapters?.oracle) as Address;
    eligibility = (chain.eligibility && !zero.test(chain.eligibility) ? chain.eligibility : adapters?.eligibility) as Address;
    treasury = (arg("--treasury") ?? chain.treasury) as Address;
    // The operator (launch, halt, rescue, FeeFunder owner) may be a wallet whose key never touches this
    // host: pass --operator and deploy from a gas-only key. Default: the deployer.
    operator = (arg("--operator") as Address | undefined) ?? account.address;
    if (!/^0x[0-9a-fA-F]{40}$/.test(operator) || zero.test(operator)) throw new Error("--operator must be an address");
    stocks = syms.map((s) => chain.stocks?.[s] as Address);
    for (const [k, v] of Object.entries({ usdc, oracle, eligibility, treasury })) if (!v || zero.test(v)) throw new Error(`profile is missing ${k}`);
    if (!prelaunch && (!/^0x[0-9a-fA-F]{40}$/.test(rig) || zero.test(rig))) throw new Error("pass --rig <the $VRAM address> (the chain profile's rig is not used), or --prelaunch to deploy before the token exists");
    syms.forEach((s, i) => { if (!stocks[i] || zero.test(stocks[i])) throw new Error(`profile is missing stock ${s}`); });
    genesis = prelaunch ? 0 : arg("--genesis") ? Number(arg("--genesis")) : Math.ceil((now + 60) / 3600) * 3600; // next full hour
    weth = (chain as { external?: { weth?: string } }).external?.weth as Address;
    const poolMap = (chain as { pools?: Record<string, { pool: string }> }).pools ?? {};
    pools = syms.map((s) => poolMap[s]?.pool as Address);
    if (!weth || zero.test(weth)) throw new Error("profile is missing external.weth");
    syms.forEach((s, i) => { if (!pools[i] || zero.test(pools[i])) throw new Error(`profile is missing pools.${s}.pool (the WETH/${s} Uniswap v3 pool)`); });
    if (prelaunch) console.log("[rounds] --prelaunch: rig and genesis stay zero until `rounds-admin launch --token … --genesis …`");
  } else {
    throw new Error("usage: deploy-rounds demo|mainnet");
  }

  const params = roundParamsFromTemplate(tpl, rig, stocks, treasury, genesis, roundSeconds, claimSeconds);
  const problems = validateRoundParams(params);
  if (problems.length) throw new Error(`invalid params: ${problems.join("; ")}`);
  const nonce = BigInt(await pub.getTransactionCount({ address: account.address }));
  const mineAddr = getContractAddress({ from: account.address, nonce });
  const fragAddr = getContractAddress({ from: account.address, nonce: nonce + 1n });
  const vaultAddr = getContractAddress({ from: account.address, nonce: nonce + 2n });
  // The metadata URL is immutable on StockFragments: the site lives at hyperscaling.xyz (client, 2026-09-09).
  const baseUri = arg("--base-uri", stage === "demo" ? "http://localhost:3000/api/frag/{id}.json" : (process.env.FRAG_BASE_URI ?? "https://www.hyperscaling.xyz/api/frag/{id}.json"));
  if (!baseUri || !/^https?:\/\/\S+\{id\}\S*$/.test(baseUri)) throw new Error("mainnet needs a valid --base-uri https://www.hyperscaling.xyz/api/frag/{id}.json (or FRAG_BASE_URI): it is immutable on the fragments contract");
  const vaultConfig = {
    mine: mineAddr, fragments: fragAddr, usdc, eligibility, oracle, operator,
    cashOutFeeBps: Number(tpl.cashOutFeeBps), fragPerToken: BigInt(params.fragPerToken), maxPriceAge: Number(tpl.maxPriceAgeSeconds), stocks,
  };
  console.log(`[rounds] genesis ${genesis} (${new Date(genesis * 1000).toISOString()}) round ${roundSeconds}s claim ${claimSeconds}s`);
  console.log(`[rounds] predicted mine ${mineAddr} fragments ${fragAddr} vault ${vaultAddr}`);
  console.log(`[rounds] paramsHash ${roundParamsHash(params)}`);
  if (hasFlag("--dry-run")) {
    const a = artifact("RoundMine.sol", "RoundMine");
    await pub.call({ account, data: a.bytecode, to: undefined }).catch((e: Error) => { throw new Error(`RoundMine creation simulation failed: ${e.message}`); });
    console.log("[rounds] --dry-run: not broadcasting");
    return;
  }
  console.log(`[rounds] operator ${operator}${operator.toLowerCase() === account.address.toLowerCase() ? " (the deployer)" : " (not the deployer: launch, halt and rescue need its key)"}`);
  const mine = await deploy("RoundMine.sol", "RoundMine", [roundParamsStruct(params), operator, fragAddr, vaultAddr]);
  const fragments = await deploy("StockFragments.sol", "StockFragments", [mineAddr, vaultAddr, stocks, BigInt(params.fragPerToken), false, baseUri]);
  const vault = await deploy("RoundVault.sol", "RoundVault", [vaultConfig]);
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  if (!same(mine, mineAddr) || !same(fragments, fragAddr) || !same(vault, vaultAddr)) throw new Error("address prediction mismatch; the deployer sent another transaction in between");

  // The FeeFunder: Pons pays its tax here; the flusher (keeper) turns it into the running round's pot.
  const legs = stocks.map((_, i) => ({ pool: pools[i], stock: i, shareBps: shareBps[i] }));
  const flusher = (arg("--flusher") as Address | undefined) ?? (process.env.FLUSHER_ADDRESS as Address | undefined);
  const feeFunder = await deploy("FeeFunder.sol", "FeeFunder", [operator, mine, weth, legs, flusher ?? "0x0000000000000000000000000000000000000000"]);
  console.log(`[rounds] FeeFunder ${feeFunder}: the Pons fee wallet. After the token launch: rounds-admin set-source --token 0x…, then the token deployer redirects fees here${flusher ? `; flusher ${flusher}` : "; no flusher set yet (rounds-admin set-flusher)"}`);
  let ponsLocker: Address | undefined;
  let ponsFactory: Address | undefined;
  let uniswapV3Factory: Address | undefined;
  if (stage === "demo") {
    // The Pons side on Anvil: a locker that pays the fee share and the token's own WETH pool, wired
    // exactly as mainnet will be (deployer redirects fees to the funder; owner sets the source).
    const locker = await deploy("MockPonsLocker.sol", "MockPonsLocker", [weth]);
    const wethFirst = weth.toLowerCase() < rig.toLowerCase();
    const rigPerEth = 1_000_000n;
    const rigPool = await deploy("MockV3Pool.sol", "MockV3Pool", [weth, rig, 10_000, wethFirst ? rigPerEth * WAD : (WAD * WAD) / (rigPerEth * WAD)]);
    await send("MockWETH.sol", "MockWETH", weth, "deposit", [], parseEther("5"));
    await send("MockWETH.sol", "MockWETH", weth, "transfer", [rigPool, parseEther("5")]);
    await send("MockPonsLocker.sol", "MockPonsLocker", locker, "register", [rig, account.address]);
    await send("MockPonsLocker.sol", "MockPonsLocker", locker, "setFeeRedirect", [rig, feeFunder]);
    await send("FeeFunder.sol", "FeeFunder", feeFunder, "setSource", [{ locker, token: rig, pool: rigPool }]);
    // A first hour of "trading": the locker owes the funder 0.5 WETH and 200k tokens (flush-fees --once collects it).
    await send("MockWETH.sol", "MockWETH", weth, "deposit", [], parseEther("0.5"));
    await send("MockWETH.sol", "MockWETH", weth, "transfer", [locker, parseEther("0.5")]);
    await send("RIG.sol", "RIG", rig, "transfer", [locker, parseEther("200000")]);
    await send("MockPonsLocker.sol", "MockPonsLocker", locker, "accrue", [rig, parseEther("0.5"), parseEther("200000")]);
    ponsLocker = locker;
  } else if (stage === "mainnet") {
    const ext = (loadChainProfile(arg("--chain", "robinhood")!).external ?? {}) as Record<string, Address>;
    ponsLocker = ext.ponsLocker;
    ponsFactory = ext.ponsFactory;
    uniswapV3Factory = ext.uniswapV3Factory;
  }

  if (stage === "demo") {
    // Allowlist the vault and the Anvil accounts on every mock stock, fund a day of rounds, top up the reserve.
    const accounts = ANVIL_KEYS.map((k) => privateKeyToAccount(k).address);
    // Round 0's pot: DEMO_POT of each stock, funded now (fees land in the running round, docs/13 §2).
    // The deployer keeps DEMO_WALLET of each stock to fund later rounds by hand or with fund-rounds --loop.
    const pot0 = parseEther(process.env.DEMO_POT ?? "1");
    const keep = parseEther(process.env.DEMO_WALLET ?? "47");
    for (const s of stocks) {
      await send("MockStockToken.sol", "MockStockToken", s, "setAllowed", [vault, true]);
      await send("MockStockToken.sol", "MockStockToken", s, "setAllowed", [feeFunder, true]);
      for (const a of accounts) await send("MockStockToken.sol", "MockStockToken", s, "setAllowed", [a, true]);
      await send("MockStockToken.sol", "MockStockToken", s, "mint", [account.address, pot0 + keep]);
      await send("MockStockToken.sol", "MockStockToken", s, "approve", [mine, pot0 + keep]);
    }
    for (let i = 0; i < 4; i++) await send("RoundMine.sol", "RoundMine", mine, "fund", [i, pot0]);
    if (!flusher) await send("FeeFunder.sol", "FeeFunder", feeFunder, "setFlusher", [accounts[1], true]); // Anvil #1 flushes on the demo (deployer is the owner on the demo)
    await send("MockERC20.sol", "MockERC20", usdc, "mint", [account.address, 50_000n * 10n ** 6n]);
    await send("MockERC20.sol", "MockERC20", usdc, "approve", [vault, 50_000n * 10n ** 6n]);
    await send("RoundVault.sol", "RoundVault", vault, "topUpReserve", [50_000n * 10n ** 6n]);
    for (const a of accounts) {
      if (a.toLowerCase() !== account.address.toLowerCase()) await send("RIG.sol", "RIG", rig, "transfer", [a, parseEther("2000000")]);
      await send("AllowlistEligibility.sol", "AllowlistEligibility", eligibility, "set", [a, true]);
    }
  }

  const out: RoundsDeployment = {
    chainId: id, operator, rig, usdc, oracle, eligibility, mine, fragments, vault, feeFunder, weth, pools, ponsLocker, ponsFactory, uniswapV3Factory, stocks, symbols: syms,
    genesis, roundSeconds, claimSeconds, block: Number(await pub.getBlockNumber()), params, paramsHash: roundParamsHash(params),
  };
  const p = join(DEPLOYMENTS, `${id}-rounds.json`);
  writeFileSync(p, JSON.stringify(out, null, 2) + "\n");
  console.log(`[rounds] wrote ${p}`);
}

const isMain = process.argv[1] && /deploy-rounds\.(ts|js)$/.test(process.argv[1]);
if (isMain) main().catch((e: Error) => { console.error("[rounds] failed:", e.message); process.exit(1); });
