// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SeasonTestBase} from "../base/SeasonTestBase.sol";
import {ISeasonMine} from "../../src/interfaces/ISeasonMine.sol";
import {ISeasonFactory} from "../../src/interfaces/ISeasonFactory.sol";
import {SeasonMine} from "../../src/SeasonMine.sol";

/// @dev Access and phase gating for every external function (FR-S4, FR-R5, FR-U4, FR-M5).
contract GatingTest is SeasonTestBase {
    uint256 internal a;

    function setUp() public override {
        super.setUp();
        fundPlayer(ann, 1_000_000e18, 0);
        fundPlayer(bo, 1_000_000e18, 0);
        a = activateRig(ann, 1_000_000e18);
    }

    function test_not_owner() public {
        vm.startPrank(bo);
        vm.expectRevert(ISeasonMine.NotOwner.selector);
        mine.upgradeGpu(a);
        vm.expectRevert(ISeasonMine.NotOwner.selector);
        mine.upgradeCooling(a);
        vm.expectRevert(ISeasonMine.NotOwner.selector);
        mine.claim(a, 0);
        vm.expectRevert(ISeasonMine.NotOwner.selector);
        mine.exit(a);
        vm.expectRevert(ISeasonMine.NotOwner.selector);
        mine.withdraw(a);
        vm.stopPrank();
    }

    function test_max_tiers() public {
        gpu(ann, a, 5);
        cooling(ann, a, 3);
        vm.startPrank(ann);
        vm.expectRevert(ISeasonMine.MaxTier.selector);
        mine.upgradeGpu(a);
        vm.expectRevert(ISeasonMine.MaxTier.selector);
        mine.upgradeCooling(a);
        vm.stopPrank();
        assertEq(mine.rigs(a).baseHash, 2_000_000e18, "2.0x at tier 5");
    }

    function test_claim_before_found_and_double_claim() public {
        open();
        vm.warp(OPEN + 100);
        vm.startPrank(ann);
        vm.expectRevert(abi.encodeWithSelector(ISeasonMine.NotFound.selector, uint8(0)));
        mine.claim(a, 0);
        vm.stopPrank();
        warpToBlockFound();
        vm.startPrank(ann);
        uint256 got = mine.claim(a, 0);
        assertGt(got, 0);
        vm.expectRevert(abi.encodeWithSelector(ISeasonMine.AlreadyClaimed.selector, uint8(0)));
        mine.claim(a, 0);
        vm.stopPrank();
        assertEq(frags.balanceOf(ann, 0), got);
        assertEq(mine.mintedFragments(0), got);
    }

    function test_withdraw_before_close_and_exit_after_close() public {
        open();
        vm.startPrank(ann);
        vm.expectRevert(abi.encodeWithSelector(ISeasonMine.WrongPhase.selector, ISeasonMine.Phase.Open));
        mine.withdraw(a);
        vm.stopPrank();
        warpToClose();
        vm.startPrank(ann);
        vm.expectRevert(abi.encodeWithSelector(ISeasonMine.WrongPhase.selector, ISeasonMine.Phase.Closed));
        mine.exit(a);
        vm.expectRevert(abi.encodeWithSelector(ISeasonMine.WrongPhase.selector, ISeasonMine.Phase.Closed));
        mine.upgradeGpu(a);
        vm.stopPrank();
        vm.prank(bo);
        vm.expectRevert(abi.encodeWithSelector(ISeasonMine.WrongPhase.selector, ISeasonMine.Phase.Closed));
        mine.activate(ISeasonMine.Asset.RIG, 1_000_000e18);
        vm.prank(ann);
        mine.withdraw(a);
        assertTrue(mine.rigs(a).inactive);
    }

    function test_fragments_are_soulbound_and_only_mine_mints() public {
        open();
        warpToBlockFound();
        vm.prank(ann);
        mine.claim(a, 0);
        vm.prank(ann);
        vm.expectRevert();
        frags.safeTransferFrom(ann, bo, 0, 1, "");
        vm.expectRevert();
        frags.mint(ann, 0, 1);
    }

    function test_unfunded_season_cannot_open_and_lp_can_be_disabled() public {
        ISeasonMine.SeasonParams memory p = defaultParams();
        p.lpToken = address(0);
        vm.expectRevert(abi.encodeWithSelector(ISeasonFactory.InvalidParams.selector, "lp config"));
        factory.create(p, address(elig), address(oracle), address(usdc), false);
        p.lpWeightPerToken = 0;
        (, address m,,) = factory.create(p, address(elig), address(oracle), address(usdc), false);
        SeasonMine m2 = SeasonMine(m);
        assertEq(uint8(m2.phase()), uint8(ISeasonMine.Phase.Funding));
        vm.startPrank(ann);
        rig.approve(m, type(uint256).max);
        vm.expectRevert(abi.encodeWithSelector(ISeasonMine.WrongPhase.selector, ISeasonMine.Phase.Funding));
        m2.activate(ISeasonMine.Asset.RIG, 1_000_000e18);
        vm.stopPrank();
    }

    function test_factory_rejects_bad_params() public {
        ISeasonMine.SeasonParams memory p = defaultParams();
        p.difficulty[0] = 7; // not divisible by 8
        vm.expectRevert(
            abi.encodeWithSelector(
                ISeasonFactory.InvalidParams.selector, "difficulty divisible by shiftsPerBlock"
            )
        );
        factory.create(p, address(elig), address(oracle), address(usdc), false);
        p = defaultParams();
        p.openTime = uint64(block.timestamp - 1); // an open time now or in the future is fine; the past is not
        vm.expectRevert(abi.encodeWithSelector(ISeasonFactory.InvalidParams.selector, "openTime in the past"));
        factory.create(p, address(elig), address(oracle), address(usdc), false);
        p = defaultParams();
        p.openTime = uint64(block.timestamp);
        p.maxDurationSeconds = 30 minutes;
        vm.expectRevert(
            abi.encodeWithSelector(ISeasonFactory.InvalidParams.selector, "maxDuration >= 1 hour")
        );
        factory.create(p, address(elig), address(oracle), address(usdc), false);
        p = defaultParams();
        p.ocBoostBps = 20_000;
        vm.expectRevert(abi.encodeWithSelector(ISeasonFactory.InvalidParams.selector, "ocBoost*maxActiveOc"));
        factory.create(p, address(elig), address(oracle), address(usdc), false);
    }

    function test_only_guardian_pauses() public {
        vm.prank(ann);
        vm.expectRevert(SeasonMine.NotGuardian.selector);
        mine.pause();
        vm.prank(treasury);
        mine.pause();
        vm.prank(ann);
        vm.expectRevert();
        mine.upgradeGpu(a);
        vm.prank(treasury);
        mine.unpause();
        gpu(ann, a, 1);
    }
}
