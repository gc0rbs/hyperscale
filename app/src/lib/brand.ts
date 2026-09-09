/**
 * Public identity (design handoff 2026-09-09, docs/DECISIONS.md same date). Every user-facing name
 * comes from here so a rename is one edit; contract identifiers and the ops vocabulary keep the
 * mining terms (docs/12 §8).
 */
export const BRAND = "Hyperscaler";
export const TOKEN = "VRAM";
export const TOKEN_TICKER = `$${TOKEN}`;
export const TAGLINE = "Virtual GPUs. Stock-token rewards.";
export const DESCRIPTION = "An AI-compute strategy game on Robinhood Chain. Build a virtual GPU, work through hourly rounds, and earn shards of tokens that track stocks.";
export const DOMAIN = process.env.NEXT_PUBLIC_APP_URL ?? (process.env.NODE_ENV === "production" ? "https://hyperscaling.xyz" : "http://localhost:3000");
