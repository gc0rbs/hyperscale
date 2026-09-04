import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { createPublicClient, createTestClient, http, type Address } from "viem";
import { foundry } from "viem/chains";

export const RPC = "http://127.0.0.1:8545";
export const pub = createPublicClient({ chain: foundry, transport: http(RPC) });
export const test = createTestClient({ chain: foundry, mode: "anvil", transport: http(RPC) });

export async function warp(seconds: number) {
  await test.increaseTime({ seconds });
  await test.mine({ blocks: 1 });
}

export async function warpTo(ts: bigint) {
  const cur = (await pub.getBlock()).timestamp;
  if (ts <= cur) {
    await test.mine({ blocks: 1 });
    return;
  }
  await test.setNextBlockTimestamp({ timestamp: ts });
  await test.mine({ blocks: 1 });
}

export function anvilPath(): string {
  const home = process.env.HOME ?? "/root";
  for (const p of [`${home}/.foundry/bin/anvil`, "/usr/local/bin/anvil"]) if (existsSync(p)) return p;
  return "anvil";
}

export function startAnvil(): ChildProcess {
  const child = spawn(anvilPath(), ["--silent", "--port", "8545"], { stdio: "ignore" });
  return child;
}

export async function waitForRpc(timeoutMs = 20_000) {
  const t0 = Date.now();
  for (;;) {
    try {
      await pub.getChainId();
      return;
    } catch {
      if (Date.now() - t0 > timeoutMs) throw new Error("anvil did not start");
      await new Promise((r) => setTimeout(r, 250));
    }
  }
}

export const DEV: Address[] = [
  "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
];
