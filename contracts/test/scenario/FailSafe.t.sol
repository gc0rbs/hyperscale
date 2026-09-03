// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SeasonTestBase} from "../base/SeasonTestBase.sol";
import {ISeasonMine} from "../../src/interfaces/ISeasonMine.sol";

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
}
