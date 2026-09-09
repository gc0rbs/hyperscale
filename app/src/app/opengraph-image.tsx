import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createPublicClient, http } from "viem";
import { getDeployment } from "@/lib/deployment";
import { roundMineAbi, seasonMineAbi, TICKERS } from "@/lib/contracts";
import { BRAND, TAGLINE } from "@/lib/brand";

/**
 * Share card (design brief §2: tick bar as the signature device), in the Hyperscaler palette.
 * Rendered on request from the live state, so a link pasted mid-round shows the round that is
 * running; falls back to the static card when there is no deployment or the RPC does not answer
 * within 1.5 s.
 */
export const runtime = "nodejs";
export const alt = `${BRAND}: ${TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BG = "#141618";
const FG = "#F5F7F5";
const MUTED = "#A4ACA6";
const LINE = "#323834";
const SIGNAL = "#53DB72";
const POWER = "#00C805";

interface Status { headline: string; sub: string; ticks: number; done: boolean }

async function readLive(): Promise<Status | null> {
  const dep = getDeployment();
  if (!dep) return null;
  const client = createPublicClient({ transport: http(dep.rpcUrl, { timeout: 1500 }) });
  try {
    if (dep.kind === "rounds") {
      const read = (functionName: string) => client.readContract({ address: dep.mine, abi: roundMineAbi, functionName });
      const [launched, halted, current, end, params] = (await Promise.all([read("launched"), read("halted"), read("currentRound"), read("roundEnd"), read("params")])) as [boolean, boolean, bigint, bigint, { roundSeconds: number }];
      if (!launched) return { headline: "Not live yet", sub: `Deployed and waiting for $VRAM · ${TICKERS.join(" · ")}`, ticks: 0, done: false };
      if (halted) return { headline: "The game has stopped", sub: "Deposits and claimed shards are still yours.", ticks: 8, done: true };
      const now = Math.floor(Date.now() / 1000);
      const left = Math.max(0, Number(end) - now);
      const ticks = Math.min(8, Math.round(((Number(params.roundSeconds) - left) / Number(params.roundSeconds)) * 8));
      return { headline: `Round ${current} is running`, sub: `New pot every hour · closes in ${Math.floor(left / 60)} min · ${TICKERS.join(" · ")}`, ticks, done: false };
    }
    const read = (functionName: string) => client.readContract({ address: dep.mine, abi: seasonMineAbi, functionName });
    const [phase, shift, totalHash, closeX, params] = (await Promise.all([read("phase"), read("shift"), read("totalHash"), read("closeX"), read("params")])) as [number, number, bigint, bigint, { shiftsPerBlock: number; blocks: number }];
    const spb = Number(params.shiftsPerBlock);
    const closed = closeX !== 0n || Number(phase) === 3;
    const cur = Math.min(Math.floor(Number(shift) / spb), Number(params.blocks) - 1);
    const hash = Number(totalHash / 10n ** 15n) / 1000;
    if (Number(phase) === 1) return { headline: "The season opens soon", sub: `Stake, run rigs, earn ${TICKERS.join(" · ")}`, ticks: 0, done: false };
    if (closed) return { headline: "This season has closed", sub: "Redemption is open. Fragments become Stock Tokens.", ticks: 8, done: true };
    if (Number(phase) === 4) return { headline: "Season cancelled", sub: "Deposits are being returned.", ticks: 0, done: true };
    return { headline: `Block ${cur + 1} is mining · ${TICKERS[cur]}`, sub: `${hash.toFixed(1)}k total hash · shift ${Number(shift) + 1} of ${spb * Number(params.blocks)}`, ticks: Math.round(((Number(shift) % spb) / spb) * 8), done: false };
  } catch {
    return null;
  }
}

export default async function Image() {
  const [font, logo, live] = await Promise.all([
    readFile(join(process.cwd(), "src", "fonts", "humane", "Humane-Bold.ttf")),
    readFile(join(process.cwd(), "public", "brand", "hyperscaler-logo.png")).then((b) => `data:image/png;base64,${b.toString("base64")}`).catch(() => null),
    readLive(),
  ]);
  const s = live ?? { headline: "A new pot every hour.", sub: "Four stock-token rewards. Claim in fifteen minutes.", ticks: 0, done: false };
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", background: BG, color: FG, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "56px 64px", fontFamily: "Humane" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- next/og renders plain elements */}
            {logo ? <img src={logo} width={56} height={56} alt="" /> : <div style={{ width: 44, height: 44, background: POWER }} />}
            <div style={{ fontSize: 64, letterSpacing: 2, textTransform: "uppercase" }}>{BRAND}</div>
          </div>
          <div style={{ display: "flex", gap: 14 }}>
            {TICKERS.map((t) => <div key={t} style={{ fontSize: 40, color: MUTED, border: `2px solid ${LINE}`, padding: "2px 16px", textTransform: "uppercase" }}>{t}</div>)}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 200, lineHeight: 0.85, textTransform: "uppercase", color: s.done ? MUTED : FG }}>{s.headline}</div>
          <div style={{ fontSize: 54, color: s.done ? MUTED : SIGNAL, textTransform: "uppercase", letterSpacing: 1 }}>{s.sub}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} style={{ width: 118, height: 18, background: i < s.ticks ? POWER : LINE, borderRadius: 2, ...(i === s.ticks - 1 && !s.done ? { boxShadow: `0 0 0 3px ${FG}` } : {}) }} />
          ))}
          <div style={{ marginLeft: "auto", fontSize: 34, color: MUTED, textTransform: "uppercase", whiteSpace: "nowrap", flexShrink: 0, paddingLeft: 24 }}>Robinhood Chain</div>
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: "Humane", data: font, weight: 700, style: "normal" }] },
  );
}
