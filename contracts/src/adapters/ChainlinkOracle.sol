// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPriceOracle} from "../interfaces/IRedemptionVault.sol";

/// @dev Minimal Chainlink AggregatorV3Interface (docs.chain.link); Robinhood Stock Token feeds implement it.
interface IAggregatorV3 {
    function decimals() external view returns (uint8);
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}

/// @title ChainlinkOracle – IPriceOracle over the per-token Chainlink feeds on Robinhood Chain
/// @notice One immutable stock → feed map fixed at deployment (docs/05 §7, DECISIONS 2026-09-04). The feed
///         already includes the token's corporate-action multiplier (docs.robinhood.com/chain/building-with-
///         stock-tokens), so the price is per token, which is what the vault needs. Answers are rescaled to
///         1e8 from the feed's own `decimals()`; a non-positive answer reads as price 0, which the vault
///         treats as stale. Feeds run 24/5; outside sessions the vault's 1 h staleness cap refuses cash-out
///         and in-kind redemption is unaffected.
contract ChainlinkOracle is IPriceOracle {
    error LengthMismatch();
    error ZeroAddress();
    error UnknownStock(address stock);

    mapping(address => IAggregatorV3) internal _feed;
    address[] public stocks;

    constructor(address[] memory stocks_, address[] memory feeds_) {
        if (stocks_.length != feeds_.length) revert LengthMismatch();
        for (uint256 i; i < stocks_.length; ++i) {
            if (stocks_[i] == address(0) || feeds_[i] == address(0)) revert ZeroAddress();
            _feed[stocks_[i]] = IAggregatorV3(feeds_[i]);
            stocks.push(stocks_[i]);
        }
    }

    function feedOf(address stock) external view returns (address) {
        return address(_feed[stock]);
    }

    /// @inheritdoc IPriceOracle
    function usdPrice(address stock) external view returns (uint256 price, uint64 updatedAt) {
        IAggregatorV3 f = _feed[stock];
        if (address(f) == address(0)) revert UnknownStock(stock);
        (, int256 answer,, uint256 at,) = f.latestRoundData();
        if (answer <= 0) return (0, uint64(at));
        uint8 d = f.decimals();
        uint256 a = uint256(answer);
        if (d > 8) price = a / (10 ** (d - 8));
        else price = a * (10 ** (8 - d));
        updatedAt = uint64(at);
    }
}
