// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SeasonTestBase} from "../base/SeasonTestBase.sol";
import {ISeasonMine} from "../../src/interfaces/ISeasonMine.sol";
import {IRedemptionVault} from "../../src/interfaces/IRedemptionVault.sol";

/// @dev FR-S2, FR-S7, FR-C5: a mine that cannot finish closes at maxDuration; earned-so-far is
///      claimable, the remainder stays in the vault, later blocks pay nothing.
contract FailSafeTest is SeasonTestBase {
    function test_failsafe_close_mid_block() public {
        fundPlayer(ann, 1_000e18, 0);
        uint256 a = activateRig(ann, 1_000e18); // 1e21 hash: block 1 would take 5.5 years
        open();
        vm.warp(OPEN + 30 days - 1);
        mine.poke();
        assertEq(uint8(mine.phase()), uint8(ISeasonMine.Phase.Open));
        vm.warp(OPEN + 30 days);
        mine.poke();
        assertEq(uint8(mine.phase()), uint8(ISeasonMine.Phase.Closed));
        assertEq(mine.closeX(), uint256(OPEN + 30 days) * WAD);
        assertEq(mine.shift(), 0, "still in the first shift");
        // 1000 hash × 2,592,000 s × 5,000,000 / 1.728e11 = 75,000 fragments
        assertApproxEqAbs(mine.pending(a, 0), 75_000, 1);
        assertEq(mine.pending(a, 1), 0);
        vm.startPrank(ann);
        uint256[4] memory got = mine.claimAll(a);
        assertApproxEqAbs(got[0], 75_000, 1);
        assertEq(got[1] + got[2] + got[3], 0);
        mine.withdraw(a);
        vm.stopPrank();
        assertApproxEqAbs(frags.balanceOf(ann, 0), 75_000, 1);
        // Time passes after close: nothing more accrues.
        vm.warp(OPEN + 40 days);
        assertEq(mine.pending(a, 0), 0, "settled and claimed; nothing new");
    }

    /// @dev The unmined remainder no longer waits for the redemption window.
    function test_unmined_remainder_sweeps_to_treasury_at_close() public {
        fundPlayer(ann, 1_000e18, 0);
        uint256 a = activateRig(ann, 1_000e18);
        open();
        vm.expectRevert(IRedemptionVault.NotClosed.selector);
        vault.sweepUnmined();
        vm.warp(OPEN + 30 days);
        mine.poke();
        uint256 cap = mine.claimableCap(0);
        // ratePerWork floors, so the "75,000" of work is worth 74,999.99 fragments; the cap adds one.
        assertEq(cap, 75_000, "work paid, floored, plus one fragment of margin");
        assertLe(mine.pending(a, 0), cap);
        assertEq(mine.claimableCap(1), 0);
        // Stock 1 refuses the treasury for now: it stays and is retried; the others move at once.
        stocks[0].setAllowed(treasury, true);
        stocks[2].setAllowed(treasury, true);
        stocks[3].setAllowed(treasury, true);
        vault.sweepUnmined();
        uint256 kept = (cap * WAD + 1_000_000 - 1) / 1_000_000;
        assertEq(stocks[0].balanceOf(address(vault)), kept);
        assertEq(stocks[0].balanceOf(treasury), POOL[0] - kept);
        assertEq(stocks[1].balanceOf(address(vault)), POOL[1], "hook refused: stays, does not block");
        assertEq(stocks[2].balanceOf(treasury), POOL[2]);
        assertEq(stocks[3].balanceOf(treasury), POOL[3]);
        assertEq(vault.reserve(), 50_000e6, "the USDG reserve stays for cash-outs");
        stocks[1].setAllowed(treasury, true);
        vault.sweepUnmined();
        assertEq(stocks[1].balanceOf(treasury), POOL[1]);
        // The player's claim and in-kind redemption are unaffected.
        vm.prank(ann);
        uint256[4] memory got = mine.claimAll(a);
        elig.set(ann, true);
        stocks[0].setAllowed(ann, true);
        vm.prank(ann);
        vault.redeem(0, got[0]);
        assertEq(stocks[0].balanceOf(ann), (got[0] * WAD) / 1_000_000);
        // After the window the ordinary sweep moves the dust that is left.
        vm.warp(vault.redemptionEnd() + 1);
        vault.sweep();
        assertEq(stocks[0].balanceOf(address(vault)), 0);
    }
}
