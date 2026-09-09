// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SeasonTestBase} from "../base/SeasonTestBase.sol";
import {MineHandler} from "./MineHandler.sol";
import {ISeasonMine} from "../../src/interfaces/ISeasonMine.sol";

/// @dev docs/05 §5.3 invariants 1–9 under random play with time warps, pauses and cancellations.
contract MineInvariantTest is SeasonTestBase {
    MineHandler internal h;

    function setUp() public override {
        super.setUp();
        h = new MineHandler(mine, rig, lp, OPEN, oracle);
        rig.transfer(address(h), 400_000_000e18);
        targetContract(address(h));
        // Redemption in kind needs the eligibility allowlist and the stock tokens' hooks to accept
        // the handler's actors; cash-out needs a fresh oracle price (refreshed by the handler's warp).
        for (uint256 i; i < 5; ++i) {
            address a = h.actors(i);
            elig.set(a, true);
            for (uint256 b; b < 4; ++b) {
                stocks[b].setAllowed(a, true);
            }
        }
        for (uint256 b; b < 4; ++b) {
            stocks[b].setAllowed(treasury, true);
            stocks[b].setAllowed(address(this), true);
        }
        bytes4[] memory sel = new bytes4[](12);
        sel[0] = h.warp.selector;
        sel[1] = h.activate.selector;
        sel[2] = h.upgradeGpu.selector;
        sel[3] = h.upgradeCooling.selector;
        sel[4] = h.overclock.selector;
        sel[5] = h.claimAll.selector;
        sel[6] = h.exitRig.selector;
        sel[7] = h.pauseCycle.selector;
        sel[8] = h.emergencyWithdraw.selector;
        sel[9] = h.abort.selector;
        sel[10] = h.rescueOrSweepUnmined.selector;
        sel[11] = h.redeem.selector;
        targetSelector(FuzzSelector({addr: address(h), selectors: sel}));
    }

    /// Invariant 1: Σ (pending + minted) per block never exceeds the pool.
    function invariant_1_pool_never_exceeded() public view {
        for (uint8 b; b < 4; ++b) {
            uint256 sum = mine.mintedFragments(b);
            for (uint256 i; i < h.rigCount(); ++i) {
                sum += mine.pending(h.rigIds(i), b);
            }
            assertLe(sum, mine.fragmentSupply(b));
        }
    }

    /// Invariants 2 and 3: stored total hash equals the sum of live rig hashes (after a poke, the
    /// simulated and stored views agree), and expiring buckets never exceed live overclock hash.
    function invariant_2_3_total_hash_is_sum_of_rigs() public {
        mine.poke();
        uint256 sum;
        uint256 oc;
        for (uint256 i; i < h.rigCount(); ++i) {
            uint256 id = h.rigIds(i);
            uint256 rh = mine.rigHash(id);
            sum += rh;
            ISeasonMine.Rig memory r = mine.rigs(id);
            if (!r.inactive && rh > r.baseHash) oc += rh - r.baseHash;
        }
        if (mine.closeX() == 0) {
            assertEq(mine.totalHash(), sum, "totalHash == sum of live rig hash");
            uint256 buckets;
            for (uint16 k = mine.shift(); k <= SHIFTS; ++k) {
                buckets += mine.ocExpiring(k);
            }
            assertEq(buckets, oc, "expiring buckets == live overclock hash");
        }
    }

    /// Invariant 4: earnings are monotone regardless of when settlement happens.
    function invariant_4_earned_monotone() public view {
        assertTrue(h.monotonic());
    }

    /// Invariant 5: a found block has paid out its whole pool, minus at most one fragment of rounding
    /// per rig (claims floor to whole fragments) and one for the rate floor. Exited, withdrawn and
    /// emergency-withdrawn rigs keep their earned balance, so every rig counts.
    function invariant_5_found_block_pays_its_pool() public view {
        uint256 n = h.rigCount();
        for (uint8 b; b < 4; ++b) {
            if (mine.blockEndX(b) == 0) continue;
            uint256 sum = mine.mintedFragments(b);
            for (uint256 i; i < n; ++i) {
                sum += mine.pending(h.rigIds(i), b);
            }
            uint256 supply = mine.fragmentSupply(b);
            assertLe(sum, supply, "block over-paid");
            assertGe(sum + n + 2, supply, "block under-paid beyond dust");
        }
    }

    /// Invariant 9: after close, nothing accrues and nothing changes except through claims.
    function invariant_9_frozen_after_close() public view {
        assertTrue(h.frozenAfterClose());
    }

    /// Invariant 10 (audit B4): shift, boundary and work never change after cancellation.
    function invariant_10_frozen_after_cancel() public view {
        if (!h.cancelSnapshotTaken()) return;
        assertEq(mine.shift(), h.cancelShift());
        assertEq(mine.lastX(), h.cancelLastX());
        assertEq(mine.workInShift(), h.cancelWork());
        assertEq(mine.closeX(), 0);
    }

    /// Invariant 11: once closed, what a block can still mint in total never
    /// exceeds `claimableCap`, and the vault holds at least the stock those fragments can redeem, even
    /// after the unmined remainder was swept or rescued.
    function invariant_11_cap_bounds_claims_and_vault_backing() public view {
        if (mine.closeX() == 0) return;
        for (uint8 b; b < 4; ++b) {
            uint256 sum = mine.mintedFragments(b);
            for (uint256 i; i < h.rigCount(); ++i) {
                sum += mine.pending(h.rigIds(i), b);
            }
            uint256 cap = mine.claimableCap(b);
            assertLe(sum, cap, "claims exceed the cap");
            uint256 outstanding = sum - h.ghostRedeemed(b); // still redeemable, whole fragments
            assertGe(
                stocks[b].balanceOf(address(vault)), (outstanding * WAD) / 1_000_000, "vault under-backed"
            );
        }
    }

    /// Invariant 7: heat and overclock bounds.
    function invariant_7_heat_and_oc_bounds() public view {
        for (uint256 i; i < h.rigCount(); ++i) {
            ISeasonMine.Rig memory r = mine.rigs(h.rigIds(i));
            assertLe(r.heat, 100);
            assertLe(r.activeOc, 3);
        }
    }

    /// Invariant 8: the mine holds exactly the outstanding deposits.
    function invariant_8_balances_match_deposits() public view {
        assertEq(rig.balanceOf(address(mine)), h.ghostRigDeposits());
        assertEq(lp.balanceOf(address(mine)), h.ghostLpDeposits());
    }

    /// Invariant 6: boundaries are monotone.
    function invariant_6_boundaries_monotone() public view {
        uint256 prev;
        for (uint16 k; k < mine.shift() && k < SHIFTS; ++k) {
            uint256 e = mine.shiftEndX(k);
            assertGe(e, prev);
            prev = e;
        }
    }
}
