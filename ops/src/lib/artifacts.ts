import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Abi, Hex } from "viem";

const here = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(here, "..", "..", "..");
const OUT = join(REPO_ROOT, "contracts", "out");

export interface Artifact {
  abi: Abi;
  bytecode: Hex;
}

/** Load a Foundry artifact by source file and contract name, e.g. artifact("SeasonMine.sol", "SeasonMine"). */
export function artifact(file: string, name: string): Artifact {
  const p = join(OUT, file, `${name}.json`);
  const j = JSON.parse(readFileSync(p, "utf8"));
  return { abi: j.abi as Abi, bytecode: j.bytecode.object as Hex };
}
