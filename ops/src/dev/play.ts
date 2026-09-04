/**
 * Dev-only players for Anvil dry runs (docs/RUNBOOK.md step 6). Drives the five Anvil accounts
 * through the season so the keeper and watcher have something to react to. Never used on a real chain.
 *
 *   pnpm --filter @stock-miner/ops play fund-players            # RIG + LP to accounts 0-4, allowlist
 *   pnpm --filter @stock-miner/ops play activate <acct> <rig>   # stake <rig> RIG from account <acct>
 *   pnpm --filter @stock-miner/ops play activate-lp <acct> <lp>
 *   pnpm --filter @stock-miner/ops play gpu <rigId> [n]  | cooling <rigId> [n] | oc <rigId>
 *   pnpm --filter @stock-miner/ops play claim <rigId> | exit <rigId> | withdraw <rigId> | emergency <rigId>
 *   pnpm --filter @stock-miner/ops play redeem <acct> <block> <fragments>
 *   pnpm --filter @stock-miner/ops play warp <seconds>          # anvil evm_increaseTime + mine
 *   pnpm --filter @stock-miner/ops play status
 */
import { createTestClient, createWalletClient, formatUnits, http, parseEther, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { ANVIL_KEYS, clients, eligibilityAbi, erc20Abi, fragmentsAbi, loadDeployment, mineAbi, PHASES, readState, rigAbi, stockAbi, vaultAbi } from "../lib/season.js";

const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const dep = loadDeployment();
const { pub } = clients();
const wallets = ANVIL_KEYS.map((k) => createWalletClient({ account: privateKeyToAccount(k), chain: foundry, transport: http(RPC) }));
const test = createTestClient({ chain: foundry, mode: "anvil", transport: http(RPC) });

async function send(w: number, address: Address, abi: typeof mineAbi, fn: string, args: unknown[] = []) {
  const hash = await wallets[w].writeContract({ abi, address, functionName: fn, args });
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`${fn} reverted`);
  return r;
}

function ownerOf(rigId: bigint): Promise<number> {
  return pub.readContract({ abi: mineAbi, address: dep.mine, functionName: "rigs", args: [rigId] }).then((r) => {
    const o = (r as { owner: Address }).owner.toLowerCase();
    const i = wallets.findIndex((w) => w.account.address.toLowerCase() === o);
    if (i < 0) throw new Error(`rig ${rigId} is not owned by an Anvil account`);
    return i;
  });
}

async function main() {
  const [cmd, a1, a2, a3] = process.argv.slice(2);
  if (dep.chainId !== 31337) throw new Error("play is for Anvil only");
  switch (cmd) {
    case "fund-players": {
      for (let i = 0; i < 5; i++) {
        const a = wallets[i].account.address;
        if (i > 0) await send(0, dep.rig, rigAbi, "transfer", [a, parseEther("2000000")]);
        await send(0, dep.lp, erc20Abi, "mint", [a, parseEther("200000")]);
        await send(0, dep.eligibility, eligibilityAbi, "set", [a, true]);
        for (const s of dep.stocks) await send(0, s, stockAbi, "setAllowed", [a, true]);
        await send(i, dep.rig, rigAbi, "approve", [dep.mine, 2n ** 255n]);
        await send(i, dep.lp, erc20Abi, "approve", [dep.mine, 2n ** 255n]);
      }
      console.log("[play] five accounts funded, allowlisted and approved");
      break;
    }
    case "activate":
    case "activate-lp": {
      const w = Number(a1);
      const asset = cmd === "activate" ? 0 : 1;
      const r = await send(w, dep.mine, mineAbi, "activate", [asset, parseEther(a2)]);
      const n = (await pub.readContract({ abi: mineAbi, address: dep.mine, functionName: "rigCount" })) as bigint;
      console.log(`[play] account ${w} activated rig ${n - 1n} with ${a2} ${asset === 0 ? "RIG" : "LP"} (gas ${r.gasUsed})`);
      break;
    }
    case "gpu":
    case "cooling":
    case "oc": {
      const id = BigInt(a1);
      const w = await ownerOf(id);
      const n = cmd === "oc" ? 1 : Number(a2 ?? "1");
      const fn = cmd === "gpu" ? "upgradeGpu" : cmd === "cooling" ? "upgradeCooling" : "overclock";
      for (let i = 0; i < n; i++) await send(w, dep.mine, mineAbi, fn, [id]);
      console.log(`[play] rig ${id}: ${fn} x${n}`);
      break;
    }
    case "claim":
    case "exit":
    case "withdraw":
    case "emergency": {
      const id = BigInt(a1);
      const w = await ownerOf(id);
      const fn = cmd === "claim" ? "claimAll" : cmd === "emergency" ? "emergencyWithdraw" : cmd;
      await send(w, dep.mine, mineAbi, fn, [id]);
      console.log(`[play] rig ${id}: ${fn}`);
      break;
    }
    case "redeem": {
      const w = Number(a1);
      const bal = (await pub.readContract({ abi: fragmentsAbi, address: dep.fragments, functionName: "balanceOf", args: [wallets[w].account.address, BigInt(a2)] })) as bigint;
      const amt = a3 ? BigInt(a3) : bal;
      await send(w, dep.vault, vaultAbi, "redeem", [BigInt(a2), amt]);
      const got = (await pub.readContract({ abi: erc20Abi, address: dep.stocks[Number(a2)], functionName: "balanceOf", args: [wallets[w].account.address] })) as bigint;
      console.log(`[play] account ${w} redeemed ${amt} fragments of block ${a2}; holds ${formatUnits(got, 18)} stock`);
      break;
    }
    case "warp": {
      await test.increaseTime({ seconds: Number(a1) });
      await test.mine({ blocks: 1 });
      const b = await pub.getBlock();
      console.log(`[play] warped ${a1}s; chain time ${new Date(Number(b.timestamp) * 1000).toISOString()}`);
      break;
    }
    case "status": {
      const s = await readState(dep.mine);
      const n = (await pub.readContract({ abi: mineAbi, address: dep.mine, functionName: "rigCount" })) as bigint;
      console.log(`[play] phase ${PHASES[s.phase]} shift ${s.shift} rigs ${n} totalHash ${formatUnits(s.totalHash, 18)} eta shift ${s.eta.toShiftEnd}s block ${s.eta.toBlockFound}s close ${s.eta.toClose}s idle=${s.eta.idle}`);
      for (let i = 0n; i < n; i++) {
        const r = (await pub.readContract({ abi: mineAbi, address: dep.mine, functionName: "rigs", args: [i] })) as { owner: Address; inactive: boolean; gpuTier: number; coolingTier: number; heat: number; activeOc: number };
        const pend = await Promise.all([0, 1, 2, 3].map((b) => pub.readContract({ abi: mineAbi, address: dep.mine, functionName: "pending", args: [i, b] }) as Promise<bigint>));
        console.log(`  rig ${i} ${r.owner.slice(0, 8)} gpu${r.gpuTier} cool${r.coolingTier} heat${r.heat} oc${r.activeOc}${r.inactive ? " INACTIVE" : ""} pending ${pend.join("/")}`);
      }
      break;
    }
    default:
      console.error("usage: play fund-players | activate <acct> <rig> | activate-lp <acct> <lp> | gpu|cooling <rigId> [n] | oc <rigId> | claim|exit|withdraw|emergency <rigId> | redeem <acct> <block> [fragments] | warp <seconds> | status");
      process.exit(2);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
