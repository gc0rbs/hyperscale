// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {SeasonFactory} from "../src/SeasonFactory.sol";
import {MineDeployer, FragmentsDeployer, VaultDeployer} from "../src/factory/Deployers.sol";
import {RIG} from "../src/tokens/RIG.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockStockToken} from "../src/mocks/MockStockToken.sol";
import {MockPriceOracle} from "../src/mocks/MockPriceOracle.sol";
import {AllowlistEligibility} from "../src/adapters/AllowlistEligibility.sol";

/// @title DeployFactory – the three deployers plus the factory (docs/RUNBOOK.md step 1)
/// @notice One-time per chain. Writes `deployments/<chainId>-factory.json`, which `CreateSeason`
///         and the ops scripts read. With `DEPLOY_MOCKS=true` (Anvil / testnet dry runs only) it also
///         deploys RIG, a mock LP token, mock USDC, a mock oracle, an allowlist eligibility adapter
///         and four mock Stock Tokens, and records them in the same file.
/// @dev    Dry run:   forge script script/DeployFactory.s.sol --rpc-url $RPC
///         Broadcast: forge script script/DeployFactory.s.sol --rpc-url $RPC --broadcast --verify
///         Env: PRIVATE_KEY, BASE_URI (fragment metadata, `{id}` placeholder), DEPLOY_MOCKS.
contract DeployFactory is Script {
    function run() external {
        uint256 key = vm.envOr(
            "PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80)
        );
        string memory baseUri = vm.envOr("BASE_URI", string("http://localhost:3000/api/frag/{id}.json"));
        bool mocks = vm.envOr("DEPLOY_MOCKS", false);
        address deployer = vm.addr(key);

        vm.startBroadcast(key);
        MineDeployer md = new MineDeployer();
        FragmentsDeployer fd = new FragmentsDeployer();
        VaultDeployer vd = new VaultDeployer();
        SeasonFactory factory = new SeasonFactory(baseUri, address(md), address(fd), address(vd));
        md.init(address(factory));
        fd.init(address(factory));
        vd.init(address(factory));

        string memory json = "factory";
        vm.serializeUint(json, "chainId", block.chainid);
        vm.serializeAddress(json, "deployer", deployer);
        vm.serializeAddress(json, "factory", address(factory));
        vm.serializeAddress(json, "mineDeployer", address(md));
        vm.serializeAddress(json, "fragmentsDeployer", address(fd));
        vm.serializeAddress(json, "vaultDeployer", address(vd));
        string memory out = vm.serializeString(json, "baseUri", baseUri);

        if (mocks) {
            RIG rig = new RIG(deployer);
            MockERC20 lp = new MockERC20("RIG/USDC LP", "RIG-LP", 18);
            MockERC20 usdc = new MockERC20("USD Coin", "USDC", 6);
            MockPriceOracle oracle = new MockPriceOracle();
            AllowlistEligibility elig = new AllowlistEligibility(deployer);
            string[4] memory syms = ["NVDAx", "TSLAx", "AAPLx", "SPYx"];
            uint256[4] memory prices = [uint256(172e8), 350e8, 230e8, 767e8];
            address[] memory stocks = new address[](4);
            for (uint256 i; i < 4; ++i) {
                MockStockToken s = new MockStockToken(syms[i], syms[i]);
                stocks[i] = address(s);
                oracle.set(address(s), prices[i], uint64(block.timestamp));
            }
            elig.set(deployer, true);
            vm.serializeAddress(json, "rig", address(rig));
            vm.serializeAddress(json, "lp", address(lp));
            vm.serializeAddress(json, "usdc", address(usdc));
            vm.serializeAddress(json, "oracle", address(oracle));
            vm.serializeAddress(json, "eligibility", address(elig));
            out = vm.serializeAddress(json, "stocks", stocks);
        }
        vm.stopBroadcast();

        string memory path = string.concat("deployments/", vm.toString(block.chainid), "-factory.json");
        vm.writeJson(out, path);
        console2.log("factory", address(factory));
        console2.log("wrote", path);
    }
}
