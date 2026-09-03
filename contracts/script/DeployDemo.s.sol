// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ISeasonMine} from "../src/interfaces/ISeasonMine.sol";
import {SeasonFactory} from "../src/SeasonFactory.sol";
import {MineDeployer, FragmentsDeployer, VaultDeployer} from "../src/factory/Deployers.sol";
import {SeasonMine} from "../src/SeasonMine.sol";
import {RedemptionVault} from "../src/RedemptionVault.sol";
import {RIG} from "../src/tokens/RIG.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockStockToken} from "../src/mocks/MockStockToken.sol";
import {MockPriceOracle} from "../src/mocks/MockPriceOracle.sol";
import {AllowlistEligibility} from "../src/adapters/AllowlistEligibility.sol";

/// @title DeployDemo – a funded demo season on Anvil for the app and ops tooling
/// @notice Deploys RIG, mock LP/USDC/stock tokens, oracle, eligibility, the factory and one season
///         sized to run about PACE_SECONDS at DEMO_HASH total hash. Distributes RIG and LP to the
///         first five Anvil accounts and allowlists them. Writes addresses to `deployments/anvil.json`.
/// @dev    Usage: forge script script/DeployDemo.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
///         Env: PACE_SECONDS (default 7200), DEMO_HASH (default 500000 = 500k RIG-eq), OPEN_DELAY (48h).
contract DeployDemo is Script {
    uint256 internal constant WAD = 1e18;

    function run() external {
        uint256 pace = vm.envOr("PACE_SECONDS", uint256(7200));
        uint256 demoHash = vm.envOr("DEMO_HASH", uint256(500_000));
        uint256 openDelay = vm.envOr("OPEN_DELAY", uint256(48 hours));
        uint256 deployerKey = vm.envOr(
            "PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80)
        );
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);
        RIG rig = new RIG(deployer);
        MockERC20 lp = new MockERC20("RIG/USDC LP", "RIG-LP", 18);
        MockERC20 usdc = new MockERC20("USD Coin", "USDC", 6);
        MockPriceOracle oracle = new MockPriceOracle();
        AllowlistEligibility elig = new AllowlistEligibility(deployer);
        MineDeployer md = new MineDeployer();
        FragmentsDeployer fd = new FragmentsDeployer();
        VaultDeployer vd = new VaultDeployer();
        SeasonFactory factory = new SeasonFactory(
            "http://localhost:3000/api/frag/{id}.json", address(md), address(fd), address(vd)
        );
        md.init(address(factory));
        fd.init(address(factory));
        vd.init(address(factory));

        string[4] memory syms = ["NVDAx", "TSLAx", "AAPLx", "SPYx"];
        uint256[4] memory prices = [uint256(172e8), 350e8, 230e8, 767e8];
        uint256[4] memory pool = [uint256(5e18), 6e18, 10e18, 6e18];
        uint256[4] memory diffShare = [uint256(2000), 2500, 2500, 3000];
        address[] memory stocks = new address[](4);
        for (uint256 i; i < 4; ++i) {
            MockStockToken s = new MockStockToken(syms[i], syms[i]);
            stocks[i] = address(s);
            oracle.set(address(s), prices[i], uint64(block.timestamp));
        }

        ISeasonMine.SeasonParams memory p;
        p.rig = address(rig);
        p.lpToken = address(lp);
        p.lpWeightPerToken = 2.5e18;
        p.openTime = uint64(block.timestamp + openDelay + 1 hours); // margin: broadcast lands after simulation
        p.maxDurationSeconds = 30 days;
        p.blocks = 4;
        p.shiftsPerBlock = 8;
        p.stocks = stocks;
        p.poolTokens = new uint256[](4);
        p.difficulty = new uint256[](4);
        uint256 dTotal = demoHash * WAD * pace;
        for (uint256 i; i < 4; ++i) {
            p.poolTokens[i] = pool[i];
            uint256 raw = (dTotal * diffShare[i]) / 10_000;
            p.difficulty[i] = raw - (raw % 8);
        }
        p.fragPerToken = 1_000_000;
        p.minStakeWeight = 100e18;
        p.activationFeeBps = 100;
        p.earlyExitFeeBps = 300;
        p.gpuMultBps = [uint16(10_000), 12_000, 14_000, 16_000, 18_000, 20_000];
        p.gpuCostBps = [uint16(400), 600, 900, 1300, 1800];
        p.coolCostBps = [uint16(300), 500, 800];
        p.heatPerOc = [uint8(40), 30, 22, 15];
        p.coolPerShift = [uint8(10), 18, 26, 36];
        p.heatMax = 100;
        p.ocCostBps = 200;
        p.ocBoostBps = 5000;
        p.maxActiveOc = 3;
        p.ocShiftSpan = 1;
        p.redemptionDays = 30;
        p.cashOutFeeBps = 100;
        p.pauseGraceSeconds = 6 hours;
        p.treasury = deployer;

        (uint256 seasonId, address mine, address frags, address vault) =
            factory.create(p, address(elig), address(oracle), address(usdc), false);

        // Fund the vault: stock pool + 50k USDC reserve.
        for (uint256 i; i < 4; ++i) {
            MockStockToken s = MockStockToken(stocks[i]);
            s.setAllowed(vault, true);
            s.mint(deployer, pool[i]);
            s.approve(vault, pool[i]);
        }
        usdc.mint(deployer, 50_000e6);
        usdc.approve(vault, 50_000e6);
        RedemptionVault(vault).fund(50_000e6);

        // Distribute to the first five Anvil accounts (deployer is #0).
        address[5] memory accts = [
            deployer,
            0x70997970C51812dc3A010C7d01b50e0d17dc79C8,
            0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC,
            0x90f79bf6EB2c4F870365E785982e1f101E93B9Cc,
            0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65
        ];
        for (uint256 i; i < 5; ++i) {
            if (accts[i] != deployer) rig.transfer(accts[i], 2_000_000e18);
            lp.mint(accts[i], 200_000e18);
            elig.set(accts[i], true);
            for (uint256 k; k < 4; ++k) {
                MockStockToken(stocks[k]).setAllowed(accts[i], true);
            }
        }
        vm.stopBroadcast();

        string memory json = "deploy";
        vm.serializeUint(json, "chainId", block.chainid);
        vm.serializeUint(json, "seasonId", seasonId);
        vm.serializeAddress(json, "rig", address(rig));
        vm.serializeAddress(json, "lp", address(lp));
        vm.serializeAddress(json, "usdc", address(usdc));
        vm.serializeAddress(json, "oracle", address(oracle));
        vm.serializeAddress(json, "eligibility", address(elig));
        vm.serializeAddress(json, "factory", address(factory));
        vm.serializeAddress(json, "mine", mine);
        vm.serializeAddress(json, "fragments", frags);
        vm.serializeAddress(json, "vault", vault);
        vm.serializeAddress(json, "stocks", stocks);
        vm.serializeUint(json, "openTime", p.openTime);
        string memory out = vm.serializeUint(json, "difficultyTotal", dTotal);
        vm.writeJson(out, "deployments/anvil.json");
        console2.log("mine", mine);
        console2.log("openTime", p.openTime);
    }
}
