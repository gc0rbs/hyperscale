/**
 * Fund the vault (docs/RUNBOOK.md step 4): pulls every block's Stock Token pool and the USDC reserve
 * from the operator (the account that ran CreateSeason). The mine cannot leave `Funding` until this
 * has happened (FR-S5).
 *
 *   OPERATOR_KEY=0x… pnpm --filter @stock-miner/ops fund [--mint-mocks] [--dry-run]
 *
 * --mint-mocks (chain 31337 only): mint the pool amounts and USDC to the operator on the mock tokens
 *   and allowlist the vault and operator on each mock Stock Token, so a dry run needs nothing else.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { formatUnits, type Address } from "viem";
import { REPO_ROOT } from "./lib/artifacts.js";
import { arg, clients, erc20Abi, hasFlag, loadDeployment, mineAbi, PHASES, stockAbi, vaultAbi, type Deployment } from "./lib/season.js";
import { parseUnits } from "viem";

/** Pool amounts from the season file when the artifact names one, else from the mine; reserve from the file or --usdc-reserve. */
export function resolveFunding(dep: Pick<Deployment, "seasonFile">, reserveArg: string | undefined, fromChain: () => Promise<bigint[]>): { pool: Promise<bigint[]>; reserve: bigint } {
  if (dep.seasonFile) {
    const path = dep.seasonFile.startsWith("/") ? dep.seasonFile : join(REPO_ROOT, "contracts", dep.seasonFile);
    const season = JSON.parse(readFileSync(path, "utf8"));
    return { pool: Promise.resolve(season.params.poolTokens.map(BigInt)), reserve: reserveArg ? parseUnits(reserveArg, 6) : BigInt(season.usdcReserve ?? "0") };
  }
  if (!reserveArg) throw new Error("deployment has no seasonFile (deploy-demo artifact): pass --usdc-reserve <USDG amount>");
  return { pool: fromChain(), reserve: parseUnits(reserveArg, 6) };
}

async function main() {
  const dep = loadDeployment();
  const { pub, wallet, account } = clients("OPERATOR_KEY");
  const dry = hasFlag("--dry-run");

  const funded = (await pub.readContract({ abi: vaultAbi, address: dep.vault, functionName: "funded" })) as boolean;
  if (funded) {
    console.log("[fund] vault already funded");
    return;
  }
  // Audit B12: a deploy-demo artifact has no seasonFile; read the pool from the mine and take the
  // reserve from --usdc-reserve instead of crashing on the missing field.
  const { pool, reserve } = resolveFunding(dep, arg("--usdc-reserve"), async () => {
    const p = (await pub.readContract({ abi: mineAbi, address: dep.mine, functionName: "params" })) as { poolTokens: readonly bigint[] };
    return p.poolTokens.map(BigInt);
  });
  const poolAmounts = await pool;
  async function tx(address: Address, abi: typeof erc20Abi, fn: string, args: unknown[]) {
    if (dry) return console.log(`[fund] would ${fn}(${args.map(String).join(", ")}) on ${address}`);
    const hash = await wallet.writeContract({ abi, address, functionName: fn, args });
    const r = await pub.waitForTransactionReceipt({ hash });
    if (r.status !== "success") throw new Error(`${fn} reverted`);
  }

  if (hasFlag("--mint-mocks")) {
    if (dep.chainId !== 31337 && process.env.ALLOW_MOCK_MINT !== "1") throw new Error("--mint-mocks is for Anvil only (ALLOW_MOCK_MINT=1 on a testnet deployed with DEPLOY_MOCKS=true)");
    for (let b = 0; b < 4; b++) {
      await tx(dep.stocks[b], stockAbi, "setAllowed", [dep.vault, true]);
      await tx(dep.stocks[b], stockAbi, "setAllowed", [account.address, true]);
      await tx(dep.stocks[b], stockAbi, "mint", [account.address, poolAmounts[b]]);
    }
    await tx(dep.usdc, erc20Abi, "mint", [account.address, reserve]);
  }

  for (let b = 0; b < 4; b++) {
    const bal = (await pub.readContract({ abi: erc20Abi, address: dep.stocks[b], functionName: "balanceOf", args: [account.address] })) as bigint;
    console.log(`[fund] stock ${b} ${dep.stocks[b]}: need ${formatUnits(poolAmounts[b], 18)}, have ${formatUnits(bal, 18)}`);
    if (bal < poolAmounts[b] && !dry) throw new Error(`insufficient stock ${b}`);
    await tx(dep.stocks[b], erc20Abi, "approve", [dep.vault, poolAmounts[b]]);
  }
  const ubal = (await pub.readContract({ abi: erc20Abi, address: dep.usdc, functionName: "balanceOf", args: [account.address] })) as bigint;
  console.log(`[fund] USDC reserve: need ${formatUnits(reserve, 6)}, have ${formatUnits(ubal, 6)}`);
  if (ubal < reserve && !dry) throw new Error("insufficient USDC");
  await tx(dep.usdc, erc20Abi, "approve", [dep.vault, reserve]);
  await tx(dep.vault, vaultAbi, "fund", [reserve]);

  const phase = (await pub.readContract({ abi: mineAbi, address: dep.mine, functionName: "phase" })) as number;
  console.log(`[fund] done; mine phase = ${PHASES[phase]}`);
  if (!dry && phase === 0) throw new Error("vault funded but the mine is still in Funding; check the vault's funded() and the mine's vault address");
}

if (process.argv[1] && /fund\.(ts|js)$/.test(process.argv[1])) main().catch((e) => { console.error(e); process.exit(1); });
