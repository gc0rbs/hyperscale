// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SeasonTestBase} from "../base/SeasonTestBase.sol";
import {ISeasonMine} from "../../src/interfaces/ISeasonMine.sol";

/// @dev FR-S2, FR-R1..R4, FR-M2: phases, activation, fee, single-rig math.
contract MineUnitTest is SeasonTestBase {
    function test_FR_S2_phases() public {
        assertEq(uint8(mine.phase()), uint8(ISeasonMine.Phase.PreOpen));
        open();
        assertEq(uint8(mine.phase()), uint8(ISeasonMine.Phase.Open));
        vm.warp(OPEN + 30 days);
        assertEq(uint8(mine.phase()), uint8(ISeasonMine.Phase.Closed), "fail-safe closes");
    }

    function test_FR_R2_R4_activate_rig_fee_and_weight() public {
        fundPlayer(ann, 1_000_000e18, 0);
        uint256 id = activateRig(ann, 1_000_000e18);
        ISeasonMine.Rig memory r = mine.rigs(id);
        assertEq(r.weight, 1_000_000e18);
        assertEq(r.baseHash, 1_000_000e18);
        assertEq(rig.balanceOf(treasury), 10_000e18, "1% activation fee");
        assertEq(mine.totalHash(), 1_000_000e18);
    }

    function test_FR_R2_activate_lp_weight_with_bonus() public {
        fundPlayer(bo, 100_000e18, 1_000_000e18);
        uint256 id = activateLp(bo, 1_000_000e18);
        assertEq(mine.rigs(id).weight, 2_500_000e18, "1 LP = 2.5 RIG-eq");
        assertEq(rig.balanceOf(treasury), 25_000e18, "fee on weight, paid in RIG");
    }

    function test_FR_R3_below_min_stake_reverts() public {
        fundPlayer(ann, 1000e18, 0);
        vm.prank(ann);
        vm.expectRevert(ISeasonMine.BelowMinStake.selector);
        mine.activate(ISeasonMine.Asset.RIG, 99e18);
    }

    function test_FR_M2_single_rig_pays_fixed_rate_per_hash_second() public {
        fundPlayer(ann, 5_000_000e18, 0);
        uint256 id = activateRig(ann, 5_000_000e18);
        gpu(ann, id, 2); // 7.00M hash
        assertEq(mine.rigs(id).baseHash, 7_000_000e18);
        open();
        vm.warp(OPEN + 100);
        // 7M hash × 100 s × (5,000,000 frag / 1.728e11 hash-s) = 20,254.6 → floor
        assertEq(mine.pending(id, 0), 20_254);
        // Another rig joining does not change Ann's income rate, only the pace.
        fundPlayer(cy, 50_000_000e18, 0);
        activateRig(cy, 50_000_000e18);
        vm.warp(OPEN + 200);
        assertEq(mine.pending(id, 0), 40_509);
    }

    function test_FR_M3_idle_mine_makes_no_progress() public {
        open();
        vm.warp(OPEN + 7 days);
        mine.poke();
        assertEq(mine.shift(), 0);
        assertEq(mine.workInShift(), 0);
        assertTrue(mine.eta().idle);
        // A rig that joins later starts from zero and the mine resumes.
        fundPlayer(ann, 10_000_000e18, 0);
        uint256 id = activateRig(ann, 10_000_000e18);
        vm.warp(block.timestamp + 1000);
        assertGt(mine.pending(id, 0), 0);
    }

    function test_FR_U3_overclock_gating_heat_and_max() public {
        fundPlayer(ann, 1_000_000e18, 0);
        uint256 id = activateRig(ann, 1_000_000e18);
        vm.prank(ann);
        vm.expectRevert(abi.encodeWithSelector(ISeasonMine.WrongPhase.selector, ISeasonMine.Phase.PreOpen));
        mine.overclock(id);
        open();
        overclockN(ann, id, 2); // heat 80 at cooling 0
        assertEq(mine.rigs(id).heat, 80);
        assertEq(mine.rigs(id).activeOc, 2);
        assertEq(mine.rigs(id).ocHash, 1_000_000e18, "+50% x 2");
        assertEq(mine.totalHash(), 2_000_000e18);
        vm.prank(ann);
        vm.expectRevert(ISeasonMine.HeatTooHigh.selector);
        mine.overclock(id);
    }

    function test_FR_U3_overclock_expires_at_end_of_next_shift() public {
        fundPlayer(ann, 1_000_000e18, 0);
        uint256 id = activateRig(ann, 1_000_000e18);
        open();
        overclockN(ann, id, 1);
        assertEq(mine.rigs(id).ocExpiryShift, 1);
        warpToShiftEnd(); // shift 0 ends
        assertEq(mine.shift(), 1);
        assertEq(mine.rigHash(id), 1_500_000e18, "still boosted through shift 1");
        warpToShiftEnd(); // shift 1 ends → expiry
        assertEq(mine.shift(), 2);
        assertEq(mine.rigHash(id), 1_000_000e18);
        assertEq(mine.totalHash(), 1_000_000e18, "bucket removed at boundary");
        assertEq(mine.rigs(id).heat, 40, "not settled yet");
        vm.prank(ann);
        mine.poke();
        assertGt(mine.pending(id, 0), 0);
        // settle via any rig action (block 0 is not found yet at shift 2).
        vm.prank(ann);
        mine.upgradeCooling(id);
        assertEq(mine.rigs(id).heat, 20, "40 - 2 shifts x 10");
        assertEq(mine.rigs(id).activeOc, 0);
    }

    function test_FR_S3_block_found_exactly_when_work_reaches_difficulty() public {
        fundPlayer(ann, 10_000_000e18, 0);
        uint256 id = activateRig(ann, 10_000_000e18);
        open();
        // 10M hash → block 1 takes 1.728e11 / 1e7 = 17,280 s.
        vm.warp(OPEN + 17_279);
        mine.poke();
        assertEq(mine.blockEndX(0), 0);
        vm.warp(OPEN + 17_280);
        mine.poke();
        assertEq(mine.blockEndX(0), uint256(OPEN + 17_280) * WAD);
        assertEq(mine.shift(), 8);
        assertApproxEqAbs(
            mine.pending(id, 0), 5_000_000, 1, "whole block paid to the only rig, minus rate dust"
        );
    }

    function test_FR_C1_R6_exit_and_withdraw() public {
        fundPlayer(ann, 1_000_000e18, 0);
        uint256 id = activateRig(ann, 1_000_000e18);
        open();
        vm.warp(OPEN + 100);
        uint256 before = rig.balanceOf(ann);
        vm.prank(ann);
        mine.exit(id);
        assertEq(rig.balanceOf(ann) - before, 970_000e18, "3% exit fee");
        assertEq(mine.totalHash(), 0);
        assertGt(mine.pending(id, 0), 0, "earned so far stays claimable");
        vm.prank(ann);
        vm.expectRevert(ISeasonMine.RigInactive.selector);
        mine.exit(id);
    }

    function test_FR_S6_pause_grace_and_emergency_withdraw() public {
        fundPlayer(ann, 1_000_000e18, 0);
        uint256 id = activateRig(ann, 1_000_000e18);
        open();
        vm.prank(ann);
        vm.expectRevert(ISeasonMine.PauseGraceNotElapsed.selector);
        mine.emergencyWithdraw(id);
        vm.prank(treasury);
        mine.pause();
        vm.warp(block.timestamp + 6 hours);
        vm.prank(ann);
        vm.expectRevert(ISeasonMine.PauseGraceNotElapsed.selector);
        mine.emergencyWithdraw(id);
        vm.warp(block.timestamp + 1);
        uint256 before = rig.balanceOf(ann);
        vm.prank(ann);
        mine.emergencyWithdraw(id);
        assertEq(rig.balanceOf(ann) - before, 1_000_000e18, "deposit back; activation fee not refunded");
        assertEq(uint8(mine.phase()), uint8(ISeasonMine.Phase.Cancelled));
    }
}
