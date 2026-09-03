import { readFileSync } from "node:fs";
import { sizeDifficulty } from "./sizing.js";

const path = process.argv[2] ?? "../specs/params/season-default.json";
const p = JSON.parse(readFileSync(path, "utf8"));
const s = sizeDifficulty({
  expectedTotalHash: BigInt(p.sizing.expectedTotalHash) * 10n ** 18n,
  plannedSeconds: BigInt(p.sizing.plannedSeconds),
  diffShareBps: p.sizing.diffShareBps,
  shiftsPerBlock: p.shiftsPerBlock,
});
console.log(JSON.stringify({ ...s, difficulty: s.difficulty.map(String), difficultyTotal: String(s.difficultyTotal), maxDurationSeconds: String(s.maxDurationSeconds) }, null, 2));
