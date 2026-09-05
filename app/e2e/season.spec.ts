import { expect, test as base, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createPublicClient, createWalletClient, http, parseAbi, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { warpTo, warp, DEV } from "./helpers";

const dep = JSON.parse(readFileSync(join(__dirname, "..", "..", "contracts", "deployments", "31337.json"), "utf8"));
const pub = createPublicClient({ chain: foundry, transport: http("http://127.0.0.1:8545") });
const mineAbi = parseAbi([
  "function phase() view returns (uint8)",
  "function shift() view returns (uint16)",
  "function closeX() view returns (uint256)",
  "function eta() view returns ((uint256 toShiftEnd,uint256 toBlockFound,uint256 toClose,bool idle))",
  "function progress() view returns ((uint8 blockIdx,uint16 shift,uint256 workInShift,uint256 shiftDifficulty,uint256 workRemainingInBlock,uint256 workRemainingInSeason,uint256 closeX))",
  "function pending(uint256,uint8) view returns (uint256)",
  "function rigsOf(address) view returns (uint256[])",
  "function poke()",
  "function pause()",
  "function unpause()",
  "function paused() view returns (bool)",
]);
// deploy-demo makes the deployer (Anvil account 0) the treasury, which is the guardian.
const guardian = createWalletClient({ chain: foundry, transport: http("http://127.0.0.1:8545"), account: privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80") });
const fragAbi = parseAbi(["function balanceOf(address,uint256) view returns (uint256)"]);

const test = base;

async function connectDev(page: Page, index: number) {
  const sel = page.getByTestId("dev-account");
  const connect = page.getByTestId("connect-dev");
  await expect(sel.or(connect)).toBeVisible({ timeout: 20_000 });
  if (await connect.isVisible()) await connect.click();
  await expect(sel).toBeVisible({ timeout: 20_000 });
  await sel.selectOption(String(index));
}

/** Warp until block `block` is found, using the simulated progress() view (stored state is stale without a poke). */
async function pokeUntilFound(block: number) {
  for (let i = 0; i < 40; i++) {
    const pr = await pub.readContract({ address: dep.mine, abi: mineAbi, functionName: "progress" });
    if (pr.closeX !== 0n || pr.blockIdx > block) return;
    const e = await pub.readContract({ address: dep.mine, abi: mineAbi, functionName: "eta" });
    if (e.idle) throw new Error("mine idle");
    await warp(Number(e.toBlockFound) + 1);
  }
}

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (e) => console.log("[pageerror]", e.message));
  page.on("console", (m) => { if (m.type() === "error") console.log("[console.error]", m.text().slice(0, 300)); });
});

test("pre-open: activate a rig and buy a GPU tier", async ({ page }) => {
  await page.goto("/mine");
  await connectDev(page, 1);
  await expect(page.getByTestId("season-status")).toContainText("Pre-open");
  await page.goto("/mine/new");
  await connectDev(page, 1);
  await page.getByTestId("amount").fill("200000");
  const submit = page.getByTestId("activate-submit");
  await expect(submit).toBeEnabled();
  await submit.click(); // approve
  await expect(submit).toHaveText(/Activate rig/, { timeout: 30_000 });
  await submit.click(); // activate
  await page.waitForURL("**/mine", { timeout: 30_000 });
  await connectDev(page, 1);
  const rigs = await pub.readContract({ address: dep.mine, abi: mineAbi, functionName: "rigsOf", args: [DEV[1]] });
  expect(rigs.length).toBe(1);
  await expect(page.getByTestId(`rig-${rigs[0]}`)).toBeVisible({ timeout: 20_000 });
  await page.getByTestId(`rig-${rigs[0]}`).getByRole("button", { name: /GPU 1/ }).click();
  await expect(page.getByTestId("purchase-sheet")).toBeVisible();
  await page.getByTestId("purchase-sheet").getByRole("button", { name: /Confirm burn/ }).click();
  await expect(page.getByTestId("purchase-sheet")).toBeHidden({ timeout: 30_000 });
});

