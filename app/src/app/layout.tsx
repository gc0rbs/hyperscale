import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stock Miner",
  description: "Four blocks. One mine. Closes forever.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
