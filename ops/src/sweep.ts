/**
 * Post-season sweep (docs/04 §6, docs/RUNBOOK.md step 8): after closeX + redemptionDays, or after a
 * cancellation, move the vault's remaining Stock Tokens and USDC to the treasury. Permissionless and
 * repeatable; a Stock Token whose hook refuses the treasury stays and is retried next call.
 *
 *   OPERATOR_KEY=0x… pnpm --filter @stock-miner/ops sweep [--dry-run]
 */
import { formatUnits } from "viem";
import { clients, erc20Abi, hasFlag, loadDeployment, mineAbi, PHASES, vaultAbi } from "./lib/season.js";

async function main() {
  const dep = loadDeployment();
  const { pub, wallet } = clients("OPERATOR_KEY");
  const phase = (await pub.readContract({ abi: mineAbi, address: dep.mine, functionName: "phase" })) as number;
  const end = (await pub.readContract({ abi: vaultAbi, address: dep.vault, functionName: "redemptionEnd" })) as bigint;
  const now = (await pub.getBlock()).timestamp;
  console.log(`[sweep] phase ${PHASES[phase]}; redemption ends ${end === 0n ? "n/a" : new Date(Number(end) * 1000).toISOString()}; now ${new Date(Number(now) * 1000).toISOString()}`);
  const cancelled = phase === 4;
  if (!cancelled && (end === 0n || now <= end)) {
    console.log("[sweep] window still open; nothing to do");
    return;
  }
  const before = await balances();
  if (hasFlag("--dry-run")) {
    console.log("[sweep] would sweep", before);
    return;
  }
  const hash = await wallet.writeContract({ abi: vaultAbi, address: dep.vault, functionName: "sweep" });
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error("sweep reverted");
  const after = await balances();
  for (let b = 0; b < 4; b++) {
    const moved = before.stocks[b] - after.stocks[b];
    console.log(`[sweep] stock ${b}: moved ${formatUnits(moved, 18)}${after.stocks[b] > 0n ? ` (STILL HELD ${formatUnits(after.stocks[b], 18)}: hook refused the treasury; allowlist it and re-run)` : ""}`);
  }
  console.log(`[sweep] USDC moved ${formatUnits(before.usdc - after.usdc, 6)}`);

  async function balances() {
    const stocks = await Promise.all(dep.stocks.map((s) => pub.readContract({ abi: erc20Abi, address: s, functionName: "balanceOf", args: [dep.vault] }) as Promise<bigint>));
    const usdc = (await pub.readContract({ abi: erc20Abi, address: dep.usdc, functionName: "balanceOf", args: [dep.vault] })) as bigint;
    return { stocks, usdc };
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
