// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SeasonTestBase} from "../base/SeasonTestBase.sol";
import {ISeasonMine} from "../../src/interfaces/ISeasonMine.sol";
import {IRedemptionVault} from "../../src/interfaces/IRedemptionVault.sol";
import {ISeasonFactory} from "../../src/interfaces/ISeasonFactory.sol";

/// @dev Client decision 2026-09-08 (retro §6.1 + the 24 h escape hatch): the vault operator can abort a
///      season inside the rescue window. Before open that cancels it; after open it closes it early.
///      Either way every stake comes back in full, everything earned stays claimable, and the unmined
///      remainder returns to the operator at once instead of after the 30-day window.
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
        assertFalse(mine.closedByOperator());

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

    function test_abort_after_open_closes_early_and_keeps_earned() public {
        uint256 a = activateRig(ann, 1_000e18); // 1e21 hash: block 0 alone would take 5.5 years
        uint256 b = activateRig(bo, 2_000e18);
        open();
        vm.warp(OPEN + 1 days - 1); // last second of the window
        vm.expectEmit(true, true, true, true);
        emit ISeasonMine.ClosedByOperator(0, uint256(OPEN + 1 days - 1) * WAD);
        mine.abort();

        assertEq(uint8(mine.phase()), uint8(ISeasonMine.Phase.Closed));
        assertTrue(mine.closedByOperator());
        assertFalse(mine.cancelled());
        assertEq(mine.closeX(), uint256(OPEN + 1 days - 1) * WAD);
        assertEq(mine.shift(), 0, "still in the first shift");

        // 3000 hash × 86,399 s × 5,000,000 / 1.728e11 = 7,499.9 fragments for block 0 in total.
        uint256 cap = mine.claimableCap(0);
        assertEq(cap, 7_499 + 1, "paid work's worth plus one fragment of margin");
        assertEq(mine.claimableCap(1), 0);
        assertEq(mine.claimableCap(3), 0);
        assertApproxEqAbs(mine.pending(a, 0), 2_500, 1);
        assertApproxEqAbs(mine.pending(b, 0), 5_000, 1);
        assertLe(mine.pending(a, 0) + mine.pending(b, 0), cap);

        // Time passes: nothing more accrues, the season is closed for good.
        vm.warp(OPEN + 3 days);
        assertApproxEqAbs(mine.pending(a, 0), 2_500, 1);
        vm.expectRevert(abi.encodeWithSelector(ISeasonMine.WrongPhase.selector, ISeasonMine.Phase.Closed));
        mine.abort();

        // Players claim and withdraw exactly as after any close: full deposit, no fee.
        uint256 before = rig.balanceOf(ann);
        vm.startPrank(ann);
        uint256[4] memory got = mine.claimAll(a);
        mine.withdraw(a);
        vm.stopPrank();
        assertApproxEqAbs(got[0], 2_500, 1);
        assertEq(rig.balanceOf(ann) - before, 1_000e18);

        // The operator takes the unmined remainder now; the vault keeps the cap's worth behind.
        uint256[4] memory poolBefore;
        for (uint256 i; i < 4; ++i) {
            stocks[i].setAllowed(operator, true);
            poolBefore[i] = stocks[i].balanceOf(operator);
        }
        vault.rescue();
        uint256 kept = (cap * WAD + vault.fragPerToken() - 1) / vault.fragPerToken();
        assertEq(stocks[0].balanceOf(address(vault)), kept, "cap's worth of NVDA stays");
        assertEq(stocks[0].balanceOf(operator) - poolBefore[0], POOL[0] - kept);
        for (uint256 i = 1; i < 4; ++i) {
            assertEq(stocks[i].balanceOf(address(vault)), 0, "unmined blocks fully returned");
            assertEq(stocks[i].balanceOf(operator) - poolBefore[i], POOL[i]);
        }
        // Reserve: the mined share is 7,500 / 5,000,000 of block 0 and nothing of the others, averaged.
        uint256 keptUsdc = (50_000e6 * ((cap * WAD) / mine.fragmentSupply(0))) / 4 / WAD;
        assertEq(vault.reserve(), keptUsdc);
        assertEq(usdc.balanceOf(operator), 50_000e6 - keptUsdc);

        // Redemption still works for everything claimed, in kind and for USDG.
        elig.set(ann, true);
        stocks[0].setAllowed(ann, true);
        vm.prank(ann);
        uint256 tokens = vault.redeem(0, got[0]);
        assertEq(tokens, (got[0] * WAD) / 1_000_000);
        vm.prank(bo);
        mine.claimAll(b);
        oracle.set(address(stocks[0]), 200e8, uint64(block.timestamp));
        vm.prank(bo);
        uint256 net = vault.cashOut(0, 1_000);
        assertGt(net, 0);
        // A cash-out burns fragments without taking stock, so the stock behind them is freed for the
        // operator; a second rescue takes exactly that and nothing else.
        uint256 opBefore = stocks[0].balanceOf(operator);
        vault.rescue();
        assertEq(stocks[0].balanceOf(operator) - opBefore, (1_000 * WAD) / 1_000_000);
        assertEq(stocks[0].balanceOf(address(vault)), vault.requiredOf(0));
    }

    function test_abort_window_closes_after_24h() public {
        activateRig(ann, 1_000e18);
        open();
        vm.warp(OPEN + 1 days + 1);
        vm.expectRevert(ISeasonMine.RescueWindowClosed.selector);
        mine.abort();
        // ...and the vault refuses a rescue on a season that was never aborted.
        vm.expectRevert(IRedemptionVault.NotAborted.selector);
        vault.rescue();
    }

    function test_abort_allowed_while_paused() public {
        activateRig(ann, 1_000e18);
        open();
        vm.prank(treasury);
        mine.pause();
        vm.warp(OPEN + 1 hours);
        mine.abort();
        assertTrue(mine.closedByOperator());
        // Claims and withdrawals ignore the pause once the close is persisted (audit R2).
        vm.prank(ann);
        mine.withdraw(0);
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
