// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {RoundTestBase} from "./RoundTestBase.sol";
import {IRoundMine} from "../../src/interfaces/IRoundMine.sol";
import {IRoundVault} from "../../src/interfaces/IRoundVault.sol";
import {RoundMine} from "../../src/rounds/RoundMine.sol";

/// @dev docs/13 §2: rounds close on the clock, pots split by work share, 15-minute claims, rollover,
///      scheduled funding, unschedule, halt and rescue.
contract RoundsTest is RoundTestBase {
    function test_round_clock() public {
        assertEq(mine.currentRound(), 0, "before genesis counts as round 0");
        assertEq(mine.roundEnd(0), GENESIS + L);
        assertEq(mine.closedRounds(), 0);
        mine.poke();
        assertEq(mine.closedRounds(), 0, "nothing closes before genesis");
        vm.warp(GENESIS + L - 1);
        mine.poke();
        assertEq(mine.currentRound(), 0);
        assertEq(mine.closedRounds(), 0);
        vm.warp(GENESIS + L);
        assertEq(mine.currentRound(), 1);
        vm.expectEmit(true, true, true, true);
        emit IRoundMine.RoundClosed(0, 0, new uint256[](4), 0);
        mine.poke();
        assertEq(mine.closedRounds(), 1);
        // 30 idle rounds later a single poke records every boundary.
        vm.warp(roundEnd(30));
        mine.poke();
        assertEq(mine.closedRounds(), 31);
        assertEq(mine.currentRound(), 31);
    }

    function test_fund_schedules_the_next_rounds() public {
        vm.warp(GENESIS + 10);
        stocks[0].mint(feeWallet, 25e18);
        vm.startPrank(feeWallet);
        stocks[0].approve(address(mine), 25e18);
        uint256 per = uint256(25e18) / 24;
        vm.expectEmit(true, true, true, true);
        emit IRoundMine.Funded(feeWallet, 0, per * 24, 1, 24);
        mine.fund(0, 25e18, 24); // 25 / 24 does not divide: 24 × 1.0416 is pulled, the rest stays
        vm.stopPrank();
        assertEq(mine.scheduled(0, 0), 0, "the current round is never funded");
        assertEq(mine.scheduled(0, 1), per, "per round");
        assertEq(mine.scheduled(0, 24), mine.scheduled(0, 1));
        assertEq(mine.scheduled(0, 25), 0);
        assertEq(
            stocks[0].balanceOf(address(vault)),
            mine.scheduled(0, 1) * 24,
            "exactly the scheduled amount moved"
        );
        assertEq(stocks[0].balanceOf(feeWallet), 25e18 - mine.scheduled(0, 1) * 24);
        // Anyone can fund; a second deposit adds to the same rounds.
        stocks[0].mint(address(this), 24e18);
        stocks[0].approve(address(mine), 24e18);
        mine.fund(0, 24e18, 24);
        assertEq(mine.scheduled(0, 1), per + 1e18);
        assertEq(mine.pot(1, 0), mine.scheduled(0, 1), "next round's pot is what is scheduled");
        vm.expectRevert(abi.encodeWithSelector(IRoundMine.InvalidParams.selector, "rounds"));
        mine.fund(0, 1e18, 0);
    }

    function test_work_share_claim_and_window() public {
        fundPlayer(ann, 1_000e18);
        fundPlayer(bo, 3_000e18);
        vm.warp(GENESIS);
        uint256 a = activateRig(ann, 1_000e18);
        uint256 b = activateRig(bo, 3_000e18);
        assertEq(mine.totalHash(), 4_000e18);
        fundRounds(4e18, 24); // 4 tokens of each stock per round from round 1
        assertEq(mine.pot(0, 0), 0, "round 0 was never funded");

        closeRound(0);
        assertEq(mine.roundWork(0), 4_000e18 * uint256(L));
        assertEq(mine.rigWork(a, 0), 1_000e18 * uint256(L));
        assertEq(mine.rigWork(b, 0), 3_000e18 * uint256(L));
        // Round 0 has an empty pot: a claim is refused as nothing to claim.
        vm.prank(ann);
        vm.expectRevert(IRoundMine.NothingToClaim.selector);
        mine.claim(a);

        closeRound(1);
        assertEq(mine.pot(1, 0), 4e18);
        uint256[] memory q = mine.claimable(a);
        assertEq(q[0], 1e18 * FPT / WAD, "ann: a quarter of 4 NVDA = 1 NVDA = 1,000,000 fragments");
        vm.prank(ann);
        uint256[] memory got = mine.claim(a);
        assertEq(got[0], 1_000_000);
        assertEq(got[3], 1_000_000);
        assertEq(frags.balanceOf(ann, 0), 1_000_000);
        assertEq(mine.claimedOf(1, 0), 1e18);
        vm.prank(ann);
        vm.expectRevert(IRoundMine.NothingToClaim.selector);
        mine.claim(a);
        vm.prank(bo);
        vm.expectRevert(IRoundMine.NotOwner.selector);
        mine.claim(a);

        // The window is 15 minutes; bo is late.
        vm.warp(roundEnd(1) + W);
        vm.prank(bo);
        vm.expectRevert(IRoundMine.ClaimWindowClosed.selector);
        mine.claim(b);
        assertEq(mine.claimable(b)[0], 0, "nothing claimable outside the window");
        // ...and bo's 3 NVDA roll into round 2's pot.
        assertEq(mine.pot(2, 0), 4e18 + 3e18, "scheduled plus rollover");
        closeRound(2);
        assertEq(mine.pot(2, 0), 7e18, "final at close");
        vm.prank(bo);
        got = mine.claim(b);
        assertEq(got[0], 5_250_000, "three quarters of 7");
        assertEq(mine.claimedOf(2, 0), 5.25e18);
    }

    function test_rollover_when_nobody_mines_and_dust_stays_in_the_pot() public {
        fundRounds(1e18, 10); // before genesis: rounds 0..9
        assertEq(mine.scheduled(0, 0), 1e18, "round 0 can be funded before genesis");
        // No rigs: rounds 0..3 roll their pots forward untouched.
        closeRound(3);
        assertEq(mine.roundWork(2), 0);
        assertEq(mine.pot(3, 0), 4e18);
        assertEq(mine.pot(4, 0), 5e18, "keeps accumulating while nobody mines: 1 scheduled + 4 rolled");
        // Three rigs with awkward shares: 1/3 each of 5 tokens; floors leave dust in the pot.
        fundPlayer(ann, 1_000e18);
        fundPlayer(bo, 1_000e18);
        fundPlayer(cy, 1_000e18);
        vm.warp(roundStart(4));
        uint256 a = activateRig(ann, 1_000e18);
        uint256 b = activateRig(bo, 1_000e18);
        uint256 c = activateRig(cy, 1_000e18);
        closeRound(4);
        assertEq(mine.pot(4, 0), 5e18);
        vm.prank(ann);
        mine.claim(a);
        vm.prank(bo);
        mine.claim(b);
        vm.prank(cy);
        mine.claim(c);
        uint256 each = uint256(5e18) / 3 / (WAD / FPT); // whole fragments
        assertEq(frags.balanceOf(ann, 0), each);
        uint256 paid = each * (WAD / FPT) * 3;
        assertEq(mine.claimedOf(4, 0), paid);
        assertLt(paid, 5e18, "dust stays");
        assertEq(mine.pot(5, 0), 1e18 + (5e18 - paid), "and rolls forward");
    }

    function test_mid_round_activation_exit_fee_and_late_claim_after_exit() public {
        fundPlayer(ann, 1_000e18);
        fundPlayer(bo, 1_000e18);
        vm.warp(GENESIS); // round 0 is running: the schedule starts at round 1
        fundRounds(2e18, 10);
        vm.warp(roundStart(1));
        uint256 a = activateRig(ann, 1_000e18);
        vm.warp(roundStart(1) + 1800); // bo joins half-way through
        uint256 b = activateRig(bo, 1_000e18);
        vm.warp(roundStart(1) + 2700); // ann leaves at three quarters
        uint256 before = rig.balanceOf(ann);
        vm.prank(ann);
        mine.exit(a);
        assertEq(rig.balanceOf(ann) - before, 970e18, "deposit minus the 3% exit fee");
        assertEq(rig.balanceOf(treasury), 10e18 + 10e18 + 30e18, "two activation fees plus the exit fee");
        assertEq(mine.totalHash(), 1_000e18);
        closeRound(1);
        assertEq(mine.rigWork(a, 1), 1_000e18 * 2700);
        assertEq(mine.rigWork(b, 1), 1_000e18 * 1800);
        assertEq(mine.roundWork(1), 1_000e18 * 4500);
        // The exited rig still claims its share of the round it left.
        vm.prank(ann);
        uint256[] memory got = mine.claim(a);
        assertEq(got[0], uint256(2e18) * 2700 / 4500 / (WAD / FPT));
        vm.prank(bo);
        got = mine.claim(b);
        assertEq(got[0], uint256(2e18) * 1800 / 4500 / (WAD / FPT));
        // But nothing in the rounds after.
        closeRound(2);
        assertEq(mine.rigWork(a, 2), 0);
        assertEq(mine.claimable(a)[0], 0);
        vm.prank(ann);
        vm.expectRevert(IRoundMine.RigInactive.selector);
        mine.exit(a);
    }

    function test_upgrades_overclock_expiry_and_heat_decay() public {
        fundPlayer(ann, 10_000e18);
        vm.warp(roundStart(2));
        uint256 a = activateRig(ann, 10_000e18);
        vm.startPrank(ann);
        mine.upgradeGpu(a); // 1.2×
        mine.upgradeCooling(a); // tier 1: heat 30 per overclock, decays 18 per round
        assertEq(mine.rigHash(a), 12_000e18);
        assertEq(rig.balanceOf(mine.BURN_ADDRESS()), 400e18 + 300e18, "upgrade spend burned (4% + 3%)");
        vm.warp(roundStart(2) + 600);
        mine.overclock(a); // +50% of base until the end of round 3
        vm.stopPrank();
        IRoundMine.Rig memory r = mine.rigs(a);
        assertEq(r.ocHash, 6_000e18);
        assertEq(r.ocExpiryRound, 3);
        assertEq(r.heat, 30);
        assertEq(mine.totalHash(), 18_000e18);
        assertEq(mine.rigHash(a), 18_000e18);
        closeRound(2);
        assertEq(mine.rigWork(a, 2), 12_000e18 * 3600 + 6_000e18 * 3000);
        assertEq(mine.roundWork(2), mine.rigWork(a, 2), "one rig: rig work equals round work");
        closeRound(3);
        assertEq(mine.totalHash(), 12_000e18, "overclock expired at the end of round 3");
        assertEq(mine.rigHash(a), 12_000e18);
        assertEq(mine.rigWork(a, 3), 18_000e18 * 3600);
        vm.warp(roundStart(4) + 10);
        vm.prank(ann);
        mine.upgradeGpu(a); // settles: heat decayed 18 per round boundary crossed (2 boundaries)
        r = mine.rigs(a);
        assertEq(r.heat, 0);
        assertEq(r.ocHash, 0);
        assertEq(r.activeOc, 0);
        assertEq(r.baseHash, 14_000e18);
        assertEq(mine.totalHash(), 14_000e18);
        // Three overclocks at once bump heat to 90; a fourth is refused by the count, then by heat.
        vm.startPrank(ann);
        mine.overclock(a);
        mine.overclock(a);
        mine.overclock(a);
        vm.expectRevert(IRoundMine.MaxOverclocks.selector);
        mine.overclock(a);
        vm.stopPrank();
        assertEq(mine.rigs(a).heat, 90);
        assertEq(mine.rigHash(a), 14_000e18 + 21_000e18);
    }

    function test_unschedule_only_rounds_that_have_not_started() public {
        vm.warp(roundStart(3));
        fundRounds(1e18, 5); // rounds 4..8
        vm.prank(ann);
        vm.expectRevert(IRoundMine.NotOperator.selector);
        mine.unschedule(0, 4);
        vm.expectRevert(IRoundMine.RoundStarted.selector);
        mine.unschedule(0, 3);
        vm.warp(roundStart(5) + 1);
        uint256 before = stocks[0].balanceOf(address(this));
        vm.expectEmit(true, true, true, true);
        emit IRoundMine.Unscheduled(0, 6, 3e18);
        uint256 out = mine.unschedule(0, 6);
        assertEq(out, 3e18);
        assertEq(stocks[0].balanceOf(address(this)) - before, 3e18, "released from the vault");
        assertEq(mine.scheduled(0, 5), 1e18, "the running round keeps its pot");
        assertEq(mine.scheduled(0, 6), 0);
        assertEq(mine.scheduled(0, 8), 0);
        assertEq(mine.unschedule(0, 6), 0, "repeat finds nothing");
    }

    function test_halt_returns_stakes_and_rescues_everything_unclaimed() public {
        fundPlayer(ann, 1_000e18);
        vm.warp(GENESIS); // round 0 is running: the schedule starts at round 1
        fundRounds(2e18, 10);
        vm.warp(roundStart(1));
        uint256 a = activateRig(ann, 1_000e18);
        closeRound(1);
        vm.prank(ann);
        mine.claim(a); // 2 NVDA worth of fragments, backed by the vault
        vm.warp(roundStart(2) + 100);
        vm.expectRevert(IRoundVault.NotHalted.selector);
        vault.rescue();
        vm.prank(ann);
        vm.expectRevert(IRoundMine.NotOperator.selector);
        mine.halt();
        vm.expectEmit(true, true, true, true);
        emit IRoundMine.MineHalted(uint64(block.timestamp), address(this));
        mine.halt();
        assertTrue(mine.halted());
        // Frozen: no round closes, no claims, no new rigs; deposits come back in full.
        vm.warp(roundEnd(5));
        mine.poke();
        assertEq(mine.closedRounds(), 2);
        vm.prank(ann);
        vm.expectRevert(IRoundMine.Halted.selector);
        mine.claim(a);
        vm.prank(ann);
        vm.expectRevert(IRoundMine.Halted.selector);
        mine.activate(100e18);
        uint256 before = rig.balanceOf(ann);
        vm.prank(ann);
        mine.emergencyWithdraw(a);
        assertEq(rig.balanceOf(ann) - before, 1_000e18);
        // The vault keeps the stock behind ann's fragments and returns the rest to the operator.
        fundReserve(500e6);
        uint256 opBefore = stocks[0].balanceOf(address(this));
        vault.rescue();
        assertEq(stocks[0].balanceOf(address(vault)), 2e18, "backing for 2,000,000 fragments");
        assertEq(stocks[0].balanceOf(address(this)) - opBefore, 18e18);
        assertEq(usdc.balanceOf(address(this)), 500e6, "the reserve returns too");
        // ann redeems in kind, any time.
        elig.set(ann, true);
        stocks[0].setAllowed(ann, true);
        vm.prank(ann);
        assertEq(vault.redeem(0, 2_000_000), 2e18);
        assertEq(stocks[0].balanceOf(address(vault)), 0);
    }

    function test_pause_grace_halts_the_mine() public {
        fundPlayer(ann, 1_000e18);
        vm.warp(roundStart(1));
        uint256 a = activateRig(ann, 1_000e18);
        vm.prank(ann);
        vm.expectRevert(IRoundMine.NotGuardian.selector);
        mine.pause();
        vm.prank(treasury);
        mine.pause();
        vm.prank(ann);
        vm.expectRevert(IRoundMine.PauseGraceNotElapsed.selector);
        mine.emergencyWithdraw(a);
        vm.warp(block.timestamp + 31 minutes);
        vm.prank(ann);
        mine.emergencyWithdraw(a);
        assertTrue(mine.halted(), "a pause that outlives its grace period halts the mine");
        assertEq(rig.balanceOf(ann), 3_000e18 - 10e18, "everything but the activation fee");
    }

    function test_redeem_and_cash_out_any_time() public {
        fundPlayer(ann, 1_000e18);
        vm.warp(GENESIS); // round 0 is running: the schedule starts at round 1
        fundRounds(2e18, 3);
        fundReserve(10_000e6);
        vm.warp(roundStart(1));
        uint256 a = activateRig(ann, 1_000e18);
        closeRound(1);
        vm.prank(ann);
        mine.claim(a);
        vm.prank(ann);
        vm.expectRevert(IRoundVault.NotEligible.selector);
        vault.redeem(1, 500_000);
        elig.set(ann, true);
        stocks[1].setAllowed(ann, true);
        vm.prank(ann);
        assertEq(vault.redeem(1, 500_000), 0.5e18, "fractional in kind is fine");
        vm.prank(ann);
        vm.expectRevert(IRoundVault.StalePrice.selector);
        vault.cashOut(1, 500_000);
        oracle.set(address(stocks[1]), 100e8, uint64(block.timestamp));
        vm.prank(ann);
        assertEq(vault.cashOut(1, 500_000), 49.5e6, "half a token at $100 minus 1%");
        assertEq(vault.redeemedOf(1), 1_000_000);
        assertEq(frags.balanceOf(ann, 1), 1_000_000);
        // Four days later the Friday price is still accepted; after that it is stale.
        vm.warp(block.timestamp + 4 days);
        vault.quoteCashOut(1, 1);
        vm.warp(block.timestamp + 1);
        vm.expectRevert(IRoundVault.StalePrice.selector);
        vault.quoteCashOut(1, 1);
    }

    function test_constructor_rejects_bad_params() public {
        IRoundMine.RoundParams memory p = defaultParams();
        p.claimSeconds = L;
        vm.expectRevert(abi.encodeWithSelector(IRoundMine.InvalidParams.selector, "claim < round"));
        new RoundMine(p, address(this), address(1), address(2));
        p = defaultParams();
        p.roundSeconds = 0;
        vm.expectRevert(abi.encodeWithSelector(IRoundMine.InvalidParams.selector, "round"));
        new RoundMine(p, address(this), address(1), address(2));
        p = defaultParams();
        p.gpuMultBps[0] = 9_000;
        vm.expectRevert(abi.encodeWithSelector(IRoundMine.InvalidParams.selector, "gpuMultBps"));
        new RoundMine(p, address(this), address(1), address(2));
        p = defaultParams();
        p.stocks = new address[](3);
        vm.expectRevert(abi.encodeWithSelector(IRoundMine.InvalidParams.selector, "stocks"));
        new RoundMine(p, address(this), address(1), address(2));
        p = defaultParams();
        p.activationFeeBps = 1001;
        vm.expectRevert(abi.encodeWithSelector(IRoundMine.InvalidParams.selector, "fees"));
        new RoundMine(p, address(this), address(1), address(2));
    }

    function test_claim_all_covers_every_rig_of_the_caller() public {
        fundPlayer(ann, 2_000e18);
        vm.warp(GENESIS); // round 0 is running: the schedule starts at round 1
        fundRounds(2e18, 3);
        vm.warp(roundStart(1));
        activateRig(ann, 1_000e18);
        activateRig(ann, 1_000e18);
        closeRound(1);
        vm.prank(ann);
        uint256[] memory got = mine.claimAll();
        assertEq(got[0], 2_000_000, "both rigs, whole pot");
        vm.prank(ann);
        got = mine.claimAll();
        assertEq(got[0], 0, "nothing left, no revert");
        // A wallet with a rig that did no work in the round, and one that did, claims without revert.
        fundPlayer(bo, 1_000e18);
        vm.warp(roundStart(2) + 3599);
        vm.prank(bo);
        mine.activate(1_000e18);
        closeRound(2);
        vm.prank(bo);
        got = mine.claimAll();
        assertGt(got[0], 0);
    }

    function test_below_min_stake_and_rig_ownership() public {
        fundPlayer(ann, 1_000e18);
        vm.prank(ann);
        vm.expectRevert(IRoundMine.BelowMinStake.selector);
        mine.activate(99e18);
        uint256 a = activateRig(ann, 1_000e18);
        vm.prank(bo);
        vm.expectRevert(IRoundMine.NotOwner.selector);
        mine.upgradeGpu(a);
        assertEq(mine.rigsOf(ann).length, 1);
        assertEq(mine.rigCount(), 1);
    }
}
