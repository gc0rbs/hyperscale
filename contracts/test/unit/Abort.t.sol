// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SeasonTestBase} from "../base/SeasonTestBase.sol";
import {ISeasonMine} from "../../src/interfaces/ISeasonMine.sol";
import {IRedemptionVault} from "../../src/interfaces/IRedemptionVault.sol";
import {ISeasonFactory} from "../../src/interfaces/ISeasonFactory.sol";

/// @dev Client decision 2026-09-08 (retro §6.1 + the 24 h escape hatch): the vault operator can abort a
///      season inside the rescue window. It is cancelled: every stake comes back in full, every
///      fragment of the season is void, and the whole pool and reserve return to the operator at once
///      instead of after the 30-day window. The site states the window.
contract AbortTest is SeasonTestBase {
    address internal operator;

    function setUp() public override {
        super.setUp();
        operator = address(this); // the factory.create caller
        fundPlayer(ann, 1_000e18, 0);
        fundPlayer(bo, 2_000e18, 0);
    }

    function test_rescue_deadline_is_open_plus_window() public view {
        assertEq(mine.rescueDeadline(), OPEN + 24 hours);
        assertEq(vault.operator(), operator);
    }

    function test_abort_before_open_cancels_and_rescues_everything() public {
        uint256 a = activateRig(ann, 1_000e18);
        assertEq(uint8(mine.phase()), uint8(ISeasonMine.Phase.PreOpen));

        vm.prank(ann);
        vm.expectRevert(ISeasonMine.NotOperator.selector);
        mine.abort();

        vm.expectEmit(true, true, true, true);
        emit ISeasonMine.SeasonCancelled(uint64(block.timestamp));
        mine.abort();
        assertEq(uint8(mine.phase()), uint8(ISeasonMine.Phase.Cancelled));
        assertTrue(mine.cancelled());

        // No pause is needed: a cancelled season returns deposits on demand, in full.
        uint256 before = rig.balanceOf(ann);
        vm.prank(ann);
        mine.emergencyWithdraw(a);
        assertEq(rig.balanceOf(ann) - before, 1_000e18, "full deposit back");
        assertEq(mine.claimableCap(0), 0);

        // Nothing was mined, so the whole pool and reserve come back to the operator.
        uint256[4] memory poolBefore;
        for (uint256 b; b < 4; ++b) {
            stocks[b].setAllowed(operator, true);
            poolBefore[b] = stocks[b].balanceOf(operator);
        }
        vm.prank(ann);
        vm.expectRevert(IRedemptionVault.NotOperator.selector);
        vault.rescue();
        vault.rescue();
        for (uint256 b; b < 4; ++b) {
            assertEq(stocks[b].balanceOf(operator) - poolBefore[b], POOL[b], "pool back");
            assertEq(stocks[b].balanceOf(address(vault)), 0);
        }
        assertEq(usdc.balanceOf(operator), 50_000e6, "reserve back");
        assertEq(vault.reserve(), 0);
    }

    function test_abort_after_open_cancels_and_returns_the_full_pool() public {
        fundPlayer(ann, 10_000_000e18, 0);
        uint256 a = activateRig(ann, 10_000_000e18);
        open();
        // Block 0 is found and claimed inside the window; the client still gets everything back.
        warpToBlockFound();
        vm.prank(ann);
        uint256 claimed = mine.claim(a, 0);
        assertGt(claimed, 0);
        assertLt(block.timestamp, OPEN + 1 days, "still inside the rescue window");

        vm.expectEmit(true, true, true, true);
        emit ISeasonMine.SeasonCancelled(uint64(block.timestamp));
        mine.abort();
        assertEq(uint8(mine.phase()), uint8(ISeasonMine.Phase.Cancelled));
        assertEq(mine.closeX(), 0, "cancelled, not closed");
        uint16 shiftAt = mine.shift();

        // Frozen (audit B4): time passes, nothing moves, a second abort is refused.
        vm.warp(OPEN + 3 days);
        mine.poke();
        assertEq(mine.shift(), shiftAt);
        vm.expectRevert(abi.encodeWithSelector(ISeasonMine.WrongPhase.selector, ISeasonMine.Phase.Cancelled));
        mine.abort();

        // Every fragment of the season is void: unclaimed ones cannot be claimed, claimed ones cannot
        // be redeemed or cashed out; the stake comes back in full without a pause.
        vm.startPrank(ann);
        vm.expectRevert(abi.encodeWithSelector(ISeasonMine.NotFound.selector, 1));
        mine.claim(a, 1);
        vm.stopPrank();
        elig.set(ann, true);
        stocks[0].setAllowed(ann, true);
        vm.prank(ann);
        vm.expectRevert(IRedemptionVault.NotClosed.selector); // a cancelled season never closes
        vault.redeem(0, claimed);
        uint256 before = rig.balanceOf(ann);
        vm.prank(ann);
        mine.emergencyWithdraw(a);
        assertEq(rig.balanceOf(ann) - before, 10_000_000e18, "full deposit back, no fee");
        assertEq(mine.claimableCap(0), 0);

        // The operator takes the whole pool and reserve at once.
        for (uint256 i; i < 4; ++i) {
            stocks[i].setAllowed(operator, true);
        }
        uint256[4] memory poolBefore;
        for (uint256 i; i < 4; ++i) {
            poolBefore[i] = stocks[i].balanceOf(operator);
        }
        vault.rescue();
        for (uint256 i; i < 4; ++i) {
            assertEq(stocks[i].balanceOf(operator) - poolBefore[i], POOL[i], "whole pool back");
            assertEq(stocks[i].balanceOf(address(vault)), 0);
        }
        assertEq(usdc.balanceOf(operator), 50_000e6);
        assertEq(vault.reserve(), 0);
        // `sweepUnmined` is for closed seasons only; `sweep` on a cancelled one finds nothing left.
        vm.expectRevert(IRedemptionVault.NotClosed.selector);
        vault.sweepUnmined();
        vault.sweep();
    }

    function test_rescue_retries_an_asset_whose_hook_refused_the_operator() public {
        activateRig(ann, 1_000e18);
        mine.abort();
        for (uint256 i = 1; i < 4; ++i) {
            stocks[i].setAllowed(operator, false); // three of the four hooks refuse the operator for now
        }
        vault.rescue();
        assertEq(stocks[0].balanceOf(address(vault)), 0);
        assertEq(stocks[1].balanceOf(address(vault)), POOL[1], "hook refused: stays, does not block");
        assertEq(vault.reserve(), 0, "the reserve moved anyway");
        for (uint256 i = 1; i < 4; ++i) {
            stocks[i].setAllowed(operator, true);
        }
        vault.rescue();
        for (uint256 i; i < 4; ++i) {
            assertEq(stocks[i].balanceOf(address(vault)), 0);
        }
    }

    function test_abort_window_closes_after_24h() public {
        activateRig(ann, 1_000e18);
        open();
        vm.warp(OPEN + 1 days + 1);
        vm.expectRevert(ISeasonMine.RescueWindowClosed.selector);
        mine.abort();
        // ...and the vault refuses a rescue on a season that was never cancelled.
        vm.expectRevert(IRedemptionVault.NotCancelled.selector);
        vault.rescue();
    }

    function test_abort_allowed_while_paused() public {
        activateRig(ann, 1_000e18);
        open();
        vm.prank(treasury);
        mine.pause();
        vm.warp(OPEN + 1 hours);
        mine.abort();
        assertTrue(mine.cancelled());
        // No grace period needed: the deposit comes back at once.
        vm.prank(ann);
        mine.emergencyWithdraw(0);
    }

    function test_abort_unfunded_season_cancels_it() public {
        ISeasonMine.SeasonParams memory p = defaultParams();
        (, address m,,) = factory.create(p, address(elig), address(oracle), address(usdc), false);
        ISeasonMine dead = ISeasonMine(m);
        vm.warp(OPEN + 2 hours);
        dead.abort();
        assertEq(
            uint8(dead.phase()), uint8(ISeasonMine.Phase.Cancelled), "never funded: cancelled, not closed"
        );
    }

    function test_rescue_window_zero_disables_abort() public {
        ISeasonMine.SeasonParams memory p = defaultParams();
        p.rescueWindowSeconds = 0;
        (, address m,,) = factory.create(p, address(elig), address(oracle), address(usdc), false);
        vm.expectRevert(ISeasonMine.RescueWindowClosed.selector);
        ISeasonMine(m).abort();
    }

    function test_factory_bounds_new_params() public {
        ISeasonMine.SeasonParams memory p = defaultParams();
        p.rescueWindowSeconds = 7 days + 1;
        vm.expectRevert(abi.encodeWithSelector(ISeasonFactory.InvalidParams.selector, "rescue window"));
        factory.create(p, address(elig), address(oracle), address(usdc), false);
        p = defaultParams();
        p.maxPriceAgeSeconds = 1 hours - 1;
        vm.expectRevert(abi.encodeWithSelector(ISeasonFactory.InvalidParams.selector, "price age"));
        factory.create(p, address(elig), address(oracle), address(usdc), false);
    }

    function test_claimable_cap_reverts_while_open() public {
        open();
        vm.expectRevert(abi.encodeWithSelector(ISeasonMine.WrongPhase.selector, ISeasonMine.Phase.Open));
        mine.claimableCap(0);
    }
}
