import localFont from "next/font/local";

/**
 * Display face: Humane (ultra-condensed grotesque), the headline type of the approved direction
 * (design/launch/63-type-mine-opens.webp, 64-type-logo.webp). Exposed as `--font-display`, which
 * specs/design/tokens.css and the Tailwind theme reference. Body (IBM Plex Sans) and data (IBM Plex
 * Mono) are self-hosted via @fontsource and imported in globals.css.
 */
export const humane = localFont({
  src: [
    { path: "./fonts/humane/Humane-Regular.ttf", weight: "400", style: "normal" },
    { path: "./fonts/humane/Humane-Medium.ttf", weight: "500", style: "normal" },
    { path: "./fonts/humane/Humane-SemiBold.ttf", weight: "600", style: "normal" },
    { path: "./fonts/humane/Humane-Bold.ttf", weight: "700", style: "normal" },
    { path: "./fonts/humane/Humane-Black.ttf", weight: "900", style: "normal" },
  ],
  variable: "--font-display",
  display: "swap",
  fallback: ["Barlow Condensed", "Arial Narrow", "Impact", "sans-serif"],
  adjustFontFallback: false,
});
