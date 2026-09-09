// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IRoundVault – holds the mine's Stock Tokens and USDG reserve, redeems fragments any time
interface IRoundVault {
    error NotOperator();
    error NotEligible();
    error ReserveInsufficient();
    error StalePrice();
    error NotHalted();

    event Redeemed(address indexed user, uint256 indexed id, uint256 fragments, uint256 tokens);
    event CashedOut(address indexed user, uint256 indexed id, uint256 fragments, uint256 usdc, uint256 fee);
    event ReserveToppedUp(address indexed from, uint256 amount);
    event Rescued(address indexed to, uint256[] tokens, uint256 usdc);

    /// @notice Burn `fragments` of stock `id` and receive `fragments * 1e18 / fragPerToken` Stock Tokens.
    function redeem(uint256 id, uint256 fragments) external returns (uint256 tokens);
    /// @notice Burn fragments and receive USDG at oracle price minus cashOutFeeBps.
    function cashOut(uint256 id, uint256 fragments) external returns (uint256 usdcOut);
    /// @notice Add USDG to the cash-out reserve. Anyone may call.
    function topUpReserve(uint256 amount) external;
    /// @notice After the mine is halted: move everything above the stock behind un-redeemed fragments,
    ///         plus the whole reserve, to the operator. Repeatable; an asset whose hook refuses the
    ///         operator stays and is retried.
    function rescue() external;

    function mine() external view returns (address);
    function operator() external view returns (address);
    function eligibility() external view returns (address);
    function oracle() external view returns (address);
    function usdc() external view returns (address);
    function reserve() external view returns (uint256);
    function maxPriceAge() external view returns (uint32);
    function stockOf(uint256 id) external view returns (address);
    /// @notice Stock the vault must keep for id: (minted − redeemed) × 1e18 / fragPerToken, rounded up.
    function requiredOf(uint256 id) external view returns (uint256);
    function redeemedOf(uint256 id) external view returns (uint256);
    function quoteCashOut(uint256 id, uint256 fragments) external view returns (uint256 usdcOut, uint256 fee);
}
