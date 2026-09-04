import { cpSync, existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

// Isolate the static marketing build so the normal app and local preview keep their server routes.
const app = fileURLToPath(new URL("..", import.meta.url));
const root = dirname(app);
const output = join(root, "generated", "here-now");
mkdirSync(output, { recursive: true });
const staging = mkdtempSync(join(output, "build-"));
const build = join(staging, "app");
mkdirSync(build, { recursive: true });

function copy(relative) {
  const target = join(build, relative);
  mkdirSync(dirname(target), { recursive: true });
  cpSync(join(app, relative), target, { recursive: true });
}

try {
  for (const file of [
    "package.json", "tsconfig.json", "next-env.d.ts", "eslint.config.mjs",
    "postcss.config.mjs", "tailwind.config.ts", "src/fonts", "src/fonts.ts",
    "src/app/layout.tsx", "src/app/page.tsx", "src/app/globals.css", "src/app/icon.svg",
    "src/components/Icons.tsx", "src/components/SeasonUnavailable.tsx", "src/components/landing",
  ]) copy(file);
  cpSync(join(root, "specs", "design"), join(staging, "specs", "design"), { recursive: true });
  symlinkSync(join(app, "node_modules"), join(build, "node_modules"), "dir");
  writeFileSync(join(build, "next.config.ts"), `import type { NextConfig } from "next";
const config: NextConfig = { output: "export", trailingSlash: true, images: { unoptimized: true } };
export default config;
`);

  // Static hosting has no chain service. Preserve navigation with the same unavailable-season UI.
  for (const route of ["mine", "mine/new", "claim", "redeem", "leaderboard", "seasons"]) {
    const directory = join(build, "src", "app", route);
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, "page.tsx"), `import { SeasonUnavailable } from "@/components/SeasonUnavailable";
export default function Page() { return <SeasonUnavailable />; }
`);
  }
  // Use pnpm’s executable shim so Next and ESLint inherit workspace dependency resolution.
  execFileSync("pnpm", ["exec", "next", "build"], {
    cwd: build,
    stdio: "inherit",
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  });
  const exported = join(build, "out");
  if (!existsSync(join(exported, "index.html"))) throw new Error("Static export did not produce index.html");
  const site = join(output, "site");
  rmSync(site, { recursive: true, force: true });
  renameSync(exported, site);
  console.log(`Publish this folder: ${site}`);
} finally {
  rmSync(staging, { recursive: true, force: true });
}
