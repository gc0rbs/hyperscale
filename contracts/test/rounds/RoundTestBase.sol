// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IRoundMine} from "../../src/interfaces/IRoundMine.sol";
import {RoundMine} from "../../src/rounds/RoundMine.sol";
import {RoundVault} from "../../src/rounds/RoundVault.sol";
import {StockFragments} from "../../src/StockFragments.sol";
import {CreateAddress} from "../../src/factory/CreateAddress.sol";
import {RIG} from "../../src/tokens/RIG.sol";
import {MockERC20} from "../../src/mocks/MockERC20.sol";
import {MockStockToken} from "../../src/mocks/MockStockToken.sol";
import {MockPriceOracle} from "../../src/mocks/MockPriceOracle.sol";
import {AllowlistEligibility} from "../../src/adapters/AllowlistEligibility.sol";

/// @dev One permanent mine with hourly rounds and 15-minute claim windows (docs/13). Genesis is one day
///      after setUp so pre-genesis behaviour can be exercised; the test contract is the operator.
abstract contract RoundTestBase is Test {
    uint256 internal constant WAD = 1e18;
    uint64 internal constant GENESIS = 1_800_000_000;
    uint32 internal constant L = 3600;
    uint32 internal constant W = 900;
    uint256 internal constant FPT = 1_000_000;

    RIG internal rig;
    MockERC20 internal usdc;
    MockStockToken[4] internal stocks;
    MockPriceOracle internal oracle;
    AllowlistEligibility internal elig;
    RoundMine internal mine;
    StockFragments internal frags;
    RoundVault internal vault;

    address internal treasury = makeAddr("treasury");
    address internal ann = makeAddr("ann");
    address internal bo = makeAddr("bo");
    address internal cy = makeAddr("cy");
    address internal feeWallet = makeAddr("feeWallet");

    function setUp() public virtual {
        vm.warp(GENESIS - 1 days);
        rig = new RIG(address(this));
        usdc = new MockERC20("USD Coin", "USDG", 6);
        oracle = new MockPriceOracle();
        elig = new AllowlistEligibility(address(this));
        string[4] memory syms = ["NVDA", "MU", "SNDK", "QQQ"];
        for (uint256 i; i < 4; ++i) {
            stocks[i] = new MockStockToken(syms[i], syms[i]);
        }
        (mine, frags, vault) = deployMine(defaultParams());
        for (uint256 i; i < 4; ++i) {
            stocks[i].setAllowed(address(vault), true);
            stocks[i].setAllowed(feeWallet, true);
            stocks[i].setAllowed(address(this), true);
        }
    }

    /// @dev Mine, fragments and vault reference each other in their constructors; predict the three
    ///      CREATE addresses from this contract's nonce, exactly as the deploy script does.
    function deployMine(IRoundMine.RoundParams memory p)
        internal
        returns (RoundMine m, StockFragments f, RoundVault v)
    {
        uint64 nonce = vm.getNonce(address(this));
        address mineAddr = CreateAddress.predict(address(this), nonce);
        address fragAddr = CreateAddress.predict(address(this), nonce + 1);
        address vaultAddr = CreateAddress.predict(address(this), nonce + 2);
        m = new RoundMine(p, address(this), fragAddr, vaultAddr);
        f = new StockFragments(
            mineAddr, vaultAddr, p.stocks, p.fragPerToken, false, "https://hyperscale.fi/frag/{id}.json"
        );
        v = new RoundVault(
            RoundVault.Config({
                mine: mineAddr,
                fragments: fragAddr,
                usdc: address(usdc),
                eligibility: address(elig),
                oracle: address(oracle),
                operator: address(this),
                cashOutFeeBps: 100,
                fragPerToken: p.fragPerToken,
                maxPriceAge: 4 days,
                stocks: p.stocks
            })
        );
        require(address(m) == mineAddr && address(f) == fragAddr && address(v) == vaultAddr, "predict");
    }

    function defaultParams() internal view returns (IRoundMine.RoundParams memory p) {
        p.rig = address(rig);
        p.stocks = new address[](4);
        for (uint256 i; i < 4; ++i) {
            p.stocks[i] = address(stocks[i]);
        }
        p.treasury = treasury;
        p.genesis = GENESIS;
        p.roundSeconds = L;
        p.claimSeconds = W;
        p.fragPerToken = FPT;
        p.minStakeWeight = 100e18;
        p.activationFeeBps = 100;
        p.exitFeeBps = 300;
        p.gpuMultBps = [uint16(10_000), 12_000, 14_000, 16_000, 18_000, 20_000];
        p.gpuCostBps = [uint16(400), 600, 900, 1300, 1800];
        p.coolCostBps = [uint16(300), 500, 800];
        p.heatPerOc = [uint8(40), 30, 22, 15];
        p.coolPerRound = [uint8(10), 18, 26, 36];
        p.heatMax = 100;
        p.ocCostBps = 200;
        p.ocBoostBps = 5000;
        p.maxActiveOc = 3;
        p.ocRoundSpan = 1;
        p.pauseGraceSeconds = 30 minutes;
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    /// @dev Gives 3× the stake so the player can also pay the activation fee and burns.
    function fundPlayer(address who, uint256 amount) internal {
        rig.transfer(who, amount * 3);
        vm.prank(who);
        rig.approve(address(mine), type(uint256).max);
    }

    function activateRig(address who, uint256 amount) internal returns (uint256 id) {
        vm.prank(who);
        id = mine.activate(amount);
    }

    /// @dev The fee wallet funds `perRound` of every stock for `rounds` rounds.
    function fundRounds(uint256 perRound, uint64 rounds) internal {
        for (uint8 s; s < 4; ++s) {
            stocks[s].mint(feeWallet, perRound * rounds);
            vm.startPrank(feeWallet);
            stocks[s].approve(address(mine), perRound * rounds);
            mine.fund(s, perRound * rounds, rounds);
            vm.stopPrank();
        }
    }

    function fundReserve(uint256 amount) internal {
        usdc.mint(address(this), amount);
        usdc.approve(address(vault), amount);
        vault.topUpReserve(amount);
    }

    function roundStart(uint64 r) internal pure returns (uint64) {
        return GENESIS + r * L;
    }

    function roundEnd(uint64 r) internal pure returns (uint64) {
        return GENESIS + (r + 1) * L;
    }

    /// @dev Warp to the first second after round `r` closes and record it.
    function closeRound(uint64 r) internal {
        vm.warp(roundEnd(r));
        mine.poke();
    }
}
