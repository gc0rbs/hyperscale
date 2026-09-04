/** Node-side ABI exports for tests (the app imports JSON through Next; vitest needs plain modules). */
import SeasonMineJson from "./abi/SeasonMine.json";
import RIGJson from "./abi/RIG.json";
import type { Abi } from "viem";
export const seasonMineAbi = SeasonMineJson as Abi;
export const rigAbi = RIGJson as Abi;
