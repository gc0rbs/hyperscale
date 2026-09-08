// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IFeeFunder – turns the Pons trading tax (ETH) into the running round's pot (docs/13 §2)
/// @notice Set this contract as the tax recipient. ETH accumulates here; a flusher (the keeper) calls
///         `flush` every few minutes: the ETH is wrapped, split across the four Stock Tokens by share,
///         swapped on their Uniswap v3 pools against WETH, and every token bought is funded into the
///         mine's running round. No key ever holds the fees; the flusher only supplies the slippage
///         bound it quoted off-chain. The owner (the mine's operator) can change pools and shares and
///         sweep the contract, which is the escape hatch if a pool dies.
interface IFeeFunder {
    struct Leg {
        address pool; // Uniswap v3 pool of WETH against stocks[stock]
        uint8 stock; // index into the mine's stocks
        uint16 shareBps; // share of each flush's ETH; legs sum to 10_000
    }

    error NotOwner();
    error NotFlusher();
    error NotPool();
    error BadLegs();
    error NothingToFlush();
    error Slippage(uint8 stock, uint256 out, uint256 minOut);

    event Flushed(address indexed by, uint256 ethIn, uint256[] tokensOut, uint64 round);
    event LegsSet(Leg[] legs);
    event FlusherSet(address indexed flusher, bool allowed);
    event Swept(address indexed to, address indexed token, uint256 amount);

    /// @notice Swap the whole ETH balance into the four stocks and fund the mine's running round.
    ///         `minOut[i]` bounds leg i (the flusher quotes off-chain: simulate with zeros, then send
    ///         with a haircut). Reverts with `Slippage` if any leg pays less.
    function flush(uint256[] calldata minOut) external returns (uint256[] memory tokensOut);

    // ── owner ────────────────────────────────────────────────────────────────
    function setLegs(Leg[] calldata legs) external;
    function setFlusher(address flusher, bool allowed) external;
    /// @notice Move ETH (`token == address(0)`) or any token held here to `to`.
    function sweep(address token, address to, uint256 amount) external;

    // ── views ────────────────────────────────────────────────────────────────
    function owner() external view returns (address);
    function mine() external view returns (address);
    function weth() external view returns (address);
    function flushers(address account) external view returns (bool);
    function legCount() external view returns (uint256);
    function leg(uint256 i) external view returns (Leg memory);
    /// @notice ETH waiting to be flushed.
    function pending() external view returns (uint256);
}
