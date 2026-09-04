import { defineConfig } from "vitest/config";
// The parity test needs Anvil and has its own config (vitest.parity.config.ts, `pnpm parity`).
export default defineConfig({ test: { include: ["test/**/*.test.ts"], exclude: ["test/parity/**", "node_modules/**"] } });
