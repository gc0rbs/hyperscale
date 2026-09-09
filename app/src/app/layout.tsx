import type { Metadata } from "next";
import "./globals.css";
import { humane } from "@/fonts";
import { BRAND, DESCRIPTION, DOMAIN, TAGLINE } from "@/lib/brand";

export const metadata: Metadata = {
  title: `${BRAND} — ${TAGLINE}`,
  description: DESCRIPTION,
  icons: { icon: { url: "/brand/hyperscaler-logo.png", type: "image/png" } },
  metadataBase: new URL(DOMAIN),
  openGraph: { title: BRAND, description: DESCRIPTION, type: "website", siteName: BRAND },
  twitter: { card: "summary_large_image", title: BRAND, description: TAGLINE },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" className={humane.variable}><body className="min-h-screen">{children}</body></html>;
}
