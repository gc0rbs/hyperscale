/**
 * Season planner (docs/04 §5.2, docs/RUNBOOK.md step 2). Turns a params template plus a chain profile
 * into the resolved season JSON that `CreateSeason.s.sol` deploys from:
 *
 *   pnpm --filter @stock-miner/ops plan --chain anvil --name season-1 \
 *        --expected-hash 10000000 --planned-seconds 86400 --open-time +176400 \
 *        [--params ../specs/params/season-default.json] [--rig-per-lp 2] [--lp-bonus-bps 12500] \
 *        [--treasury 0x…] [--usdc-reserve 50000] [--samples 24] [--allow-spot]
 *
 * - lpWeightPerToken = rigPerLp × lpBonusBps / 1e4, where rigPerLp is the RIG-equivalent value of one
 *   LP token sampled hourly over the last 24 h from the pair's reserves (Uniswap v2 shape), or given
 *   with --rig-per-lp when there is no pair (Anvil mocks) or no archive node (--allow-spot uses the
 *   latest block only, and says so).
 * - difficulty = expectedTotalHash × plannedSeconds split by diffShareBps, rounded to shifts.
 * - maxDurationSeconds = max(14 days, 30 × plannedSeconds).
 * The result is validated against the factory rules before it is written, and its keccak256 hash of
 * abi.encode(SeasonParams) is printed so it can be published before openTime (docs/08 §4).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createPublicClient, encodeAbiParameters, http, keccak256, parseAbi, parseUnits, type Address } from "viem";
import { REPO_ROOT } from "./lib/artifacts.js";
import { arg, hasFlag, loadChainProfile, loadFactoryDeployment, viemChain, type ChainProfile } from "./lib/season.js";
import { validateSeasonParams, type SeasonParamsJson } from "./lib/validate.js";
import { sizeDifficulty } from "./sizing.js";

const WAD = 10n ** 18n;
const ZERO = "0x0000000000000000000000000000000000000000" as Address;

const pairAbi = parseAbi([
  "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  "function token0() view returns (address)",
  "function totalSupply() view returns (uint256)",
]);

interface Sample { block: bigint; timestamp: bigint; rigPerLp: number }

async function sampleRigPerLp(chain: ChainProfile, pair: Address, rig: Address, samples: number, allowSpot: boolean) {
  const pub = createPublicClient({ chain: viemChain(chain.chainId, chain.rpcUrl), transport: http(chain.rpcUrl) });
  const latest = await pub.getBlock();
  const back = latest.number > 1000n ? latest.number - 1000n : 0n;
  const older = await pub.getBlock({ blockNumber: back });
  const secPerBlock = Number(latest.timestamp - older.timestamp) / Number(latest.number - back || 1n);
  const out: Sample[] = [];
  for (let k = 0; k < samples; k++) {
    const bn = latest.number - BigInt(Math.floor((k * 86_400) / samples / Math.max(secPerBlock, 0.001)));
    if (bn < 0n) break;
    try {
      const [r, t0, ts] = await Promise.all([
        pub.readContract({ abi: pairAbi, address: pair, functionName: "getReserves", blockNumber: bn }),
        pub.readContract({ abi: pairAbi, address: pair, functionName: "token0", blockNumber: bn }),
        pub.readContract({ abi: pairAbi, address: pair, functionName: "totalSupply", blockNumber: bn }),
      ]);
      const rigReserve = t0.toLowerCase() === rig.toLowerCase() ? r[0] : r[1];
      const rigPerLp = Number((2n * rigReserve * WAD) / ts) / 1e18;
      out.push({ block: bn, timestamp: (await pub.getBlock({ blockNumber: bn })).timestamp, rigPerLp });
    } catch (e) {
      if (k === 0) throw new Error(`cannot read pair ${pair} at latest block: ${(e as Error).message}`);
      if (!allowSpot) throw new Error(`archive read at block ${bn} failed (${(e as Error).message}); pass --allow-spot to use the latest block only, or --rig-per-lp`);
      break;
    }
  }
  const twap = out.reduce((a, s) => a + s.rigPerLp, 0) / out.length;
  return { twap, samples: out, secPerBlock };
}

function seasonParamsAbi() {
  return [{
    type: "tuple",
    components: [
      { name: "rig", type: "address" }, { name: "lpToken", type: "address" }, { name: "lpWeightPerToken", type: "uint256" },
      { name: "openTime", type: "uint64" }, { name: "maxDurationSeconds", type: "uint32" }, { name: "blocks", type: "uint8" },
      { name: "shiftsPerBlock", type: "uint8" }, { name: "stocks", type: "address[]" }, { name: "poolTokens", type: "uint256[]" },
      { name: "difficulty", type: "uint256[]" }, { name: "fragPerToken", type: "uint256" }, { name: "minStakeWeight", type: "uint256" },
      { name: "activationFeeBps", type: "uint16" }, { name: "earlyExitFeeBps", type: "uint16" }, { name: "gpuMultBps", type: "uint16[6]" },
      { name: "gpuCostBps", type: "uint16[5]" }, { name: "coolCostBps", type: "uint16[3]" }, { name: "heatPerOc", type: "uint8[4]" },
      { name: "coolPerShift", type: "uint8[4]" }, { name: "heatMax", type: "uint8" }, { name: "ocCostBps", type: "uint16" },
      { name: "ocBoostBps", type: "uint16" }, { name: "maxActiveOc", type: "uint8" }, { name: "ocShiftSpan", type: "uint8" },
      { name: "redemptionDays", type: "uint32" }, { name: "cashOutFeeBps", type: "uint16" }, { name: "pauseGraceSeconds", type: "uint32" },
      { name: "treasury", type: "address" },
    ],
  }] as const;
}

/** keccak256(abi.encode(SeasonParams)) exactly as `SeasonFactory.create` emits it. */
export function paramsHash(p: SeasonParamsJson) {
  const encoded = encodeAbiParameters(seasonParamsAbi(), [{
    rig: p.rig as Address, lpToken: p.lpToken as Address, lpWeightPerToken: BigInt(p.lpWeightPerToken),
    openTime: BigInt(p.openTime), maxDurationSeconds: p.maxDurationSeconds, blocks: p.blocks, shiftsPerBlock: p.shiftsPerBlock,
    stocks: p.stocks as Address[], poolTokens: p.poolTokens.map(BigInt), difficulty: p.difficulty.map(BigInt),
    fragPerToken: BigInt(p.fragPerToken), minStakeWeight: BigInt(p.minStakeWeight),
    activationFeeBps: p.activationFeeBps, earlyExitFeeBps: p.earlyExitFeeBps,
    gpuMultBps: p.gpuMultBps as [number, number, number, number, number, number],
    gpuCostBps: p.gpuCostBps as [number, number, number, number, number],
    coolCostBps: p.coolCostBps as [number, number, number],
    heatPerOc: p.heatPerOc as [number, number, number, number], coolPerShift: p.coolPerShift as [number, number, number, number],
    heatMax: p.heatMax, ocCostBps: p.ocCostBps, ocBoostBps: p.ocBoostBps, maxActiveOc: p.maxActiveOc, ocShiftSpan: p.ocShiftSpan,
    redemptionDays: p.redemptionDays, cashOutFeeBps: p.cashOutFeeBps, pauseGraceSeconds: p.pauseGraceSeconds, treasury: p.treasury as Address,
  }]);
  return keccak256(encoded);
}

