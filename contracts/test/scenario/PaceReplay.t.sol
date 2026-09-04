// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SeasonTestBase} from "../base/SeasonTestBase.sol";
import {ISeasonMine} from "../../src/interfaces/ISeasonMine.sol";

/// @dev G5 / FR-M4: the same action script, expressed in mine progress, replayed at three total-hash
///      levels (about 6h, 24h and 16 days of wall clock) must produce the same fragment distribution.
///      Actions are taken at whole seconds, so distributions agree to within the documented dust.
contract PaceReplayTest is SeasonTestBase {
    address internal dee = makeAddr("dee");

    function _script(uint256 scaleNum, uint256 scaleDen) internal returns (uint256[4][4] memory out) {
        uint256 s1 = (5_000_000e18 * scaleNum) / scaleDen;
        uint256 s2 = (1_000_000e18 * scaleNum) / scaleDen;
        uint256 s3 = (2_500_000e18 * scaleNum) / scaleDen;
        uint256 s4 = (1_000_000e18 * scaleNum) / scaleDen;
        fundPlayer(ann, s1, 0);
        fundPlayer(bo, s2 * 3, s2);
        fundPlayer(cy, s3, 0);
        fundPlayer(dee, s4, 0);
        uint256 a = activateRig(ann, s1);
        uint256 b = activateLp(bo, s2);
        uint256 c = activateRig(cy, s3);
        gpu(ann, a, 2);
        gpu(bo, b, 3);
        cooling(bo, b, 3);
        open();
        overclockN(bo, b, 3); // shift 0
        uint256 d = type(uint256).max;
        while (mine.closeX() == 0) {
            uint16 sh = mine.shift();
            if (sh == 3) {
                // 37% into shift 3: Cy overclocks once.
                ISeasonMine.Eta memory e = mine.eta();
                vm.warp(block.timestamp + (e.toShiftEnd * 37) / 100);
                overclockN(cy, c, 1);
            }
            if (sh == 5) gpu(ann, a, 3);
            if (sh == 9) {
                vm.prank(cy);
                mine.exit(c);
            }
            if (sh == 12) d = activateRig(dee, s4);
            if (sh == 20) overclockN(bo, b, 2);
            if (sh % 2 == 0 && sh <= 6) {
                if (sh > 0) overclockN(bo, b, 3);
            }
            warpToShiftEnd();
        }
        uint256[4] memory ids = [a, b, c, d];
        for (uint256 i; i < 4; ++i) {
            for (uint8 k; k < 4; ++k) {
                out[i][k] = mine.pending(ids[i], k);
            }
        }
    }

    function test_G5_pace_agnostic_distribution() public {
        uint256 snap = vm.snapshotState();
        uint256[4][4] memory fast = _script(4, 1); // ~6h
        vm.revertToState(snap);
        uint256[4][4] memory planned = _script(1, 1); // ~24h
        vm.revertToState(snap);
        uint256[4][4] memory slow = _script(1, 16); // ~16 days
        for (uint256 i; i < 4; ++i) {
            for (uint256 k; k < 4; ++k) {
                if (planned[i][k] == 0) {
                    assertEq(fast[i][k], 0);
                    assertEq(slow[i][k], 0);
                    continue;
                }
                assertApproxEqRel(fast[i][k], planned[i][k], 0.005e18, "fast vs planned");
                assertApproxEqRel(slow[i][k], planned[i][k], 0.005e18, "slow vs planned");
            }
        }
        // Sanity: the pool is fully paid at every pace.
        for (uint256 k; k < 4; ++k) {
            uint256 sum;
            for (uint256 i; i < 4; ++i) {
                sum += planned[i][k];
            }
            assertLe(sum, mine.fragmentSupply(uint8(k)));
            assertGe(sum, mine.fragmentSupply(uint8(k)) - 8);
        }
    }
}
