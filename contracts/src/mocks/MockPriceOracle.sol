// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPriceOracle} from "../interfaces/IRedemptionVault.sol";

/// @notice Settable price feed with settable freshness, 1e8-scaled USD.
contract MockPriceOracle is IPriceOracle {
    struct Quote {
        uint256 price;
        uint64 updatedAt;
    }

    mapping(address => Quote) public quotes;

    function set(address stock, uint256 price, uint64 updatedAt) external {
        quotes[stock] = Quote(price, updatedAt);
    }

    function usdPrice(address stock) external view returns (uint256 price, uint64 updatedAt) {
        Quote memory q = quotes[stock];
        return (q.price, q.updatedAt);
    }
}
