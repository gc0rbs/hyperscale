import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createPublicClient, createWalletClient, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { artifact, REPO_ROOT } from "./artifacts.js";

export function loadDeployment(chainId = Number(process.env.CHAIN_ID ?? 31337)) {
  const p = join(REPO_ROOT, "contracts", "deployments", `${chainId}.json`);
  return JSON.parse(readFileSync(p, "utf8")) as { mine: Address; vault: Address; fragments: Address; rig: Address; openTime: number };
}

export function clients() {
  const rpc = process.env.RPC_URL ?? "http://127.0.0.1:8545";
  const key = (process.env.KEEPER_KEY ?? "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d") as Hex;
  const account = privateKeyToAccount(key);
  const pub = createPublicClient({ chain: foundry, transport: http(rpc) });
  const wallet = createWalletClient({ account, chain: foundry, transport: http(rpc) });
  return { pub, wallet, account };
}

export const mineAbi = artifact("SeasonMine.sol", "SeasonMine").abi;
export const vaultAbi = artifact("RedemptionVault.sol", "RedemptionVault").abi;

export interface Eta { toShiftEnd: bigint; toBlockFound: bigint; toClose: bigint; idle: boolean }

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
