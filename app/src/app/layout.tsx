import type { Metadata } from "next";
import "./globals.css";
import { humane } from "@/fonts";
import { getDeployment } from "@/lib/deployment";
import { Providers } from "./providers";
import { Nav } from "@/components/Nav";
import { DevAccountProvider } from "@/components/DevAccountProvider";

export const metadata: Metadata = {
  title: "Stock Miner",
  description: "Four blocks. One mine. Closes forever.",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const deployment = getDeployment();
  if (!deployment) {
    return (
      <html lang="en" className={humane.variable}><body>
        <main className="min-h-screen bg-mine-bg text-mine-fg p-8 font-ui">
          <h1 className="font-display leading-none uppercase text-[56px] font-semibold">No season deployed</h1>
          <p className="text-mine-muted mt-2 max-w-[560px]">Start Anvil, run <code className="font-data">pnpm --filter @stock-miner/ops deploy-demo</code>, then reload. In production set the NEXT_PUBLIC_* addresses.</p>
        </main>
      </body></html>
    );
  }
  return (
    <html lang="en" className={humane.variable}>
      <body className="min-h-screen">
        <Providers deployment={deployment}>
          <DevAccountProvider>
            <Nav />
            {children}
          </DevAccountProvider>
        </Providers>
      </body>
    </html>
  );
}
