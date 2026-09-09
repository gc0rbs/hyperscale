// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {RoundTestBase} from "./RoundTestBase.sol";
import {IFeeFunder} from "../../src/interfaces/IFeeFunder.sol";
import {FeeFunder} from "../../src/rounds/FeeFunder.sol";
import {MockV3Pool} from "../../src/mocks/MockV3Pool.sol";
import {MockWETH} from "../../src/mocks/MockWETH.sol";

/// @dev docs/13 §2 "Funding": the Pons tax (ETH) lands on the FeeFunder; a flusher turns it into the
///      four stocks on their WETH pools and funds the running round, bounded by its quoted minOut.
contract FeeFunderTest is RoundTestBase {
    MockWETH internal weth;
    MockV3Pool[4] internal pools;
    FeeFunder internal funder;
    address internal flusher = makeAddr("flusher");
    address internal pons = makeAddr("pons");
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
        funder = new FeeFunder(address(this), address(mine), address(weth), legs);
        funder.setFlusher(flusher, true);
        for (uint8 s; s < 4; ++s) {
            stocks[s].setAllowed(address(funder), true);
        }
        vm.deal(pons, 100 ether);
    }

    /// @dev The mock prices token1 per token0; orient the rate so it always reads "stock per WETH".
    function _rateFor(uint8 s) internal view returns (uint256) {
        return address(weth) < address(stocks[s]) ? RATE[s] : 1e36 / RATE[s];
    }

    function _expectedOut(uint8 s, uint256 wethIn) internal view returns (uint256) {
        MockV3Pool p = pools[s];
        return p.token0() == address(weth) ? (wethIn * p.outPerIn()) / 1e18 : (wethIn * 1e18) / p.outPerIn();
    }

    function test_tax_lands_and_flush_funds_the_running_round() public {
        vm.warp(roundStart(2) + 100);
        vm.prank(pons);
        (bool ok,) = address(funder).call{value: 1 ether}(""); // Pons pays plain ETH
        assertTrue(ok);
        assertEq(funder.pending(), 1 ether);

        uint256[] memory minOut = new uint256[](4);
        vm.prank(ann);
        vm.expectRevert(IFeeFunder.NotFlusher.selector);
        funder.flush(minOut);

        vm.prank(flusher);
        uint256[] memory out = funder.flush(minOut);
        // 15% / 20% / 25% / 40% of 1 ETH at the mock rates.
        assertEq(out[0], _expectedOut(0, 0.15 ether));
        assertEq(out[3], _expectedOut(3, 0.4 ether));
        for (uint8 s; s < 4; ++s) {
            assertEq(mine.pot(2, s), out[s], "funded into the running round");
            assertEq(stocks[s].balanceOf(address(vault)), out[s]);
            assertEq(stocks[s].balanceOf(address(funder)), 0, "nothing sticks to the funder");
        }
        assertEq(funder.pending(), 0);
        assertEq(weth.balanceOf(address(funder)), 0, "every wei of WETH was spent");
        vm.prank(flusher);
        vm.expectRevert(IFeeFunder.NothingToFlush.selector);
        funder.flush(minOut);
    }

    function test_min_out_guards_against_a_moved_price() public {
        vm.deal(address(funder), 1 ether);
        uint256[] memory minOut = new uint256[](4);
        for (uint8 s; s < 4; ++s) {
            minOut[s] = _expectedOut(s, (1 ether * uint256(funder.leg(s).shareBps)) / 10_000);
        }
        // The price on pool 1 moves 5% against us before the flush lands: the whole flush reverts, ETH stays.
        bool wethIs0 = pools[1].token0() == address(weth);
        pools[1].setRate(wethIs0 ? (pools[1].outPerIn() * 95) / 100 : (pools[1].outPerIn() * 100) / 95);
        vm.prank(flusher);
        vm.expectPartialRevert(IFeeFunder.Slippage.selector);
        funder.flush(minOut);
        assertEq(funder.pending(), 1 ether);
        // With a 5% haircut it goes through.
        for (uint8 s; s < 4; ++s) {
            minOut[s] = (minOut[s] * 95) / 100;
        }
        vm.prank(flusher);
        funder.flush(minOut);
        assertEq(funder.pending(), 0);
    }

    function test_callback_only_from_a_configured_pool_and_only_weth() public {
        vm.deal(address(funder), 1 ether);
        vm.prank(ann);
        vm.expectRevert(IFeeFunder.NotPool.selector);
        funder.uniswapV3SwapCallback(1, 0, "");
        // A pool the owner removed can no longer pull either.
        IFeeFunder.Leg[] memory legs = new IFeeFunder.Leg[](1);
        legs[0] = IFeeFunder.Leg({pool: address(pools[0]), stock: 0, shareBps: 10_000});
        funder.setLegs(legs);
        vm.prank(address(pools[1]));
        vm.expectRevert(IFeeFunder.NotPool.selector);
        funder.uniswapV3SwapCallback(1, 0, "");
        assertEq(funder.legCount(), 1);
        vm.prank(flusher);
        uint256[] memory out = funder.flush(new uint256[](1));
        assertEq(out[0], _expectedOut(0, 1 ether), "everything into NVDA");
    }

    function test_legs_are_validated() public {
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

    function test_owner_sweeps_eth_and_tokens() public {
        vm.deal(address(funder), 2 ether);
        stocks[2].mint(address(funder), 3e18);
        vm.prank(ann);
        vm.expectRevert(IFeeFunder.NotOwner.selector);
        funder.sweep(address(0), ann, 1 ether);
        funder.sweep(address(0), bo, 2 ether);
        assertEq(bo.balance, 2 ether);
        stocks[2].setAllowed(bo, true);
        funder.sweep(address(stocks[2]), bo, 3e18);
        assertEq(stocks[2].balanceOf(bo), 3e18);
    }

    function test_flush_reverts_when_the_mine_is_halted_and_eth_stays_sweepable() public {
        vm.deal(address(funder), 1 ether);
        mine.halt();
        vm.prank(flusher);
        vm.expectRevert(); // RoundMine.fund reverts Halted
        funder.flush(new uint256[](4));
        assertEq(funder.pending(), 1 ether);
        funder.sweep(address(0), bo, 1 ether);
        assertEq(bo.balance, 1 ether);
    }
}
