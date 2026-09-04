/**
 * Parity: the TypeScript estimator (src/lib/mine-math.ts) must equal the contract's pending() and
 * eta() exactly on 1,000 fuzzed states. Runs against a local Anvil with a demo season; skipped when
 * anvil is not available.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPublicClient, createTestClient, createWalletClient, http, parseEther, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { seasonMineAbi, rigAbi } from "../../src/abi-node";
import { advance, eta, settle } from "../../src/lib/mine-math";
import { toConfig, toParams, toRigState } from "../../src/lib/season-model";
import { anvilPath, startAnvil, waitForRpc } from "../../e2e/helpers";

const RPC = "http://127.0.0.1:8545";
const haveAnvil = (() => { try { execSync(`${anvilPath()} --version`, { stdio: "ignore" }); return true; } catch { return false; } })();

describe.skipIf(!haveAnvil)("estimator parity with SeasonMine", () => {
  let anvil: ReturnType<typeof startAnvil>;
  let dep: { mine: Address; rig: Address; openTime: number };
  const pub = createPublicClient({ chain: foundry, transport: http(RPC) });
  const test = createTestClient({ chain: foundry, mode: "anvil", transport: http(RPC) });
  const keys = ["0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a", "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6"] as const;
  const wallets = keys.map((k) => createWalletClient({ account: privateKeyToAccount(k), chain: foundry, transport: http(RPC) }));

  beforeAll(async () => {
    anvil = startAnvil();
    await waitForRpc();
    execSync("pnpm --filter @stock-miner/ops deploy-demo", { cwd: join(__dirname, "..", "..", ".."), stdio: "ignore", env: { ...process.env, PACE_SECONDS: "3600", DEMO_HASH: "600000" } });
    dep = JSON.parse(readFileSync(join(__dirname, "..", "..", "..", "contracts", "deployments", "31337.json"), "utf8"));
    for (const w of wallets) {
      await w.writeContract({ address: dep.rig, abi: rigAbi, functionName: "approve", args: [dep.mine, 2n ** 255n] });
      await w.writeContract({ address: dep.mine, abi: seasonMineAbi, functionName: "activate", args: [0, parseEther(String(100_000 + Math.floor(Math.random() * 300_000)))] });
    }
    await test.setNextBlockTimestamp({ timestamp: BigInt(dep.openTime) + 1n });
    await test.mine({ blocks: 1 });
  });
  afterAll(() => anvil?.kill());

  async function snapshot() {
    const [raw, shift, work, lastX, total, closeX] = await Promise.all([
      pub.readContract({ address: dep.mine, abi: seasonMineAbi, functionName: "params" }),
      pub.readContract({ address: dep.mine, abi: seasonMineAbi, functionName: "shift" }),
      pub.readContract({ address: dep.mine, abi: seasonMineAbi, functionName: "workInShift" }),
      pub.readContract({ address: dep.mine, abi: seasonMineAbi, functionName: "lastX" }),
      pub.readContract({ address: dep.mine, abi: seasonMineAbi, functionName: "totalHash" }),
      pub.readContract({ address: dep.mine, abi: seasonMineAbi, functionName: "closeX" }),
    ]);
    const params = toParams(raw);
    const rate = await Promise.all([0, 1, 2, 3].map((b) => pub.readContract({ address: dep.mine, abi: seasonMineAbi, functionName: "ratePerWork", args: [b] }) as Promise<bigint>));
    const s = Number(shift);
    const shiftEndX: Record<number, bigint> = {};
    for (let k = 0; k < Math.min(s, 32); k++) shiftEndX[k] = (await pub.readContract({ address: dep.mine, abi: seasonMineAbi, functionName: "shiftEndX", args: [k] })) as bigint;
    const ocExpiring: Record<number, bigint> = {};
    for (let k = s; k <= Math.min(s + 2, 32); k++) ocExpiring[k] = (await pub.readContract({ address: dep.mine, abi: seasonMineAbi, functionName: "ocExpiring", args: [k] })) as bigint;
    return { config: toConfig(params, rate), global: { shift: s, workInShift: work as bigint, lastX: lastX as bigint, totalHash: total as bigint, closeX: closeX as bigint, ocExpiring, shiftEndX } };
  }

  it("pending() and eta() match on random states", async () => {
    let checks = 0;
    for (let round = 0; round < 40 && checks < 1000; round++) {
      // Random action by a random wallet, then a random time step; no poke, so the estimator must
      // discover boundaries itself.
      const w = wallets[round % wallets.length];
      const ids = (await pub.readContract({ address: dep.mine, abi: seasonMineAbi, functionName: "rigsOf", args: [w.account.address] })) as bigint[];
      const r = Math.random();
      try {
        if (r < 0.4) await w.writeContract({ address: dep.mine, abi: seasonMineAbi, functionName: "overclock", args: [ids[0]] });
        else if (r < 0.6) await w.writeContract({ address: dep.mine, abi: seasonMineAbi, functionName: "upgradeGpu", args: [ids[0]] });
        else if (r < 0.7) await w.writeContract({ address: dep.mine, abi: seasonMineAbi, functionName: "upgradeCooling", args: [ids[0]] });
      } catch { /* reverts (heat, tiers) are fine */ }
      await test.increaseTime({ seconds: 60 + Math.floor(Math.random() * 1200) });
      await test.mine({ blocks: 1 });
      const snap = await snapshot();
      const now = (await pub.getBlock()).timestamp;
      const closeX = snap.global.closeX;
      if (closeX !== 0n) break;
      const chainEta = (await pub.readContract({ address: dep.mine, abi: seasonMineAbi, functionName: "eta" })) as { toShiftEnd: bigint; toBlockFound: bigint; toClose: bigint; idle: boolean };
      const local = eta(snap.config, snap.global, now);
      expect(local.toShiftEnd).toBe(chainEta.toShiftEnd);
      expect(local.toBlockFound).toBe(chainEta.toBlockFound);
      expect(local.toClose).toBe(chainEta.toClose);
      checks++;
      for (const wl of wallets) {
        const rid = ((await pub.readContract({ address: dep.mine, abi: seasonMineAbi, functionName: "rigsOf", args: [wl.account.address] })) as bigint[])[0];
        const raw = await pub.readContract({ address: dep.mine, abi: seasonMineAbi, functionName: "rigs", args: [rid] });
        const { g } = advance(snap.config, snap.global, now);
        const st = settle(snap.config, toRigState(raw), g);
        for (let b = 0; b < 4; b++) {
          const chain = (await pub.readContract({ address: dep.mine, abi: seasonMineAbi, functionName: "pending", args: [rid, b] })) as bigint;
          expect(st.earned[b] / 10n ** 18n).toBe(chain);
          checks++;
        }
      }
    }
    expect(checks).toBeGreaterThan(200);
  });
});
