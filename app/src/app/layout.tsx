import type { Metadata } from "next";
import "./globals.css";
import { humane } from "@/fonts";

export const metadata: Metadata = {
  title: "Stock Miner — Mine your next move",
  description: "A virtual mining game with stock-token rewards. Build your rig, power through four blocks, and turn fragments into stock tokens.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" className={humane.variable}><body className="min-h-screen">{children}</body></html>;
}
