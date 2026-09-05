import type { NextConfig } from "next";
import { join } from "node:path";

/** Audit R4: baseline security headers at the app layer. A CSP is left to the edge: WalletConnect and
 *  injected wallets need connect-src/frame-src allowances that depend on the host; see RUNBOOK §10. */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Railway runs the traced standalone server (app/Dockerfile): `node server.js`, no package manager at runtime.
  output: "standalone",
  outputFileTracingRoot: join(__dirname, ".."),
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // WalletConnect's logger optionally requires pino-pretty; it is not needed in the browser bundle.
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  },
};

export default nextConfig;
