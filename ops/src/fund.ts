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
import { clients, erc20Abi, hasFlag, loadDeployment, mineAbi, PHASES, stockAbi, vaultAbi } from "./lib/season.js";

async function main() {
  const dep = loadDeployment();
  const { pub, wallet, account } = clients("OPERATOR_KEY");
  const season = JSON.parse(readFileSync(dep.seasonFile!.startsWith("/") ? dep.seasonFile! : join(REPO_ROOT, "contracts", dep.seasonFile!), "utf8"));
  const pool: bigint[] = season.params.poolTokens.map(BigInt);
  const reserve = BigInt(season.usdcReserve ?? "0");
  const dry = hasFlag("--dry-run");

  const funded = (await pub.readContract({ abi: vaultAbi, address: dep.vault, functionName: "funded" })) as boolean;
  if (funded) {
    console.log("[fund] vault already funded");
    return;
  }
  async function tx(address: Address, abi: typeof erc20Abi, fn: string, args: unknown[]) {
    if (dry) return console.log(`[fund] would ${fn}(${args.map(String).join(", ")}) on ${address}`);
    const hash = await wallet.writeContract({ abi, address, functionName: fn, args });
    const r = await pub.waitForTransactionReceipt({ hash });
    if (r.status !== "success") throw new Error(`${fn} reverted`);
  }

  if (hasFlag("--mint-mocks")) {
    if (dep.chainId !== 31337) throw new Error("--mint-mocks is for Anvil only");
    for (let b = 0; b < 4; b++) {
      await tx(dep.stocks[b], stockAbi, "setAllowed", [dep.vault, true]);
      await tx(dep.stocks[b], stockAbi, "setAllowed", [account.address, true]);
      await tx(dep.stocks[b], stockAbi, "mint", [account.address, pool[b]]);
    }
    await tx(dep.usdc, erc20Abi, "mint", [account.address, reserve]);
  }

  for (let b = 0; b < 4; b++) {
    const bal = (await pub.readContract({ abi: erc20Abi, address: dep.stocks[b], functionName: "balanceOf", args: [account.address] })) as bigint;
    console.log(`[fund] stock ${b} ${dep.stocks[b]}: need ${formatUnits(pool[b], 18)}, have ${formatUnits(bal, 18)}`);
    if (bal < pool[b] && !dry) throw new Error(`insufficient stock ${b}`);
    await tx(dep.stocks[b], erc20Abi, "approve", [dep.vault, pool[b]]);
  }
  const ubal = (await pub.readContract({ abi: erc20Abi, address: dep.usdc, functionName: "balanceOf", args: [account.address] })) as bigint;
  console.log(`[fund] USDC reserve: need ${formatUnits(reserve, 6)}, have ${formatUnits(ubal, 6)}`);
  if (ubal < reserve && !dry) throw new Error("insufficient USDC");
  await tx(dep.usdc, erc20Abi, "approve", [dep.vault, reserve]);
  await tx(dep.vault, vaultAbi, "fund", [reserve]);

  const phase = (await pub.readContract({ abi: mineAbi, address: dep.mine, functionName: "phase" })) as number;
  console.log(`[fund] done; mine phase = ${PHASES[phase]}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
