import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Abi, Hex } from "viem";

const here = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(here, "..", "..", "..");
const OUT = join(REPO_ROOT, "contracts", "out");
// Committed ABI copies (synced from forge by `pnpm sync-abi`). Used when contracts/out is absent, e.g.
// the CI `ts` job and the app image, which never run forge. ABI only; no bytecode.
const APP_ABI = join(REPO_ROOT, "app", "src", "abi");

export interface Artifact {
  abi: Abi;
  bytecode: Hex;
}

/** Load a Foundry artifact by source file and contract name, e.g. artifact("SeasonMine.sol", "SeasonMine"). */
export function artifact(file: string, name: string): Artifact {
  const p = join(OUT, file, `${name}.json`);
  if (existsSync(p)) {
    const j = JSON.parse(readFileSync(p, "utf8"));
    return { abi: j.abi as Abi, bytecode: j.bytecode.object as Hex };
  }
  const fallback = join(APP_ABI, `${name}.json`);
  if (!existsSync(fallback)) throw new Error(`no artifact for ${name}: run forge build (${p}) or pnpm sync-abi (${fallback})`);
  const raw = JSON.parse(readFileSync(fallback, "utf8"));
  return { abi: (Array.isArray(raw) ? raw : raw.abi) as Abi, bytecode: "0x" };
}
