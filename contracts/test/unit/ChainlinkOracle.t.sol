// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ChainlinkOracle} from "../../src/adapters/ChainlinkOracle.sol";
import {MockAggregator} from "../../src/mocks/MockAggregator.sol";

/// @dev FR-C3: cash-out prices come from the per-token Chainlink feeds, rescaled to 1e8.
contract ChainlinkOracleTest is Test {
    address internal nvda = address(0xA1);
    address internal sndk = address(0xA2);
    MockAggregator internal f8;
    MockAggregator internal f18;
    ChainlinkOracle internal oracle;

    function setUp() public {
        f8 = new MockAggregator(8);
        f18 = new MockAggregator(18);
        address[] memory s = new address[](2);
        address[] memory f = new address[](2);
        s[0] = nvda;
        f[0] = address(f8);
        s[1] = sndk;
        f[1] = address(f18);
        oracle = new ChainlinkOracle(s, f);
    }

    function test_rescales_to_1e8_and_passes_updatedAt() public {
        f8.set(230_40_500_000, 1_000); // 230.405 USD at 8 decimals
        f18.set(1719_035 * 1e15, 2_000); // 1719.035 USD at 18 decimals
        (uint256 p, uint64 at) = oracle.usdPrice(nvda);
        assertEq(p, 230_40_500_000);
        assertEq(at, 1_000);
        (p, at) = oracle.usdPrice(sndk);
        assertEq(p, 1719_035 * 1e5);
        assertEq(at, 2_000);
    }

    function test_non_positive_answer_reads_as_zero_price() public {
        f8.set(-1, 5);
        (uint256 p,) = oracle.usdPrice(nvda);
        assertEq(p, 0);
    }

    function test_unknown_stock_reverts_and_constructor_validates() public {
        vm.expectRevert(abi.encodeWithSelector(ChainlinkOracle.UnknownStock.selector, address(0xBEEF)));
        oracle.usdPrice(address(0xBEEF));
        address[] memory s = new address[](1);
        address[] memory f = new address[](2);
        vm.expectRevert(ChainlinkOracle.LengthMismatch.selector);
        new ChainlinkOracle(s, f);
    }
}
