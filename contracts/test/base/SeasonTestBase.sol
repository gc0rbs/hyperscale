// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ISeasonMine} from "../../src/interfaces/ISeasonMine.sol";
import {SeasonMine} from "../../src/SeasonMine.sol";
import {SeasonFactory} from "../../src/SeasonFactory.sol";
import {MineDeployer, FragmentsDeployer, VaultDeployer} from "../../src/factory/Deployers.sol";
import {StockFragments} from "../../src/StockFragments.sol";
import {RedemptionVault} from "../../src/RedemptionVault.sol";
import {RIG} from "../../src/tokens/RIG.sol";
import {MockERC20} from "../../src/mocks/MockERC20.sol";
import {MockStockToken} from "../../src/mocks/MockStockToken.sol";
import {MockPriceOracle} from "../../src/mocks/MockPriceOracle.sol";
import {AllowlistEligibility} from "../../src/adapters/AllowlistEligibility.sol";

/// @dev Deploys a full season with the docs/03 defaults (season-default.json), sized for 10M hash
///      over 24h (the docs/03 worked example). Time starts 3 days before OPEN to leave room for pre-open play.
abstract contract SeasonTestBase is Test {
    uint256 internal constant WAD = 1e18;
    uint64 internal constant OPEN = 1_800_000_000;
    uint256 internal constant SHIFTS = 32;

    RIG internal rig;
    MockERC20 internal lp;
    MockERC20 internal usdc;
    MockStockToken[4] internal stocks;
    MockPriceOracle internal oracle;
    AllowlistEligibility internal elig;
    SeasonFactory internal factory;
    SeasonMine internal mine;
    StockFragments internal frags;
    RedemptionVault internal vault;

    address internal treasury = makeAddr("treasury");
    address internal ann = makeAddr("ann");
    address internal bo = makeAddr("bo");
    address internal cy = makeAddr("cy");

    uint256[4] internal DIFFICULTY = [
        uint256(172_800_000_000) * WAD,
        uint256(216_000_000_000) * WAD,
        uint256(216_000_000_000) * WAD,
        uint256(259_200_000_000) * WAD
    ];
    uint256[4] internal POOL = [uint256(5e18), 6e18, 10e18, 6e18];

    function setUp() public virtual {
        vm.warp(OPEN - 3 days);
        rig = new RIG(address(this));
        lp = new MockERC20("RIG/USDC LP", "RIG-LP", 18);
        usdc = new MockERC20("USD Coin", "USDC", 6);
        oracle = new MockPriceOracle();
        elig = new AllowlistEligibility(address(this));
        MineDeployer md = new MineDeployer();
        FragmentsDeployer fd = new FragmentsDeployer();
        VaultDeployer vd = new VaultDeployer();
        factory =
            new SeasonFactory("https://stockminer.xyz/frag/{id}.json", address(md), address(fd), address(vd));
        md.init(address(factory));
        fd.init(address(factory));
        vd.init(address(factory));
        string[4] memory syms = ["NVDAx", "TSLAx", "AAPLx", "SPYx"];
        for (uint256 i; i < 4; ++i) {
            stocks[i] = new MockStockToken(syms[i], syms[i]);
        }
        ISeasonMine.SeasonParams memory p = defaultParams();
        (, address m, address f, address v) =
            factory.create(p, address(elig), address(oracle), address(usdc), false);
        mine = SeasonMine(m);
        frags = StockFragments(f);
        vault = RedemptionVault(v);
        fundVault(50_000e6);
    }

    function defaultParams() internal view returns (ISeasonMine.SeasonParams memory p) {
        p.rig = address(rig);
        p.lpToken = address(lp);
        p.lpWeightPerToken = 2.5e18; // 1 LP = 2 RIG-equivalent × 1.25 bonus
        p.openTime = OPEN;
        p.maxDurationSeconds = 30 days;
        p.blocks = 4;
        p.shiftsPerBlock = 8;
        p.stocks = new address[](4);
        p.poolTokens = new uint256[](4);
        p.difficulty = new uint256[](4);
        for (uint256 i; i < 4; ++i) {
            p.stocks[i] = address(stocks[i]);
            p.poolTokens[i] = POOL[i];
            p.difficulty[i] = DIFFICULTY[i];
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
        p.treasury = treasury;
    }

    function fundVault(uint256 usdcReserve) internal {
        for (uint256 i; i < 4; ++i) {
            stocks[i].setAllowed(address(vault), true);
            stocks[i].mint(address(this), POOL[i]);
            stocks[i].approve(address(vault), POOL[i]);
        }
        usdc.mint(address(this), usdcReserve);
        usdc.approve(address(vault), usdcReserve);
        vault.fund(usdcReserve);
    }

    // ── player helpers ──────────────────────────────────────────────────────

    /// @dev Gives 3× the stake in RIG so the player can also pay the activation fee and burns.
    function fundPlayer(address who, uint256 rigAmount, uint256 lpAmount) internal {
        if (rigAmount > 0) rig.transfer(who, rigAmount * 3);
        if (rigAmount == 0 && lpAmount > 0) rig.transfer(who, lpAmount * 3);
        if (lpAmount > 0) lp.mint(who, lpAmount);
        vm.startPrank(who);
        rig.approve(address(mine), type(uint256).max);
        lp.approve(address(mine), type(uint256).max);
        vm.stopPrank();
    }

    function activateRig(address who, uint256 amount) internal returns (uint256 id) {
        vm.prank(who);
        id = mine.activate(ISeasonMine.Asset.RIG, amount);
    }

    function activateLp(address who, uint256 amount) internal returns (uint256 id) {
        vm.prank(who);
        id = mine.activate(ISeasonMine.Asset.LP, amount);
    }

    function gpu(address who, uint256 id, uint8 toTier) internal {
        vm.startPrank(who);
        while (mine.rigs(id).gpuTier < toTier) mine.upgradeGpu(id);
        vm.stopPrank();
    }

    function cooling(address who, uint256 id, uint8 toTier) internal {
        vm.startPrank(who);
        while (mine.rigs(id).coolingTier < toTier) mine.upgradeCooling(id);
        vm.stopPrank();
    }

    function overclockN(address who, uint256 id, uint8 n) internal {
        vm.startPrank(who);
        for (uint8 i; i < n; ++i) {
            mine.overclock(id);
        }
        vm.stopPrank();
    }

    function open() internal {
        vm.warp(OPEN);
    }

    /// @dev Warp to the first whole second at or after the end of the current shift and poke.
    ///      The ETA assumes constant hash; overclock expiry can lengthen a shift, so loop.
    function warpToShiftEnd() internal {
        uint16 s = mine.shift();
        while (mine.shift() == s && mine.closeX() == 0) {
            ISeasonMine.Eta memory e = mine.eta();
            require(!e.idle, "idle");
            vm.warp(block.timestamp + e.toShiftEnd + 1);
            mine.poke();
        }
    }

    function warpToBlockFound() internal {
        uint8 b = uint8(mine.shift() / 8);
        while (mine.blockEndX(b) == 0 && mine.closeX() == 0) {
            ISeasonMine.Eta memory e = mine.eta();
            require(!e.idle, "idle");
            vm.warp(block.timestamp + e.toBlockFound + 1);
            mine.poke();
        }
    }

    function warpToClose() internal {
        while (mine.closeX() == 0) {
            ISeasonMine.Eta memory e = mine.eta();
            require(!e.idle, "idle");
            vm.warp(block.timestamp + e.toClose + 1);
            mine.poke();
        }
    }

    function ratePerSecond(uint256 hash, uint8 b) internal view returns (uint256 fragWeiPerSecond) {
        return (hash * mine.ratePerWork(b)) / WAD; // work per second = hash/1e18 ... scaled: hash × 1s /1e18 × rate /1e18
    }
}
