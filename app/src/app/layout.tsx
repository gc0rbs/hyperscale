import type { Metadata } from "next";
import "./globals.css";
import { humane } from "@/fonts";

export const metadata: Metadata = {
  title: "Stock Miner — Mine your next move",
  description: "A virtual mining game with stock-token rewards. Build your rig, power through four blocks, and turn fragments into stock tokens.",
  icons: { icon: { url: "/brand/stock-miner-logo.png", type: "image/png" } },
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  openGraph: { title: "Stock Miner", description: "Stake RIG, run virtual rigs, mine Robinhood Stock Tokens. Four blocks, one mine, closes forever.", type: "website", siteName: "Stock Miner" },
  twitter: { card: "summary_large_image", title: "Stock Miner", description: "Four blocks. One mine. Closes forever." },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" className={humane.variable}><body className="min-h-screen">{children}</body></html>;
}
