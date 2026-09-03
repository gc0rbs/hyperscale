import type { Config } from "tailwindcss";

/** Colours and fonts reference the CSS variables from specs/design/tokens.css (imported in globals.css). */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        shell: { bg: "var(--shell-bg)", card: "var(--shell-card)", fg: "var(--shell-fg)", muted: "var(--shell-muted)", line: "var(--shell-line)" },
        mine: { bg: "var(--mine-bg)", panel: "var(--mine-panel)", panel2: "var(--mine-panel-2)", line: "var(--mine-line)", fg: "var(--mine-fg)", muted: "var(--mine-muted)", dim: "var(--mine-dim)" },
        ember: { DEFAULT: "var(--ember)", deep: "var(--ember-deep)" },
        signal: { DEFAULT: "var(--signal)", deep: "var(--signal-deep)" },
        heat: { hot: "var(--heat-hot)" },
      },
      fontFamily: {
        display: "var(--font-display)",
        ui: "var(--font-ui)",
        data: "var(--font-data)",
      },
      borderRadius: { sm: "var(--radius-sm)", md: "var(--radius-md)", lg: "var(--radius-lg)" },
    },
  },
  plugins: [],
};
export default config;
