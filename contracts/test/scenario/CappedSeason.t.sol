// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SeasonTestBase} from "../base/SeasonTestBase.sol";
import {ISeasonMine} from "../../src/interfaces/ISeasonMine.sol";
import {SeasonMine} from "../../src/SeasonMine.sol";
import {StockFragments} from "../../src/StockFragments.sol";
import {RedemptionVault} from "../../src/RedemptionVault.sol";

/// @dev A short season with a hard cap (docs/04 §5.2, DECISIONS 2026-09-04): difficulty sized for 3h at
///      5M hash, cap 6h, opening the second it is created. Only 1M hash shows up, so the cap ends the
///      season with block 1 found and block 2 four-fifths mined. Earned fragments are claimable, stakes
///      come back, and after the redemption window the unmined remainder is swept to the treasury, which
///      funds the next season with it (FR-C5, FR-S7). Uses vm.getBlockTimestamp(): via-IR may reuse a
///      TIMESTAMP read across a warp inside one test function.
contract CappedSeasonTest is SeasonTestBase {
    uint256 internal constant HOUR = 3600;

    function _createCapped(uint64 openAt)
        internal
        returns (SeasonMine m, StockFragments f, RedemptionVault v)
    {
        ISeasonMine.SeasonParams memory p = defaultParams();
        p.openTime = openAt;
        p.maxDurationSeconds = uint32(6 * HOUR);
        p.pauseGraceSeconds = 30 minutes;
        uint256 total = 5_000_000e18 * 3 * HOUR; // 3h at 5M hash
        uint256[4] memory share = [uint256(2000), 2500, 2500, 3000];
        for (uint256 b; b < 4; ++b) {
            uint256 d = (total * share[b]) / 10_000;
            p.difficulty[b] = d - (d % 8);
        }
        (, address ma, address fa, address va) =
            factory.create(p, address(elig), address(oracle), address(usdc), false);
        m = SeasonMine(ma);
        f = StockFragments(fa);
        v = RedemptionVault(va);
    }

    function _fund(RedemptionVault v, address from) internal {
        vm.startPrank(from);
        for (uint256 i; i < 4; ++i) {
            stocks[i].approve(address(v), POOL[i]);
        }
        usdc.approve(address(v), 1_000e6);
        v.fund(1_000e6);
        vm.stopPrank();
    }

    function test_opens_immediately_and_closes_at_the_cap_with_a_partial_pool() public {
        (SeasonMine m, StockFragments f, RedemptionVault v) = _createCapped(uint64(vm.getBlockTimestamp()));
        for (uint256 i; i < 4; ++i) {
            stocks[i].setAllowed(address(v), true);
            stocks[i].mint(address(this), POOL[i]);
        }
        usdc.mint(address(this), 1_000e6);
        _fund(v, address(this));
        assertEq(uint8(m.phase()), uint8(ISeasonMine.Phase.Open), "no pre-open: live on creation");

        // 1M hash instead of the 5M planned
        fundPlayer(ann, 1_000_000e18, 0);
        vm.prank(ann);
        rig.approve(address(m), type(uint256).max);
        vm.prank(ann);
        uint256 id = m.activate(ISeasonMine.Asset.RIG, 1_000_000e18);

        // 3h in: block 1 (index 0) needs 1.08e10 work; 1M hash × 3h = 1.08e10 → found right at 3h
        vm.warp(block.timestamp + 3 * HOUR + 1);
        m.poke();
        assertTrue(m.blockEndX(0) != 0, "block 1 found");
        assertEq(m.closeX(), 0, "still open");

        // the cap: 6h after open
        vm.warp(block.timestamp + 3 * HOUR);
        m.poke();
        assertEq(uint8(m.phase()), uint8(ISeasonMine.Phase.Closed));
        assertEq(m.closeX(), (uint256(m.openTime()) + 6 * HOUR) * WAD, "closed at the cap");
        assertEq(m.blockEndX(1), 0, "block 2 never found");

        // block 1 pays its whole pool (5M fragments minus dust), block 2 pays 4/5 of 6M, blocks 3-4 nothing
        vm.prank(ann);
        uint256[4] memory got = m.claimAll(id);
        assertApproxEqAbs(got[0], 5_000_000, 2);
        assertApproxEqAbs(got[1], 4_800_000, 2);
        assertEq(got[2], 0);
        assertEq(got[3], 0);
        assertEq(f.balanceOf(ann, 0), got[0]);

        // full deposit back
        uint256 before = rig.balanceOf(ann);
        vm.prank(ann);
        m.withdraw(id);
        assertEq(rig.balanceOf(ann) - before, 1_000_000e18);

        // Ann redeems block 1 in kind
        elig.set(ann, true);
        stocks[0].setAllowed(ann, true);
        stocks[1].setAllowed(ann, true);
        vm.startPrank(ann);
        v.redeem(0, got[0]);
        v.redeem(1, got[1]);
        vm.stopPrank();
        assertApproxEqAbs(stocks[0].balanceOf(ann), 5e18, 1e13, "5M fragments = 5 NVDA");
        assertApproxEqAbs(stocks[1].balanceOf(ann), 4.8e18, 1e13, "4.8M fragments = 4.8 MU");

        // after the window the unmined remainder goes to the treasury ...
        vm.warp(v.redemptionEnd() + 1);
        for (uint256 i; i < 4; ++i) {
            stocks[i].setAllowed(treasury, true);
        }
        v.sweep();
        assertLe(stocks[0].balanceOf(treasury), 1e13, "block 1 fully mined and redeemed: only dust left");
        assertApproxEqAbs(stocks[1].balanceOf(treasury), 1.2e18, 1e12, "block 2: 1.2 of 6 tokens unmined");
        assertEq(stocks[2].balanceOf(treasury), POOL[2]);
        assertEq(stocks[3].balanceOf(treasury), POOL[3]);

        // ... and funds the next season's vault with it (ops policy: roll the remainder forward)
        (SeasonMine m2,, RedemptionVault v2) = _createCappedAs(treasury);
        stocks[2].setAllowed(address(v2), true);
        stocks[3].setAllowed(address(v2), true);
        stocks[0].setAllowed(address(v2), true);
        stocks[1].setAllowed(address(v2), true);
        stocks[0].mint(treasury, POOL[0]); // top up what was mined
        stocks[1].mint(treasury, POOL[1] - stocks[1].balanceOf(treasury));
        usdc.mint(treasury, 1_000e6);
        _fund(v2, treasury);
        assertEq(uint8(m2.phase()), uint8(ISeasonMine.Phase.Open), "season 2 live, funded from the sweep");
    }

    function _createCappedAs(address who)
        internal
        returns (SeasonMine m, StockFragments f, RedemptionVault v)
    {
        vm.startPrank(who);
        (m, f, v) = _createCapped(uint64(vm.getBlockTimestamp()));
        vm.stopPrank();
    }
}
