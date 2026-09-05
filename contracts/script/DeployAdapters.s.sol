// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {OpenEligibility} from "../src/adapters/OpenEligibility.sol";
import {ChainlinkOracle} from "../src/adapters/ChainlinkOracle.sol";

/// @title DeployAdapters – the two external adapters a Robinhood Chain season needs (RUNBOOK step 1b)
/// @notice Deploys `OpenEligibility` (Stock Tokens have no on-chain restriction; the geo-fence lives in
///         the app) and `ChainlinkOracle` over the per-token Chainlink feeds. Writes
///         `deployments/<chainId>-adapters.json`, which `ops plan` reads when the chain profile leaves
///         `oracle` / `eligibility` at zero. Run once per chain, or again when the stock set changes.
/// @dev    STOCKS and FEEDS are comma-separated address lists in the same order (ops deploy-adapters
///         builds them from ops/chains/<name>.json).
contract DeployAdapters is Script {
    function run() external {
        uint256 key = block.chainid == 31337
            ? vm.envOr(
                "PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80)
            )
            : vm.envUint("PRIVATE_KEY"); // audit R1: the Anvil default key never leaves chain 31337
        address[] memory stocks = vm.envAddress("STOCKS", ",");
        address[] memory feeds = vm.envAddress("FEEDS", ",");
        require(stocks.length == feeds.length && stocks.length > 0, "STOCKS/FEEDS length");

        vm.startBroadcast(key);
        OpenEligibility elig = new OpenEligibility();
        ChainlinkOracle oracle = new ChainlinkOracle(stocks, feeds);
        vm.stopBroadcast();

        // sanity: every feed answers with a positive price
        for (uint256 i; i < stocks.length; ++i) {
            (uint256 p, uint64 at) = oracle.usdPrice(stocks[i]);
            console2.log("stock", stocks[i]);
            console2.log("  price 1e8", p);
            console2.log("  updatedAt", at);
        }

        string memory json = "adapters";
        vm.serializeUint(json, "chainId", block.chainid);
        vm.serializeAddress(json, "eligibility", address(elig));
        vm.serializeAddress(json, "stocks", stocks);
        vm.serializeAddress(json, "feeds", feeds);
        string memory out = vm.serializeAddress(json, "oracle", address(oracle));
        string memory path = string.concat("deployments/", vm.toString(block.chainid), "-adapters.json");
        vm.writeJson(out, path);
        console2.log("eligibility", address(elig));
        console2.log("oracle", address(oracle));
        console2.log("wrote", path);
    }
}
