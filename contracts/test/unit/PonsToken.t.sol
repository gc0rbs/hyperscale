// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SeasonTestBase} from "../base/SeasonTestBase.sol";
import {ISeasonMine} from "../../src/interfaces/ISeasonMine.sol";
import {SeasonMine} from "../../src/SeasonMine.sol";
import {RedemptionVault} from "../../src/RedemptionVault.sol";
import {MockERC20} from "../../src/mocks/MockERC20.sol";

/// @dev $RIG is a Pons-launched token (DECISIONS 2026-09-04): a plain ERC-20 with no burn function.
///      A full season must work against such a token, with every upgrade's spend landing at the dead
///      address and the mine holding exactly the deposits (FR-U5, invariant 8). LP staking is off.
contract PonsTokenTest is SeasonTestBase {
    MockERC20 internal pons;
    SeasonMine internal m;
    RedemptionVault internal v;

    function setUp() public override {
        super.setUp();
        pons = new MockERC20("Stock Miner", "RIG", 18); // no burn / burnFrom, like a Pons token
        ISeasonMine.SeasonParams memory p = defaultParams();
        p.rig = address(pons);
        p.lpToken = address(0);
        p.lpWeightPerToken = 0;
        p.openTime = uint64(vm.getBlockTimestamp());
        p.maxDurationSeconds = 6 hours;
        (, address ma,, address va) = factory.create(p, address(elig), address(oracle), address(usdc), false);
        m = SeasonMine(ma);
        v = RedemptionVault(va);
        for (uint256 i; i < 4; ++i) {
            stocks[i].setAllowed(va, true);
            stocks[i].mint(address(this), POOL[i]);
            stocks[i].approve(va, POOL[i]);
        }
        usdc.mint(address(this), 1_000e6);
        usdc.approve(va, 1_000e6);
        v.fund(1_000e6);
        pons.mint(ann, 3_000_000e18);
        vm.prank(ann);
        pons.approve(ma, type(uint256).max);
    }

    function test_FR_U5_spend_goes_to_the_dead_address_on_a_token_without_burn() public {
        vm.startPrank(ann);
        uint256 id = m.activate(ISeasonMine.Asset.RIG, 1_000_000e18);
        m.upgradeGpu(id); // 4% of 1M
        m.upgradeCooling(id); // 3%
        m.overclock(id); // 2%
        vm.stopPrank();
        assertEq(pons.balanceOf(m.BURN_ADDRESS()), 90_000e18, "burned = 40k + 30k + 20k");
        assertEq(pons.balanceOf(address(m)), 1_000_000e18, "mine holds the deposit only");
        assertEq(pons.balanceOf(treasury), 10_000e18, "1% activation fee");
        assertEq(pons.balanceOf(ann), 3_000_000e18 - 1_000_000e18 - 10_000e18 - 90_000e18);
        assertEq(
            pons.totalSupply(), 3_000_000e18, "nominal supply unchanged: the burn is a dead-address transfer"
        );

        // LP is off: activating with LP reverts
        vm.prank(ann);
        vm.expectRevert(ISeasonMine.LpDisabled.selector);
        m.activate(ISeasonMine.Asset.LP, 1e18);

        // the season still runs to the cap and pays out
        vm.warp(vm.getBlockTimestamp() + 6 hours + 1);
        m.poke();
        assertEq(uint8(m.phase()), uint8(ISeasonMine.Phase.Closed));
        vm.startPrank(ann);
        uint256[4] memory got = m.claimAll(id);
        m.withdraw(id);
        vm.stopPrank();
        assertGt(got[0], 0);
        assertEq(pons.balanceOf(address(m)), 0);
    }
}
