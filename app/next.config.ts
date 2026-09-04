import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // WalletConnect's logger optionally requires pino-pretty; it is not needed in the browser bundle.
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  },
};

export default nextConfig;
