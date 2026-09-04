// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IRedemptionVault – holds the season's Stock Tokens and USDC reserve
interface IRedemptionVault {
    error AlreadyFunded();
    error NotFunded();
    error NotEligible();
    error ReserveInsufficient();
    error StalePrice();
    error WindowClosed();
    error WindowOpen();

    event Funded(uint256[] poolTokens, uint256 usdcReserve);
    event Redeemed(address indexed user, uint256 indexed id, uint256 fragments, uint256 tokens);
    event CashedOut(address indexed user, uint256 indexed id, uint256 fragments, uint256 usdc, uint256 fee);
    event Swept(address indexed to);

    /// @notice Operator pulls every block's Stock Token pool plus the USDC reserve. One-shot.
    function fund(uint256 usdcReserve) external;

    /// @notice Burn `fragments` of stock `id` and receive `fragments * 1e18 / fragPerToken` Stock Tokens.
    function redeem(uint256 id, uint256 fragments) external returns (uint256 tokens);

    /// @notice Burn fragments and receive USDC at oracle price minus cashOutFeeBps.
    function cashOut(uint256 id, uint256 fragments) external returns (uint256 usdcOut);

    /// @notice After closeX + redemptionDays (or cancellation), move all balances to treasury,
    ///         including any pool left unmined by a fail-safe close. Repeatable: an asset whose
    ///         transfer hook refuses the treasury stays and is retried on the next call.
    function sweep() external;

    function funded() external view returns (bool);
    function redemptionEnd() external view returns (uint64);
    function eligibility() external view returns (address);
    function oracle() external view returns (address);
    function usdc() external view returns (address);
    function reserve() external view returns (uint256);
    function quoteCashOut(uint256 id, uint256 fragments) external view returns (uint256 usdcOut, uint256 fee);
}

/// @title IEligibility – who may receive Stock Tokens in kind
interface IEligibility {
    function isEligible(address account) external view returns (bool);
}

/// @title IPriceOracle – USD price of an underlying, 1e8 scaled, with freshness
interface IPriceOracle {
    function usdPrice(address stock) external view returns (uint256 price, uint64 updatedAt);
}
