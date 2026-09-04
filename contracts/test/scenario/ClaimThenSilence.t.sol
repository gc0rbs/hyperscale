// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SeasonTestBase} from "../base/SeasonTestBase.sol";

/// @dev Reproduces the e2e sequence: one rig, overclock at open, claim block 1 while block 2 is
///      in progress, then no transactions until after close. Blocks 2–4 must still be paid.
contract ClaimThenSilenceTest is SeasonTestBase {
    function test_claim_midblock_then_silence_until_close() public {
        fundPlayer(ann, 10_000_000e18, 0);
        uint256 a = activateRig(ann, 10_000_000e18);
        gpu(ann, a, 1);
        open();
        overclockN(ann, a, 1);
        // warp past block 1 without poking
        vm.warp(OPEN + 17_000);
        vm.prank(ann);
        uint256[4] memory got = mine.claimAll(a);
        assertGt(got[0], 0, "block 1 claimed");
        assertEq(mine.pending(a, 0), 0);
        uint256 p1AtClaim = mine.pending(a, 1);
        // silence until well after close
        vm.warp(OPEN + 10 days);
        assertEq(mine.closeX(), 0, "not poked yet");
        uint256 p1 = mine.pending(a, 1);
        uint256 p2 = mine.pending(a, 2);
        uint256 p3 = mine.pending(a, 3);
        assertGe(p1, p1AtClaim);
        assertGt(p2, 0, "block 3 paid");
        assertGt(p3, 0, "block 4 paid");
        vm.prank(ann);
        got = mine.claimAll(a);
        assertGt(got[1] + got[2] + got[3], 0);
    }
}
