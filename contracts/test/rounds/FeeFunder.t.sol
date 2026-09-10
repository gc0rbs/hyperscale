// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {RoundTestBase} from "./RoundTestBase.sol";
import {IFeeFunder} from "../../src/interfaces/IFeeFunder.sol";
import {FeeFunder} from "../../src/rounds/FeeFunder.sol";
import {MockV3Pool} from "../../src/mocks/MockV3Pool.sol";
import {MockWETH} from "../../src/mocks/MockWETH.sol";
import {MockPonsLocker} from "../../src/mocks/MockPonsLocker.sol";

/// @dev docs/13 §2 "Funding": the Pons locker pays the creator's fee share (WETH + the game token) to
///      the FeeFunder; a flusher collects, sells the token half, turns all the WETH into the four
///      stocks on their WETH pools and funds the running round, bounded by its quoted minimums.
contract FeeFunderTest is RoundTestBase {
    MockWETH internal weth;
    MockV3Pool[4] internal pools;
    MockV3Pool internal rigPool; // $VRAM / WETH: the Pons pool
    MockPonsLocker internal locker;
    FeeFunder internal funder;
    address internal flusher = makeAddr("flusher");
    address internal ponsDeployer = makeAddr("ponsDeployer");
    uint256[4] internal RATE = [uint256(10e18), 2e18, 1e18, 4e18]; // stock per WETH
    uint256 internal constant RIG_PER_WETH = 1_000_000e18; // 1 WETH buys 1M VRAM on the mock pool

    function setUp() public override {
        super.setUp();
        weth = new MockWETH();
        IFeeFunder.Leg[] memory legs = new IFeeFunder.Leg[](4);
        uint16[4] memory share = [uint16(1500), 2000, 2500, 4000];
        for (uint8 s; s < 4; ++s) {
            pools[s] = new MockV3Pool(address(weth), address(stocks[s]), 3000, _rateFor(s));
            stocks[s].setAllowed(address(pools[s]), true);
            stocks[s].mint(address(pools[s]), 1_000e18);
            legs[s] = IFeeFunder.Leg({pool: address(pools[s]), stock: s, shareBps: share[s]});
        }
        funder = new FeeFunder(address(this), address(mine), address(weth), legs);
        funder.setFlusher(flusher, true);
        for (uint8 s; s < 4; ++s) {
            stocks[s].setAllowed(address(funder), true);
        }
        // The Pons side: the token's WETH pool (1% tier) and the locker that pays the fee share.
        bool wethIs0 = address(weth) < address(rig);
        rigPool = new MockV3Pool(address(weth), address(rig), 10_000, wethIs0 ? RIG_PER_WETH : 1e36 / RIG_PER_WETH);
        vm.deal(address(this), 100 ether);
        weth.deposit{value: 50 ether}();
        weth.transfer(address(rigPool), 20 ether); // the pool holds WETH to pay for VRAM
        locker = new MockPonsLocker(address(weth));
        locker.register(address(rig), ponsDeployer);
        vm.prank(ponsDeployer);
        locker.setFeeRedirect(address(rig), address(funder)); // what the token deployer does after launch
        funder.setSource(IFeeFunder.Source({locker: address(locker), token: address(rig), pool: address(rigPool)}));
    }

    /// @dev The mock prices token1 per token0; orient the rate so it always reads "stock per WETH".
    function _rateFor(uint8 s) internal view returns (uint256) {
        return address(weth) < address(stocks[s]) ? RATE[s] : 1e36 / RATE[s];
    }

    function _expectedOut(uint8 s, uint256 wethIn) internal view returns (uint256) {
        MockV3Pool p = pools[s];
        return p.token0() == address(weth) ? (wethIn * p.outPerIn()) / 1e18 : (wethIn * 1e18) / p.outPerIn();
    }

    /// @dev Fees accrue on the locker: it must hold the assets it will pay out.
    function _accrue(uint256 wethAmount, uint256 rigAmount) internal {
        weth.transfer(address(locker), wethAmount);
        rig.transfer(address(locker), rigAmount);
        locker.accrue(address(rig), wethAmount, rigAmount);
    }

    function _zeros() internal pure returns (uint256[] memory z) {
        z = new uint256[](4);
    }

    function test_flush_collects_from_pons_sells_the_token_half_and_funds_the_running_round() public {
        vm.warp(roundStart(2) + 100);
        _accrue(0.7 ether, 300_000e18); // 0.7 WETH + 300k VRAM owed to the fee wallet
        assertEq(funder.pending(), 0, "nothing held before the flush: the locker holds it");

        vm.prank(ann);
        vm.expectRevert(IFeeFunder.NotFlusher.selector);
        funder.flush(0, _zeros());

        vm.prank(flusher);
        (uint256 wethIn, uint256 wethFromToken, uint256[] memory out) = funder.flush(0, _zeros());
        assertEq(wethFromToken, 0.3 ether, "300k VRAM sold at 1M per WETH");
        assertEq(wethIn, 1 ether, "0.7 collected + 0.3 from the token sale");
        assertEq(out[0], _expectedOut(0, 0.15 ether));
        assertEq(out[3], _expectedOut(3, 0.4 ether));
        for (uint8 s; s < 4; ++s) {
            assertEq(mine.pot(2, s), out[s], "funded into the running round");
            assertEq(stocks[s].balanceOf(address(vault)), out[s]);
            assertEq(stocks[s].balanceOf(address(funder)), 0, "nothing sticks to the funder");
        }
        assertEq(funder.pending(), 0);
        assertEq(funder.pendingToken(), 0, "every VRAM was sold");
        assertEq(rig.balanceOf(address(rigPool)), 300_000e18, "the pool got the VRAM");
        vm.prank(flusher);
        vm.expectRevert(IFeeFunder.NothingToFlush.selector);
        funder.flush(0, _zeros());
    }

    function test_plain_eth_and_pushed_weth_still_flush_without_a_locker() public {
        funder.setSource(IFeeFunder.Source({locker: address(0), token: address(0), pool: address(0)}));
        vm.warp(roundStart(1) + 10);
        (bool ok,) = address(funder).call{value: 0.5 ether}("");
        assertTrue(ok);
        weth.transfer(address(funder), 0.5 ether);
        assertEq(funder.pending(), 1 ether);
        vm.prank(flusher);
        (uint256 wethIn, uint256 fromToken, uint256[] memory out) = funder.flush(0, _zeros());
        assertEq(wethIn, 1 ether);
        assertEq(fromToken, 0);
        assertEq(out[1], _expectedOut(1, 0.2 ether));
        assertEq(mine.pot(1, 1), out[1]);
    }

    function test_locker_with_nothing_owed_does_not_block_a_flush_of_what_is_held() public {
        weth.transfer(address(funder), 1 ether);
        vm.prank(flusher);
        (uint256 wethIn,,) = funder.flush(0, _zeros()); // collectFees reverts NoFeesToCollect, swallowed
        assertEq(wethIn, 1 ether);
    }

    function test_token_sale_is_guarded_by_its_own_minimum() public {
        _accrue(0, 100_000e18);
        vm.prank(flusher);
        vm.expectRevert(abi.encodeWithSelector(IFeeFunder.TokenSlippage.selector, 0.1 ether, 0.11 ether));
        funder.flush(0.11 ether, _zeros());
        // The collected VRAM now sits on the funder (the locker paid it out before the revert was
        // simulated away by the caller); a flush with the right bound sells it.
        vm.prank(flusher);
        (, uint256 fromToken,) = funder.flush(0.1 ether, _zeros());
        assertEq(fromToken, 0.1 ether);
    }

    function test_min_out_guards_against_a_moved_price() public {
        weth.transfer(address(funder), 1 ether);
        uint256[] memory minOut = new uint256[](4);
        for (uint8 s; s < 4; ++s) {
            minOut[s] = _expectedOut(s, (1 ether * uint256(funder.leg(s).shareBps)) / 10_000);
        }
        // The price on pool 1 moves 5% against us before the flush lands: the whole flush reverts, WETH stays.
        bool wethIs0 = pools[1].token0() == address(weth);
        pools[1].setRate(wethIs0 ? (pools[1].outPerIn() * 95) / 100 : (pools[1].outPerIn() * 100) / 95);
        vm.prank(flusher);
        vm.expectPartialRevert(IFeeFunder.Slippage.selector);
        funder.flush(0, minOut);
        assertEq(funder.pending(), 1 ether);
        for (uint8 s; s < 4; ++s) {
            minOut[s] = (minOut[s] * 95) / 100;
        }
        vm.prank(flusher);
        funder.flush(0, minOut);
        assertEq(funder.pending(), 0);
    }

    function test_callback_only_from_a_configured_pool_and_only_its_input_asset() public {
        weth.transfer(address(funder), 1 ether);
        rig.transfer(address(funder), 1e18);
        vm.prank(ann);
        vm.expectRevert(IFeeFunder.NotPool.selector);
        funder.uniswapV3SwapCallback(1, 0, "");
        // A stock pool may only pull WETH; the token pool may only pull VRAM.
        bool wethIs0 = pools[0].token0() == address(weth);
        vm.prank(address(pools[0]));
        vm.expectRevert(IFeeFunder.NotPool.selector);
        funder.uniswapV3SwapCallback(wethIs0 ? int256(0) : int256(1), wethIs0 ? int256(1) : int256(0), "");
        bool rigIs0 = rigPool.token0() == address(rig);
        vm.prank(address(rigPool));
        vm.expectRevert(IFeeFunder.NotPool.selector);
        funder.uniswapV3SwapCallback(rigIs0 ? int256(0) : int256(1), rigIs0 ? int256(1) : int256(0), "");
        // A pool the owner removed can no longer pull either.
        IFeeFunder.Leg[] memory legs = new IFeeFunder.Leg[](1);
        legs[0] = IFeeFunder.Leg({pool: address(pools[0]), stock: 0, shareBps: 10_000});
        funder.setLegs(legs);
        vm.prank(address(pools[1]));
        vm.expectRevert(IFeeFunder.NotPool.selector);
        funder.uniswapV3SwapCallback(1, 0, "");
        funder.setSource(IFeeFunder.Source({locker: address(0), token: address(rig), pool: address(0)}));
        vm.prank(address(rigPool));
        vm.expectRevert(IFeeFunder.NotPool.selector);
        funder.uniswapV3SwapCallback(1, 0, "");
    }

    function test_source_and_legs_are_validated() public {
        // The token pool must pair WETH with the token, and the token must be named with a locker.
        vm.expectRevert(IFeeFunder.BadSource.selector);
        funder.setSource(IFeeFunder.Source({locker: address(locker), token: address(0), pool: address(0)}));
        vm.expectRevert(IFeeFunder.BadSource.selector);
        funder.setSource(IFeeFunder.Source({locker: address(0), token: address(rig), pool: address(pools[0])}));
        vm.expectRevert(IFeeFunder.BadSource.selector);
        funder.setSource(IFeeFunder.Source({locker: address(0), token: address(stocks[0]), pool: address(pools[0])}));
        // A stock leg can never reuse the token's pool.
        IFeeFunder.Leg[] memory legs = new IFeeFunder.Leg[](1);
        legs[0] = IFeeFunder.Leg({pool: address(rigPool), stock: 0, shareBps: 10_000});
        vm.expectRevert(IFeeFunder.BadLegs.selector);
        funder.setLegs(legs);
        legs = new IFeeFunder.Leg[](2);
        legs[0] = IFeeFunder.Leg({pool: address(pools[0]), stock: 0, shareBps: 5000});
        legs[1] = IFeeFunder.Leg({pool: address(pools[1]), stock: 1, shareBps: 4000}); // 90%
        vm.expectRevert(IFeeFunder.BadLegs.selector);
        funder.setLegs(legs);
        legs[1] = IFeeFunder.Leg({pool: address(pools[1]), stock: 0, shareBps: 5000}); // pool 1 is not NVDA
        vm.expectRevert(IFeeFunder.BadLegs.selector);
        funder.setLegs(legs);
        vm.prank(ann);
        vm.expectRevert(IFeeFunder.NotOwner.selector);
        funder.setLegs(legs);
        vm.prank(ann);
        vm.expectRevert(IFeeFunder.NotOwner.selector);
        funder.setSource(IFeeFunder.Source({locker: address(0), token: address(0), pool: address(0)}));
    }

    function test_only_the_fee_recipient_can_collect_from_the_locker() public {
        _accrue(1 ether, 0);
        vm.prank(ann);
        vm.expectRevert(MockPonsLocker.NotAuthorized.selector);
        locker.collectFees(address(rig));
        vm.prank(address(funder));
        locker.collectFees(address(rig));
        assertEq(weth.balanceOf(address(funder)), 1 ether);
    }

    function test_owner_sweeps_eth_weth_and_tokens() public {
        vm.deal(address(funder), 2 ether);
        rig.transfer(address(funder), 5e18);
        stocks[2].mint(address(funder), 3e18);
        vm.prank(ann);
        vm.expectRevert(IFeeFunder.NotOwner.selector);
        funder.sweep(address(0), ann, 1 ether);
        funder.sweep(address(0), bo, 2 ether);
        assertEq(bo.balance, 2 ether);
        funder.sweep(address(rig), bo, 5e18);
        assertEq(rig.balanceOf(bo), 5e18);
        stocks[2].setAllowed(bo, true);
        funder.sweep(address(stocks[2]), bo, 3e18);
        assertEq(stocks[2].balanceOf(bo), 3e18);
    }

    function test_flush_reverts_when_the_mine_is_halted_and_funds_stay_sweepable() public {
        weth.transfer(address(funder), 1 ether);
        mine.halt();
        vm.prank(flusher);
        vm.expectRevert(); // RoundMine.fund reverts Halted
        funder.flush(0, _zeros());
        assertEq(funder.pending(), 1 ether);
        funder.sweep(address(weth), bo, 1 ether);
        assertEq(weth.balanceOf(bo), 1 ether);
    }
}
