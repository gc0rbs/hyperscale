// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SeasonTestBase} from "../base/SeasonTestBase.sol";

/// @dev FR-S3 / NFR-5: shift boundaries discovered retroactively after a long idle period are
///      identical to those discovered by frequent pokes, and so are every rig's earnings.
contract BoundaryExactnessTest is SeasonTestBase {
    function test_retroactive_boundaries_equal_incremental() public {
        fundPlayer(ann, 5_000_000e18, 0);
        fundPlayer(bo, 2_000_000e18, 1_000_000e18);
        uint256 a = activateRig(ann, 5_000_000e18);
        uint256 b = activateLp(bo, 1_000_000e18);
        gpu(ann, a, 1);
        open();
        overclockN(bo, b, 2);
        uint256 target = OPEN + 4 hours; // several shifts at 8.5M hash

        uint256 snap = vm.snapshotState();
        // Path A: poke every 60 seconds.
        for (uint256 t = OPEN + 60; t <= target; t += 60) {
            vm.warp(t);
            mine.poke();
        }
        vm.warp(target);
        mine.poke();
        uint16 shiftA = mine.shift();
        uint256[8] memory endsA;
        for (uint16 i; i < shiftA; ++i) {
            endsA[i] = mine.shiftEndX(i);
        }
        uint256 pa = mine.pending(a, 0);
        uint256 pb = mine.pending(b, 0);
        uint256 thA = mine.totalHash();

        vm.revertToState(snap);
        // Path B: one poke at the end.
        vm.warp(target);
        mine.poke();
        assertEq(mine.shift(), shiftA);
        assertGt(shiftA, 2, "several boundaries crossed");
        for (uint16 i; i < shiftA; ++i) {
            assertEq(mine.shiftEndX(i), endsA[i], "boundary X-time exact");
        }
        assertEq(mine.pending(a, 0), pa);
        assertEq(mine.pending(b, 0), pb);
        assertEq(mine.totalHash(), thA);
    }

    function test_overclock_one_second_before_shift_end_is_honoured_and_expires_next_shift() public {
        fundPlayer(ann, 10_000_000e18, 0);
        uint256 a = activateRig(ann, 10_000_000e18);
        open();
        // shift length at 10M hash = 2.16e10 / 1e7 = 2160 s
        vm.warp(OPEN + 2159);
        overclockN(ann, a, 1);
        assertEq(mine.rigs(a).ocExpiryShift, 1);
        vm.warp(OPEN + 2160);
        mine.poke();
        assertEq(mine.shift(), 1);
        assertEq(mine.rigHash(a), 15_000_000e18, "boosted through shift 1");
        // shift 1 is shorter because of the boost: 2.16e10 / 1.5e7 = 1440 s
        vm.warp(OPEN + 2160 + 1440);
        mine.poke();
        assertEq(mine.shift(), 2);
        assertEq(mine.rigHash(a), 10_000_000e18, "expired at the end of shift 1");
        assertEq(mine.totalHash(), 10_000_000e18);
    }
}
