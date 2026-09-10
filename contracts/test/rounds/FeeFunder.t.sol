// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {RoundTestBase} from "./RoundTestBase.sol";
import {IFeeFunder} from "../../src/interfaces/IFeeFunder.sol";
import {FeeFunder} from "../../src/rounds/FeeFunder.sol";
import {MockV3Pool} from "../../src/mocks/MockV3Pool.sol";
import {MockWETH} from "../../src/mocks/MockWETH.sol";
import {MockFeeEscrow, MockPonsSweeper} from "../../src/mocks/MockPonsV2.sol";

/// @dev docs/13 §2 "Funding": Pons V2 credits the creator fee recipient (the FeeFunder) in its fee
///      escrow once the pending fees are swept; a flusher sweeps, claims, turns all the ETH into the
///      four stocks on their WETH pools and funds the running round, bounded by its quoted minimums.
contract FeeFunderTest is RoundTestBase {
    MockWETH internal weth;
    MockV3Pool[4] internal pools;
    MockFeeEscrow internal escrow;
    MockPonsSweeper internal curve; // the bonding curve before graduation
    MockPonsSweeper internal hook; // the meme hook after it
    FeeFunder internal funder;
    address internal flusher = makeAddr("flusher");
    address internal ponsOperator = makeAddr("ponsOperator");
    bytes32 internal constant POOL_ID = keccak256("pool");
    uint256[4] internal RATE = [uint256(10e18), 2e18, 1e18, 4e18]; // stock per WETH

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
        funder = new FeeFunder(address(this), address(mine), address(weth), legs, flusher);
        assertTrue(funder.flushers(flusher), "constructor flusher");
        for (uint8 s; s < 4; ++s) {
            stocks[s].setAllowed(address(funder), true);
        }
        // The Pons V2 side: the escrow, and the curve/hook holding the pending creator fees, both
        // launched with the funder as the creator fee recipient.
        escrow = new MockFeeEscrow();
        curve = new MockPonsSweeper(escrow, ponsOperator, address(funder));
        hook = new MockPonsSweeper(escrow, ponsOperator, address(funder));
        vm.deal(address(this), 100 ether);
        weth.deposit{value: 50 ether}();
        funder.setCollects(_collects());
    }

    function _collects() internal view returns (IFeeFunder.Collect[] memory c) {
        c = new IFeeFunder.Collect[](3);
        c[0] = IFeeFunder.Collect(address(curve), abi.encodeWithSignature("sweepFees(uint256)", 0));
        c[1] = IFeeFunder.Collect(address(hook), abi.encodeWithSignature("sweepPoolFees(bytes32,uint256,uint256)", POOL_ID, 0, 0));
        c[2] = IFeeFunder.Collect(address(escrow), abi.encodeWithSignature("claim()"));
    }

    /// @dev The mock prices token1 per token0; orient the rate so it always reads "stock per WETH".
    function _rateFor(uint8 s) internal view returns (uint256) {
        return address(weth) < address(stocks[s]) ? RATE[s] : 1e36 / RATE[s];
    }

    function _expectedOut(uint8 s, uint256 wethIn) internal view returns (uint256) {
        MockV3Pool p = pools[s];
        return p.token0() == address(weth) ? (wethIn * p.outPerIn()) / 1e18 : (wethIn * 1e18) / p.outPerIn();
    }

    function _zeros() internal pure returns (uint256[] memory z) {
        z = new uint256[](4);
    }

    function test_flush_sweeps_claims_from_the_escrow_and_funds_the_running_round() public {
        vm.warp(roundStart(2) + 100);
        curve.accrue{value: 0.3 ether}(); // pending on the curve (pre-graduation trades)
        hook.accrue{value: 0.7 ether}(); // pending on the hook (post-graduation trades)
        assertEq(funder.pending(), 0, "nothing held before the flush: Pons holds it");

        vm.prank(ann);
        vm.expectRevert(IFeeFunder.NotFlusher.selector);
        funder.flush(_zeros());

        vm.prank(flusher);
        (uint256 wethIn, uint256[] memory out) = funder.flush(_zeros());
        assertEq(wethIn, 1 ether, "0.3 from the curve + 0.7 from the hook, claimed from the escrow");
        assertEq(out[0], _expectedOut(0, 0.15 ether));
        assertEq(out[3], _expectedOut(3, 0.4 ether));
        for (uint8 s; s < 4; ++s) {
            assertEq(mine.pot(2, s), out[s], "funded into the running round");
            assertEq(stocks[s].balanceOf(address(vault)), out[s]);
            assertEq(stocks[s].balanceOf(address(funder)), 0, "nothing sticks to the funder");
        }
        assertEq(funder.pending(), 0);
        assertEq(escrow.balanceOf(address(funder)), 0, "the escrow was emptied");
        vm.prank(flusher);
        vm.expectRevert(IFeeFunder.NothingToFlush.selector);
        funder.flush(_zeros());
    }

    function test_fees_swept_by_the_pons_operator_are_claimed_too() public {
        hook.accrue{value: 1 ether}();
        vm.prank(ponsOperator);
        hook.sweepPoolFees(POOL_ID, 0, 0); // Pons sweeps on its own schedule; the funder is credited
        assertEq(escrow.balanceOf(address(funder)), 1 ether);
        vm.prank(flusher);
        (uint256 wethIn,) = funder.flush(_zeros());
        assertEq(wethIn, 1 ether);
    }

    function test_plain_eth_and_pushed_weth_still_flush_without_collects() public {
        funder.setCollects(new IFeeFunder.Collect[](0));
        assertEq(funder.collectCount(), 0);
        vm.warp(roundStart(1) + 10);
        (bool ok,) = address(funder).call{value: 0.5 ether}("");
        assertTrue(ok);
        weth.transfer(address(funder), 0.5 ether);
        assertEq(funder.pending(), 1 ether);
        vm.prank(flusher);
        (uint256 wethIn, uint256[] memory out) = funder.flush(_zeros());
        assertEq(wethIn, 1 ether);
        assertEq(out[1], _expectedOut(1, 0.2 ether));
        assertEq(mine.pot(1, 1), out[1]);
    }

    function test_failing_collect_calls_do_not_block_a_flush_of_what_is_held() public {
        weth.transfer(address(funder), 1 ether);
        vm.prank(flusher);
        (uint256 wethIn,) = funder.flush(_zeros()); // sweeps revert NothingToSweep, claim reverts NothingToClaim: swallowed
        assertEq(wethIn, 1 ether);
        // A collect pointing at a contract that always reverts, or at no contract at all, is skipped too.
        IFeeFunder.Collect[] memory c = new IFeeFunder.Collect[](2);
        c[0] = IFeeFunder.Collect(makeAddr("nobody"), hex"deadbeef");
        c[1] = IFeeFunder.Collect(address(escrow), abi.encodeWithSignature("claim()"));
        funder.setCollects(c);
        escrow.credit{value: 0.4 ether}(address(funder));
        vm.prank(flusher);
        (wethIn,) = funder.flush(_zeros());
        assertEq(wethIn, 0.4 ether);
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
        funder.flush(minOut);
        assertEq(funder.pending(), 1 ether);
        for (uint8 s; s < 4; ++s) {
            minOut[s] = (minOut[s] * 95) / 100;
        }
        vm.prank(flusher);
        funder.flush(minOut);
        assertEq(funder.pending(), 0);
    }

    function test_callback_only_from_a_configured_pool_and_only_weth() public {
        weth.transfer(address(funder), 1 ether);
        vm.prank(ann);
        vm.expectRevert(IFeeFunder.NotPool.selector);
        funder.uniswapV3SwapCallback(1, 0, "");
        // A stock pool may only pull WETH, never the stock side.
        bool wethIs0 = pools[0].token0() == address(weth);
        vm.prank(address(pools[0]));
        vm.expectRevert(IFeeFunder.NotPool.selector);
        funder.uniswapV3SwapCallback(wethIs0 ? int256(0) : int256(1), wethIs0 ? int256(1) : int256(0), "");
        // A pool the owner removed can no longer pull either.
        IFeeFunder.Leg[] memory legs = new IFeeFunder.Leg[](1);
        legs[0] = IFeeFunder.Leg({pool: address(pools[0]), stock: 0, shareBps: 10_000});
        funder.setLegs(legs);
        vm.prank(address(pools[1]));
        vm.expectRevert(IFeeFunder.NotPool.selector);
        funder.uniswapV3SwapCallback(1, 0, "");
    }

    function test_collects_and_legs_are_validated() public {
        IFeeFunder.Collect[] memory c = new IFeeFunder.Collect[](1);
        // A collect may never target WETH, the mine or a configured pool (it runs as this contract).
        c[0] = IFeeFunder.Collect(address(weth), abi.encodeWithSignature("transfer(address,uint256)", ann, 1 ether));
        vm.expectRevert(IFeeFunder.BadCollect.selector);
        funder.setCollects(c);
        c[0] = IFeeFunder.Collect(address(pools[0]), "");
        vm.expectRevert(IFeeFunder.BadCollect.selector);
        funder.setCollects(c);
        c[0] = IFeeFunder.Collect(address(mine), "");
        vm.expectRevert(IFeeFunder.BadCollect.selector);
        funder.setCollects(c);
        c[0] = IFeeFunder.Collect(address(0), "");
        vm.expectRevert(IFeeFunder.BadCollect.selector);
        funder.setCollects(c);
        c = new IFeeFunder.Collect[](9);
        for (uint256 i; i < 9; ++i) c[i] = IFeeFunder.Collect(address(escrow), "");
        vm.expectRevert(IFeeFunder.BadCollect.selector);
        funder.setCollects(c);
        vm.prank(ann);
        vm.expectRevert(IFeeFunder.NotOwner.selector);
        funder.setCollects(_collects());
        // Legs: shares sum to 100%, the pool pairs WETH with the named stock, never a collect target.
        IFeeFunder.Leg[] memory legs = new IFeeFunder.Leg[](2);
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
    }

    function test_only_the_recipient_or_the_pons_operator_may_sweep() public {
        hook.accrue{value: 1 ether}();
        vm.prank(ann);
        vm.expectRevert(MockPonsSweeper.NotFeeSweepOperator.selector);
        hook.sweepPoolFees(POOL_ID, 0, 0);
        vm.prank(address(funder));
        hook.sweepPoolFees(POOL_ID, 0, 0);
        assertEq(escrow.balanceOf(address(funder)), 1 ether);
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
        funder.flush(_zeros());
        assertEq(funder.pending(), 1 ether);
        funder.sweep(address(weth), bo, 1 ether);
        assertEq(weth.balanceOf(bo), 1 ether);
    }
}
