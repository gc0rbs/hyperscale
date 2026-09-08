import type { Abi } from "viem";
import SeasonMineJson from "../abi/SeasonMine.json";
import StockFragmentsJson from "../abi/StockFragments.json";
import RedemptionVaultJson from "../abi/RedemptionVault.json";
import RIGJson from "../abi/RIG.json";
import MockERC20Json from "../abi/MockERC20.json";
import AllowlistEligibilityJson from "../abi/AllowlistEligibility.json";
import MockPriceOracleJson from "../abi/MockPriceOracle.json";
import RoundMineJson from "../abi/RoundMine.json";
import RoundVaultJson from "../abi/RoundVault.json";

export const seasonMineAbi = SeasonMineJson as Abi;
export const stockFragmentsAbi = StockFragmentsJson as Abi;
export const redemptionVaultAbi = RedemptionVaultJson as Abi;
export const rigAbi = RIGJson as Abi;
export const erc20Abi = MockERC20Json as Abi;
export const eligibilityAbi = AllowlistEligibilityJson as Abi;
export const oracleAbi = MockPriceOracleJson as Abi;
export const roundMineAbi = RoundMineJson as Abi;
export const roundVaultAbi = RoundVaultJson as Abi;

export const TICKERS = ["NVDA", "MU", "SNDK", "QQQ"] as const;
export const PHASES = ["Funding", "PreOpen", "Open", "Closed", "Cancelled"] as const;
export type PhaseName = (typeof PHASES)[number];
