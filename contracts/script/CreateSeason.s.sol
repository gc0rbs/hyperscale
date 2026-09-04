// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ISeasonMine} from "../src/interfaces/ISeasonMine.sol";
import {SeasonFactory} from "../src/SeasonFactory.sol";

/// @title CreateSeason – `SeasonFactory.create` from a resolved season JSON (docs/RUNBOOK.md step 3)
/// @notice The JSON is produced by `pnpm --filter @stock-miner/ops plan` and already carries token
///         addresses, `openTime`, `lpWeightPerToken` and per-block difficulty in contract units. The
///         script re-validates nothing the factory does not; it simulates `create` first (a dry run
///         without `--broadcast` shows the predicted addresses and any `InvalidParams` reason), then
///         writes `deployments/<chainId>.json` in the shape the app, keeper and watcher read.
/// @dev    forge script script/CreateSeason.s.sol --rpc-url $RPC [--broadcast --verify]
///         Env: PRIVATE_KEY (becomes the vault's funding operator), SEASON_FILE (path to the JSON),
///              FACTORY (optional; default from deployments/<chainId>-factory.json).
contract CreateSeason is Script {
    function run() external {
        uint256 key = vm.envOr(
            "PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80)
        );
        string memory file = vm.envString("SEASON_FILE");
        string memory j = vm.readFile(file);
        address factoryAddr = vm.envOr("FACTORY", address(0));
        if (factoryAddr == address(0)) {
            string memory f =
                vm.readFile(string.concat("deployments/", vm.toString(block.chainid), "-factory.json"));
            factoryAddr = vm.parseJsonAddress(f, ".factory");
        }
        uint256 fileChain = vm.parseJsonUint(j, ".chainId");
        require(fileChain == block.chainid, "season file is for another chain");

        ISeasonMine.SeasonParams memory p = _params(j);
        address eligibility = vm.parseJsonAddress(j, ".eligibility");
        address oracle = vm.parseJsonAddress(j, ".oracle");
        address usdc = vm.parseJsonAddress(j, ".usdc");
        bool transfersEnabled = vm.parseJsonBool(j, ".transfersEnabled");

        SeasonFactory factory = SeasonFactory(factoryAddr);
        vm.startBroadcast(key);
        (uint256 seasonId, address mine, address frags, address vault) =
            factory.create(p, eligibility, oracle, usdc, transfersEnabled);
        vm.stopBroadcast();

        uint256 dTotal;
        for (uint256 b; b < 4; ++b) {
            dTotal += p.difficulty[b];
        }
        string memory json = "season";
        vm.serializeUint(json, "chainId", block.chainid);
        vm.serializeUint(json, "seasonId", seasonId);
        vm.serializeAddress(json, "rig", p.rig);
        vm.serializeAddress(json, "lp", p.lpToken);
        vm.serializeAddress(json, "usdc", usdc);
        vm.serializeAddress(json, "oracle", oracle);
        vm.serializeAddress(json, "eligibility", eligibility);
        vm.serializeAddress(json, "factory", factoryAddr);
        vm.serializeAddress(json, "mine", mine);
        vm.serializeAddress(json, "fragments", frags);
        vm.serializeAddress(json, "vault", vault);
        vm.serializeAddress(json, "stocks", p.stocks);
        vm.serializeUint(json, "openTime", p.openTime);
        vm.serializeString(json, "seasonFile", file);
        vm.serializeBytes32(json, "paramsHash", keccak256(abi.encode(p)));
        string memory out = vm.serializeUint(json, "difficultyTotal", dTotal);
        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        vm.writeJson(out, path);
        console2.log("seasonId", seasonId);
        console2.log("mine", mine);
        console2.log("fragments", frags);
        console2.log("vault", vault);
        console2.log("wrote", path);
    }

    function _params(string memory j) internal pure returns (ISeasonMine.SeasonParams memory p) {
        p.rig = vm.parseJsonAddress(j, ".params.rig");
        p.lpToken = vm.parseJsonAddress(j, ".params.lpToken");
        p.lpWeightPerToken = vm.parseJsonUint(j, ".params.lpWeightPerToken");
        p.openTime = uint64(vm.parseJsonUint(j, ".params.openTime"));
        p.maxDurationSeconds = uint32(vm.parseJsonUint(j, ".params.maxDurationSeconds"));
        p.blocks = uint8(vm.parseJsonUint(j, ".params.blocks"));
        p.shiftsPerBlock = uint8(vm.parseJsonUint(j, ".params.shiftsPerBlock"));
        p.stocks = vm.parseJsonAddressArray(j, ".params.stocks");
        p.poolTokens = vm.parseJsonUintArray(j, ".params.poolTokens");
        p.difficulty = vm.parseJsonUintArray(j, ".params.difficulty");
        p.fragPerToken = vm.parseJsonUint(j, ".params.fragPerToken");
        p.minStakeWeight = vm.parseJsonUint(j, ".params.minStakeWeight");
        p.activationFeeBps = uint16(vm.parseJsonUint(j, ".params.activationFeeBps"));
        p.earlyExitFeeBps = uint16(vm.parseJsonUint(j, ".params.earlyExitFeeBps"));
        uint256[] memory a = vm.parseJsonUintArray(j, ".params.gpuMultBps");
        require(a.length == 6, "gpuMultBps length");
        for (uint256 i; i < 6; ++i) {
            p.gpuMultBps[i] = uint16(a[i]);
        }
        a = vm.parseJsonUintArray(j, ".params.gpuCostBps");
        require(a.length == 5, "gpuCostBps length");
        for (uint256 i; i < 5; ++i) {
            p.gpuCostBps[i] = uint16(a[i]);
        }
        a = vm.parseJsonUintArray(j, ".params.coolCostBps");
        require(a.length == 3, "coolCostBps length");
        for (uint256 i; i < 3; ++i) {
            p.coolCostBps[i] = uint16(a[i]);
        }
        a = vm.parseJsonUintArray(j, ".params.heatPerOc");
        require(a.length == 4, "heatPerOc length");
        for (uint256 i; i < 4; ++i) {
            p.heatPerOc[i] = uint8(a[i]);
        }
        a = vm.parseJsonUintArray(j, ".params.coolPerShift");
        require(a.length == 4, "coolPerShift length");
        for (uint256 i; i < 4; ++i) {
            p.coolPerShift[i] = uint8(a[i]);
        }
        p.heatMax = uint8(vm.parseJsonUint(j, ".params.heatMax"));
        p.ocCostBps = uint16(vm.parseJsonUint(j, ".params.ocCostBps"));
        p.ocBoostBps = uint16(vm.parseJsonUint(j, ".params.ocBoostBps"));
        p.maxActiveOc = uint8(vm.parseJsonUint(j, ".params.maxActiveOc"));
        p.ocShiftSpan = uint8(vm.parseJsonUint(j, ".params.ocShiftSpan"));
        p.redemptionDays = uint32(vm.parseJsonUint(j, ".params.redemptionDays"));
        p.cashOutFeeBps = uint16(vm.parseJsonUint(j, ".params.cashOutFeeBps"));
        p.pauseGraceSeconds = uint32(vm.parseJsonUint(j, ".params.pauseGraceSeconds"));
        p.treasury = vm.parseJsonAddress(j, ".params.treasury");
    }
}
