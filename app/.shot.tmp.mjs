import { chromium } from "@playwright/test";
const out = "/tmp/claude-0/-home-user-hyperscale/4f2b47b0-f710-550f-92a5-ff9bfefe5014/scratchpad/";
try {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on("pageerror", (e) => console.log("pageerror:", e.message.slice(0, 200)));
  const r = await page.goto("https://www.hyperscaling.xyz/mine", { waitUntil: "load", timeout: 90000 });
  console.log("status", r.status());
  await page.waitForTimeout(6000);
  await page.screenshot({ path: out + "live-mine.png" });
  console.log((await page.textContent("body")).replace(/\s+/g, " ").slice(0, 500));
  await browser.close();
} catch (e) { console.log("ERR", e.message.slice(0, 300)); }
