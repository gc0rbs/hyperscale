// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SeasonTestBase} from "../base/SeasonTestBase.sol";

/// @dev docs/03 §7 reproduced: Ann 5M RIG GPU2, Bo 1M LP (W 2.5M) GPU3 cooling3 keeping 3 overclocks
///      running, Cy 2.5M RIG. Block 1 (NVDAx, 5.0 tokens, difficulty 1.728e11).
contract WorkedExampleTest is SeasonTestBase {
    function test_docs03_worked_example_block1() public {
        fundPlayer(ann, 5_000_000e18, 0);
        fundPlayer(bo, 2_000_000e18, 1_000_000e18);
        fundPlayer(cy, 2_500_000e18, 0);
        uint256 deadBefore = rig.balanceOf(mine.BURN_ADDRESS());
        uint256 a = activateRig(ann, 5_000_000e18);
        uint256 b = activateLp(bo, 1_000_000e18);
        uint256 c = activateRig(cy, 2_500_000e18);
        gpu(ann, a, 2);
        gpu(bo, b, 3);
        cooling(bo, b, 3);
        assertEq(mine.rigs(a).baseHash, 7_000_000e18);
        assertEq(mine.rigs(b).baseHash, 4_000_000e18);
        assertEq(mine.rigs(c).baseHash, 2_500_000e18);

        open();
        overclockN(bo, b, 3);
        assertEq(mine.totalHash(), 19_500_000e18, "19.5M with Bo's three overclocks");

        // Bo re-buys at the start of every other shift (overclocks last through the next shift).
        uint256 ocBought = 3;
        while (mine.shift() < 8) {
            warpToShiftEnd();
            if (mine.shift() < 8 && mine.shift() % 2 == 0) {
                overclockN(bo, b, 3);
                ocBought += 3;
            }
        }
        assertEq(ocBought, 12, "four rounds of three");
        assertEq(mine.shift(), 8, "block 1 found");
        uint256 dur = mine.blockEndX(0) / WAD - OPEN;
        assertApproxEqRel(dur, 8862, 0.005e18, "about 2h 28m");

        uint256 pa = mine.pending(a, 0);
        uint256 pb = mine.pending(b, 0);
        uint256 pc = mine.pending(c, 0);
        assertApproxEqRel(pa, 1_794_872, 0.005e18, "Ann ~1.795 NVDAx");
        assertApproxEqRel(pb, 2_564_103, 0.005e18, "Bo ~2.564 NVDAx");
        assertApproxEqRel(pc, 641_026, 0.005e18, "Cy ~0.641 NVDAx");
        assertLe(pa + pb + pc, 5_000_000, "never over the pool");
        assertGe(pa + pb + pc, 5_000_000 - 3, "whole pool paid out minus dust");

        // Burns: Ann 10% of 5M; Bo 19% + 16% of 2.5M + 12 × 2% of 2.5M.
        uint256 burned = rig.balanceOf(mine.BURN_ADDRESS()) - deadBefore; // burn = dead-address transfer
        assertEq(burned, 500_000e18 + 475_000e18 + 400_000e18 + 12 * 50_000e18);
    }
}
