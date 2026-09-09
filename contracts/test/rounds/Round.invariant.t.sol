// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {RoundTestBase} from "./RoundTestBase.sol";
import {RoundHandler} from "./RoundHandler.sol";
import {IRoundMine} from "../../src/interfaces/IRoundMine.sol";

/// @dev docs/13 §4 invariants 1–8 under random play with time warps, funding, unscheduling, pauses,
///      halts and redemptions. Time starts a day before genesis so pre-genesis behaviour is covered.
contract RoundInvariantTest is RoundTestBase {
    RoundHandler internal h;

    function setUp() public override {
        super.setUp();
        h = new RoundHandler(mine, vault, frags, rig, stocks, oracle, address(this), feeWallet);
        rig.transfer(address(h), 400_000_000e18);
        for (uint256 i; i < h.actorCount(); ++i) {
            address a = h.actors(i);
            elig.set(a, true);
            for (uint256 b; b < 4; ++b) {
                stocks[b].setAllowed(a, true);
            }
        }
        usdc.mint(address(this), 1_000_000e6);
        usdc.approve(address(vault), 1_000_000e6);
        vault.topUpReserve(1_000_000e6);
        targetContract(address(h));
        bytes4[] memory sel = new bytes4[](13);
        sel[0] = h.warp.selector;
        sel[1] = h.fund.selector;
        sel[2] = h.activate.selector;
        sel[3] = h.upgradeGpu.selector;
        sel[4] = h.upgradeCooling.selector;
        sel[5] = h.overclock.selector;
        sel[6] = h.claim.selector;
        sel[7] = h.claimAll.selector;
        sel[8] = h.exitRig.selector;
        sel[9] = h.redeem.selector;
        sel[10] = h.pauseCycle.selector;
        sel[11] = h.halt.selector;
        sel[12] = h.emergencyWithdraw.selector;
        targetSelector(FuzzSelector({addr: address(h), selectors: sel}));
    }

    /// Invariant 1: claims never exceed a closed round's pot, and every pot is what was funded while
    /// the round ran plus the previous round's unclaimed remainder.
    function invariant_1_claims_within_pot_and_rollover_exact() public view {
        uint64 closed = mine.closedRounds();
        for (uint64 r = closed > 3 ? closed - 3 : 0; r < closed; ++r) {
            for (uint8 s; s < 4; ++s) {
                uint256 p = mine.pot(r, s);
                assertLe(mine.claimedOf(r, s), p, "claims exceed pot");
                uint256 expect = h.roundFunded(r, s);
                if (r > 0) expect += mine.pot(r - 1, s) - mine.claimedOf(r - 1, s);
                assertEq(p, expect, "rollover");
            }
        }
    }

    /// Invariant 2: the stored total hash is the sum of live rig hashes once recorded to now.
    function invariant_2_total_hash_is_sum_of_rigs() public {
        if (mine.halted()) return;
        mine.poke();
        uint256 sum;
        for (uint256 i; i < h.rigCount(); ++i) {
            sum += mine.rigHash(h.rigIds(i));
        }
        assertEq(mine.totalHash(), sum);
    }

    /// Invariant 3: a closed round's work never changes.
    function invariant_3_closed_round_work_is_final() public view {
        assertFalse(h.roundWorkChanged());
    }

    /// Invariant 4: the rigs' work in the latest closed round sums exactly to the round's work.
    function invariant_4_rig_work_sums_to_round_work() public view {
        uint64 closed = mine.closedRounds();
        if (closed == 0 || mine.halted()) return;
        uint64 r = closed - 1;
        // Only meaningful while the round is still the latest closed one and no later round has
        // closed on the clock (a rig's view of an older round may be partial by design).
        if (mine.currentRound() != r + 1) return;
        uint256 sum;
        for (uint256 i; i < h.rigCount(); ++i) {
            sum += mine.rigWork(h.rigIds(i), r);
        }
        assertEq(sum, mine.roundWork(r), "rig work != round work");
    }

    /// Invariant 5: the vault holds what it owes: the stock behind un-redeemed fragments, the open
    /// round's pot (with its rollover) and the latest closed round's unclaimed remainder while its
    /// window is open. Equivalently, its balance is exactly what was funded minus what was redeemed in
    /// kind (cash-outs pay USDG, leaving the stock).
    function invariant_5_vault_backing() public view {
        for (uint8 s; s < 4; ++s) {
            uint256 bal = stocks[s].balanceOf(address(vault));
            assertEq(bal, h.ghostFunded(s), "vault balance != funded - redeemed");
            assertGe(bal, vault.requiredOf(s), "under-backed fragments");
        }
    }

    /// Invariant 6: the mine holds exactly the outstanding deposits.
    function invariant_6_balances_match_deposits() public view {
        assertEq(rig.balanceOf(address(mine)), h.ghostDeposits());
    }

    /// Invariant 7: heat and overclock bounds.
    function invariant_7_heat_and_oc_bounds() public view {
        for (uint256 i; i < h.rigCount(); ++i) {
            IRoundMine.Rig memory r = mine.rigs(h.rigIds(i));
            assertLe(r.heat, 100);
            assertLe(r.activeOc, 3);
        }
    }

    /// Invariant 8: after a halt no round closes.
    function invariant_8_halt_freezes_rounds() public {
        if (!mine.halted()) return;
        mine.poke();
        assertEq(mine.closedRounds(), h.haltedAtClosed());
    }
}