/** Audit B7: a transaction that fails must show a plain-language error and release the control. */
test("paused: a failed purchase shows an error and the sheet recovers", async ({ page }) => {
  await guardian.writeContract({ address: dep.mine, abi: mineAbi, functionName: "pause" });
  expect(await pub.readContract({ address: dep.mine, abi: mineAbi, functionName: "paused" })).toBe(true);
  await page.goto("/mine");
  await connectDev(page, 1);
  const rigs = await pub.readContract({ address: dep.mine, abi: mineAbi, functionName: "rigsOf", args: [DEV[1]] });
  await expect(page.getByTestId(`rig-${rigs[0]}`)).toBeVisible({ timeout: 20_000 });
  await page.getByTestId(`rig-${rigs[0]}`).getByRole("button", { name: /GPU 2/ }).click();
  const sheet = page.getByTestId("purchase-sheet");
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: /Confirm burn/ }).click();
  await expect(sheet.getByTestId("tx-error")).toContainText(/paused/i, { timeout: 30_000 });
  await expect(sheet.getByRole("button", { name: /Confirm burn/ })).toBeEnabled();
  await sheet.getByRole("button", { name: /Cancel/ }).click();
  await guardian.writeContract({ address: dep.mine, abi: mineAbi, functionName: "unpause" });
  expect(await pub.readContract({ address: dep.mine, abi: mineAbi, functionName: "paused" })).toBe(false);
});

test("open: overclock, block found, claim, close, withdraw, redeem", async ({ page }) => {
  await warpTo(BigInt(dep.openTime) + 1n);
  await page.goto("/mine");
  await connectDev(page, 1);
  await expect(page.getByText(/Mine open/)).toBeVisible();
  await expect(page.getByTestId("block-card")).toBeVisible();
  const rigs = await pub.readContract({ address: dep.mine, abi: mineAbi, functionName: "rigsOf", args: [DEV[1]] });
  const rig = page.getByTestId(`rig-${rigs[0]}`);
  await rig.getByRole("button", { name: /Overclock/ }).click();
  await page.getByTestId("purchase-sheet").getByRole("button", { name: /Confirm burn/ }).click();
  await expect(page.getByTestId("purchase-sheet")).toBeHidden({ timeout: 30_000 });
  await expect(rig.getByText("1 / 3")).toBeVisible({ timeout: 15_000 });

  // Block 1 found: claim it.
  await pokeUntilFound(0);
  await page.goto("/claim");
  await connectDev(page, 1);
  const claimBtn = page.getByTestId(`claim-all-${rigs[0]}`);
  await expect(claimBtn).toBeEnabled({ timeout: 15_000 });
  await claimBtn.click();
  await expect.poll(async () => pub.readContract({ address: dep.fragments as Address, abi: fragAbi, functionName: "balanceOf", args: [DEV[1], 0n] }), { timeout: 30_000 }).toBeGreaterThan(0n);
  await expect(claimBtn).toBeDisabled({ timeout: 30_000 });
  const chainPending = await pub.readContract({ address: dep.mine, abi: mineAbi, functionName: "pending", args: [rigs[0], 0] });
  expect(chainPending).toBe(0n);

  // Run to close: withdraw and redeem.
  await pokeUntilFound(3);
  const pr = await pub.readContract({ address: dep.mine, abi: mineAbi, functionName: "progress" });
  expect(pr.closeX).not.toBe(0n);
  await page.goto("/claim");
  await connectDev(page, 1);
  const withdraw = page.getByTestId(`withdraw-${rigs[0]}`);
  await expect(withdraw).toBeVisible({ timeout: 15_000 });
  const finalClaim = page.getByTestId(`claim-all-${rigs[0]}`);
  await expect(finalClaim).toBeEnabled({ timeout: 20_000 });
  await finalClaim.click();
  await expect(finalClaim).toBeDisabled({ timeout: 30_000 });
  for (let b = 1; b < 4; b++) {
    await expect.poll(async () => pub.readContract({ address: dep.fragments as Address, abi: fragAbi, functionName: "balanceOf", args: [DEV[1], BigInt(b)] }), { timeout: 30_000 }).toBeGreaterThan(0n);
  }
  await withdraw.click();
  await expect(withdraw).toBeHidden({ timeout: 30_000 });
  await page.goto("/redeem");
  await connectDev(page, 1);
  await expect(page.getByTestId("eligibility")).toContainText("Eligible");
  const bal3 = await pub.readContract({ address: dep.fragments as Address, abi: fragAbi, functionName: "balanceOf", args: [DEV[1], 3n] });
  if (bal3 >= 1_000_000n) {
    await page.getByTestId("redeem-row-3").getByRole("button", { name: "Redeem" }).click();
    await expect(page.getByTestId("redeem-row-3")).toContainText(/fragments/, { timeout: 30_000 });
  }
  // UI claimed balances equal on-chain balances (they are read from chain).
  for (let b = 0; b < 4; b++) {
    const bal = await pub.readContract({ address: dep.fragments as Address, abi: fragAbi, functionName: "balanceOf", args: [DEV[1], BigInt(b)] });
    await expect(page.getByTestId(`redeem-row-${b}`)).toContainText(bal.toLocaleString("en-US"));
  }
});
