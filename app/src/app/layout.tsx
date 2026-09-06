import type { Metadata } from "next";
import "./globals.css";
import { humane } from "@/fonts";

export const metadata: Metadata = {
  title: "Hyperscale — Run the compute. Own the chips.",
  description: "A virtual mining game with stock-token rewards. Build your rig, power through four blocks, and turn fragments into stock tokens.",
  icons: { icon: { url: "/brand/stock-miner-logo.png", type: "image/png" } },
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  openGraph: { title: "Hyperscale", description: "Stake RIG, bring nodes online, serve compute, earn Robinhood Stock Tokens. Four jobs, one cluster, shuts down forever.", type: "website", siteName: "Hyperscale" },
  twitter: { card: "summary_large_image", title: "Hyperscale", description: "Four jobs. One cluster. Shuts down forever." },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" className={humane.variable}><body className="min-h-screen">{children}</body></html>;
}
