// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SeasonTestBase} from "../base/SeasonTestBase.sol";
import {MineHandler} from "./MineHandler.sol";
import {ISeasonMine} from "../../src/interfaces/ISeasonMine.sol";

/// @dev docs/05 §5.3 invariants 1, 2, 3, 4, 7, 8 under random play with time warps.
contract MineInvariantTest is SeasonTestBase {
    MineHandler internal h;

    function setUp() public override {
        super.setUp();
        h = new MineHandler(mine, rig, lp, OPEN);
        rig.transfer(address(h), 400_000_000e18);
        targetContract(address(h));
        bytes4[] memory sel = new bytes4[](7);
        sel[0] = h.warp.selector;
        sel[1] = h.activate.selector;
        sel[2] = h.upgradeGpu.selector;
        sel[3] = h.upgradeCooling.selector;
        sel[4] = h.overclock.selector;
        sel[5] = h.claimAll.selector;
        sel[6] = h.exitRig.selector;
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
