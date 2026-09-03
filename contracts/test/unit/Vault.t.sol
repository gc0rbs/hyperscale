// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SeasonTestBase} from "../base/SeasonTestBase.sol";
import {IRedemptionVault} from "../../src/interfaces/IRedemptionVault.sol";
import {RedemptionVault} from "../../src/RedemptionVault.sol";
import {MockStockToken} from "../../src/mocks/MockStockToken.sol";

/// @dev FR-C2..C4: redeem in kind, cash out, window, sweep, funding.
contract VaultTest is SeasonTestBase {
    uint256 internal a;

    function setUp() public override {
        super.setUp();
        fundPlayer(ann, 10_000_000e18, 0);
        a = activateRig(ann, 10_000_000e18);
        open();
    }

    function _finish() internal {
        warpToClose();
        vm.prank(ann);
        mine.claimAll(a);
    }

    function test_redeem_requires_close_eligibility_and_allowlist() public {
        warpToBlockFound();
        vm.prank(ann);
        mine.claim(a, 0);
        vm.prank(ann);
        vm.expectRevert(RedemptionVault.NotClosed.selector);
        vault.redeem(0, 1_000_000);
        _finish();
        vm.prank(ann);
        vm.expectRevert(IRedemptionVault.NotEligible.selector);
        vault.redeem(0, 1_000_000);
        elig.set(ann, true);
        vm.prank(ann);
        vm.expectRevert(abi.encodeWithSelector(MockStockToken.NotAllowed.selector, ann));
        vault.redeem(0, 1_000_000);
        stocks[0].setAllowed(ann, true);
        vm.prank(ann);
        uint256 tokens = vault.redeem(0, 1_000_000);
        assertEq(tokens, 1e18);
        assertEq(stocks[0].balanceOf(ann), 1e18);
        assertEq(frags.balanceOf(ann, 0), 5_000_000 - 1 - 1_000_000, "pool minus dust minus redeemed");
    }

    function test_cashout_price_staleness_fee_and_reserve() public {
        _finish();
        vm.prank(ann);
        vm.expectRevert(IRedemptionVault.StalePrice.selector);
        vault.cashOut(1, 1_000_000);
        oracle.set(address(stocks[1]), 350e8, uint64(block.timestamp));
        (uint256 net, uint256 fee) = vault.quoteCashOut(1, 1_000_000);
        assertEq(net + fee, 350e6, "one TSLAx at $350");
        assertEq(fee, 3.5e6, "1% fee");
        vm.prank(ann);
        assertEq(vault.cashOut(1, 1_000_000), 346.5e6);
        assertEq(usdc.balanceOf(ann), 346.5e6);
        // Reserve is 50,000 USDC: 200 tokens would need 69,300.
        vm.prank(ann);
        vm.expectRevert(IRedemptionVault.ReserveInsufficient.selector);
        vault.cashOut(1, 200 * 1_000_000);
        vm.warp(block.timestamp + 2 hours);
        vm.prank(ann);
        vm.expectRevert(IRedemptionVault.StalePrice.selector);
        vault.cashOut(1, 1_000_000);
    }

    function test_window_and_sweep() public {
        _finish();
        vm.expectRevert(IRedemptionVault.WindowOpen.selector);
        vault.sweep();
        uint256 end = vault.redemptionEnd();
        assertEq(end, mine.closeX() / WAD + 30 days);
        vm.warp(end + 1);
        elig.set(ann, true);
        stocks[0].setAllowed(ann, true);
        vm.prank(ann);
        vm.expectRevert(IRedemptionVault.WindowClosed.selector);
        vault.redeem(0, 1_000_000);
        stocks[0].setAllowed(treasury, true); // stock 0 can be swept; the others refuse the treasury
        vault.sweep();
        assertEq(stocks[0].balanceOf(treasury), 5e18);
        assertEq(stocks[1].balanceOf(address(vault)), 6e18, "hook refused: stays, does not block");
        assertEq(usdc.balanceOf(treasury), 50_000e6);
        vm.expectRevert(IRedemptionVault.WindowClosed.selector);
        vault.sweep();
    }

    function test_fund_once() public {
        vm.expectRevert(IRedemptionVault.AlreadyFunded.selector);
        vault.fund(0);
        vm.prank(ann);
        vm.expectRevert(RedemptionVault.NotOperator.selector);
        vault.fund(0);
    }
}