export async function plan() {
  const chainName = arg("--chain", "anvil")!;
  const name = arg("--name", `${chainName}-season`)!;
  const paramsPath = arg("--params", join(REPO_ROOT, "specs", "params", "season-default.json"))!;
  const expectedHash = BigInt(arg("--expected-hash")!.replace(/_/g, ""));
  const plannedSeconds = BigInt(arg("--planned-seconds")!);
  const openArg = arg("--open-time", "+176400")!;
  const lpBonusArg = arg("--lp-bonus-bps");
  const samples = Number(arg("--samples", "24"));
  const chain = loadChainProfile(chainName);
  const tpl = JSON.parse(readFileSync(paramsPath, "utf8"));
  const now = Math.floor(Date.now() / 1000);
  const openTime = openArg.startsWith("+") ? now + Number(openArg.slice(1)) : Number(openArg);

  // addresses: profile, or the factory deployment's mocks on Anvil
  const fac = chain.mocks ? loadFactoryDeployment(chain.chainId) : undefined;
  const rig = (chain.rig ?? fac?.rig ?? ZERO) as Address;
  const lpToken = (chain.lpToken ?? fac?.lp ?? ZERO) as Address;
  const usdc = (chain.usdc ?? fac?.usdc ?? ZERO) as Address;
  const oracle = (chain.oracle ?? fac?.oracle ?? ZERO) as Address;
  const eligibility = (chain.eligibility ?? fac?.eligibility ?? ZERO) as Address;
  const treasury = (arg("--treasury") ?? chain.treasury ?? fac?.deployer ?? ZERO) as Address;
  const stockSyms: string[] = tpl.stocks.map((s: { symbol: string }) => s.symbol);
  const stocks: Address[] = stockSyms.map((sym, i) => (chain.stocks?.[sym] ?? fac?.stocks?.[i] ?? ZERO) as Address);

  // LP weight
  const bonus = lpBonusArg !== undefined ? Number(lpBonusArg) : Number(tpl.lpBonusBps ?? 12_500);
  let rigPerLp: number;
  let lpSamples: Sample[] = [];
  let lpSource: string;
  const lpDisabled = lpToken === ZERO || bonus === 0;
  if (lpDisabled) {
    rigPerLp = 0;
    lpSource = "LP staking disabled";
  } else if (arg("--rig-per-lp")) {
    rigPerLp = Number(arg("--rig-per-lp"));
    lpSource = "--rig-per-lp";
  } else {
    const s = await sampleRigPerLp(chain, lpToken, rig, samples, hasFlag("--allow-spot"));
    rigPerLp = s.twap;
    lpSamples = s.samples;
    lpSource = `${s.samples.length} hourly samples over ${(s.samples.length / samples) * 24}h (≈${s.secPerBlock.toFixed(2)} s/block)`;
  }
  const lpWeightPerToken = lpDisabled ? 0n : (parseUnits(rigPerLp.toFixed(18), 18) * BigInt(bonus)) / 10_000n;

  // difficulty
  const sizing = sizeDifficulty({
    expectedTotalHash: expectedHash * WAD,
    plannedSeconds,
    diffShareBps: tpl.sizing.diffShareBps,
    shiftsPerBlock: tpl.shiftsPerBlock,
  });

  const params: SeasonParamsJson = {
    rig,
    lpToken: lpDisabled ? ZERO : lpToken,
    lpWeightPerToken: lpWeightPerToken.toString(),
    openTime,
    maxDurationSeconds: Number(sizing.maxDurationSeconds),
    blocks: tpl.blocks,
    shiftsPerBlock: tpl.shiftsPerBlock,
    stocks,
    poolTokens: tpl.stocks.map((s: { poolTokens: string }) => parseUnits(String(s.poolTokens), 18).toString()),
    difficulty: sizing.difficulty.map(String),
    fragPerToken: String(tpl.fragPerToken),
    minStakeWeight: parseUnits(String(tpl.minStakeWeight), 18).toString(),
    activationFeeBps: tpl.activationFeeBps,
    earlyExitFeeBps: tpl.earlyExitFeeBps,
    gpuMultBps: tpl.gpuMultBps,
    gpuCostBps: tpl.gpuCostBps,
    coolCostBps: tpl.coolCostBps,
    heatPerOc: tpl.heatPerOc,
    coolPerShift: tpl.coolPerShift,
    heatMax: tpl.heatMax,
    ocCostBps: tpl.ocCostBps,
    ocBoostBps: tpl.ocBoostBps,
    maxActiveOc: tpl.maxActiveOc,
    ocShiftSpan: tpl.ocShiftSpan ?? 1,
    redemptionDays: tpl.redemptionDays,
    cashOutFeeBps: tpl.cashOutFeeBps,
    pauseGraceSeconds: tpl.pauseGraceSeconds,
    treasury,
  };

  const problems = validateSeasonParams(params, now);
  const usdcReserve = parseUnits(arg("--usdc-reserve", "50000")!, 6).toString();
  const hash = paramsHash(params);
  const out = {
    name,
    chain: chain.name,
    chainId: chain.chainId,
    createdAt: new Date(now * 1000).toISOString(),
    paramsTemplate: paramsPath,
    params,
    eligibility,
    oracle,
    usdc,
    transfersEnabled: Boolean(tpl.transfersEnabled),
    usdcReserve,
    paramsHash: hash,
    plan: {
      expectedTotalHash: expectedHash.toString(),
      plannedSeconds: plannedSeconds.toString(),
      difficultyTotal: sizing.difficultyTotal.toString(),
      lpBonusBps: bonus,
      rigPerLp,
      lpSource,
      lpSamples: lpSamples.map((s) => ({ block: s.block.toString(), timestamp: s.timestamp.toString(), rigPerLp: s.rigPerLp })),
      openTimeIso: new Date(openTime * 1000).toISOString(),
      failSafeIso: new Date((openTime + Number(sizing.maxDurationSeconds)) * 1000).toISOString(),
      problems,
    },
  };
  const dir = join(REPO_ROOT, "ops", "seasons");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${name}.json`);
  writeFileSync(file, JSON.stringify(out, null, 2) + "\n");

  console.log(`season file: ${file}`);
  console.log(`chain ${chain.name} (${chain.chainId})  openTime ${openTime} (${out.plan.openTimeIso})  fail-safe ${out.plan.failSafeIso}`);
  console.log(`difficulty ${sizing.difficulty.map((d) => (d / WAD).toString()).join(" / ")} hash-seconds (total ${sizing.difficultyTotal / WAD})`);
  console.log(`planned ${plannedSeconds}s at ${expectedHash} RIG-eq; 0.5x-4x hash => ${Number(plannedSeconds) / 4}s-${Number(plannedSeconds) * 2}s`);
  console.log(`lpWeightPerToken ${lpWeightPerToken} (${lpSource}; rigPerLp ${rigPerLp}, bonus ${bonus} bps)`);
  console.log(`paramsHash ${hash}`);
  if (problems.length) {
    console.error(`INVALID for the factory: ${problems.join("; ")}`);
    process.exitCode = 1;
  } else {
    console.log("factory rules: ok");
  }
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop()!);
if (isMain) plan().catch((e) => { console.error(e); process.exit(1); });
