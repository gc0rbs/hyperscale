import { execSync } from "node:child_process";
import { join } from "node:path";
import { startAnvil, waitForRpc } from "./helpers";

/** Starts Anvil and deploys a fast demo season (pace from E2E_PACE, default 600 s). */
export default async function globalSetup() {
  const anvil = startAnvil();
  await waitForRpc();
  const root = join(__dirname, "..", "..");
  execSync("pnpm --filter @stock-miner/ops deploy-demo", {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, PACE_SECONDS: process.env.E2E_PACE ?? "600", DEMO_HASH: "500000", OPEN_DELAY: "600" },
  });
  return async () => {
    anvil.kill();
  };
}
