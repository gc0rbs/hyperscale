// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IFeeFunder – turns the Pons trading fees into the running round's pot (docs/13 §2)
/// @notice How Pons pays (verified on chain 2026-09-10, docs/DECISIONS.md): a Pons token has no
///         transfer tax. Its liquidity sits in a locked Uniswap v3 position and the creator's share of
///         that pool's fee (the pool fee tier minus the Pons protocol share) is paid out by the Pons
///         locker's `collectFees(token)` as plain ERC-20 transfers of BOTH pool assets (WETH and the
///         token) to the token's fee wallet. This contract is that fee wallet.
///
///         A flusher (the keeper, holding only gas) calls `flush` every few minutes: the contract
///         collects from the locker, wraps any ETH it holds, sells the token half for WETH on the
///         token's own pool, splits the WETH across the four Stock Tokens by share, swaps on their
///         WETH pools, and funds every token bought into the mine's running round. No key ever holds
///         the fees; the flusher only supplies the slippage bounds it quoted off-chain. The owner (the
///         mine's operator) wires the Pons source once the token exists, can change pools and shares,
///         and can sweep the contract, which is the escape hatch if a pool dies.
interface IFeeFunder {
    struct Leg {
        address pool; // Uniswap v3 pool of WETH against stocks[stock]
        uint8 stock; // index into the mine's stocks
        uint16 shareBps; // share of each flush's WETH; legs sum to 10_000
    }

    /// @dev Where the fees come from. `locker` may be zero (no collect step: fees are pushed here);
    ///      `token`/`pool` may be zero (no token leg: only ETH/WETH is flushed).
    struct Source {
        address locker; // Pons locker: `collectFees(token)` pays this contract
        address token; // the game token ($VRAM), the other asset of the fee stream
        address pool; // Uniswap v3 pool of WETH against `token`, where the token half is sold
    }

    error NotOwner();
    error NotFlusher();
    error NotPool();
    error BadLegs();
    error BadSource();
    error NothingToFlush();
    error Slippage(uint8 stock, uint256 out, uint256 minOut);
    error TokenSlippage(uint256 out, uint256 minOut);

    event Flushed(address indexed by, uint256 wethIn, uint256 tokenIn, uint256[] tokensOut, uint64 round);
    event LegsSet(Leg[] legs);
    event SourceSet(address indexed locker, address indexed token, address indexed pool);
    event FlusherSet(address indexed flusher, bool allowed);
    event Swept(address indexed to, address indexed token, uint256 amount);

    /// @notice Collect from the Pons locker (if wired), sell the token half, swap all WETH into the
    ///         four stocks and fund the mine's running round. `minWethFromToken` bounds the token sale,
    ///         `minOut[i]` bounds leg i (the flusher quotes off-chain: simulate with zeros, then send with
    ///         a haircut). Reverts with `TokenSlippage` / `Slippage` if any swap pays less, and with
    ///         `NothingToFlush` when there is no WETH to spend.
    /// @return wethIn total WETH spent on the legs (ETH wrapped + WETH held + WETH from the token sale)
    /// @return wethFromToken WETH received for the token half
    /// @return tokensOut stock received and funded per leg
    function flush(uint256 minWethFromToken, uint256[] calldata minOut)
        external
        returns (uint256 wethIn, uint256 wethFromToken, uint256[] memory tokensOut);

    // ── owner ────────────────────────────────────────────────────────────────
    function setLegs(Leg[] calldata legs) external;
    /// @notice Wire the Pons fee source once the token exists (and re-point it if a pool changes).
    function setSource(Source calldata source) external;
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
    function source() external view returns (Source memory);
    /// @notice ETH plus WETH held here, waiting to be flushed (what the locker has not yet paid out is
    ///         not included; simulate `flush` to see the whole picture).
    function pending() external view returns (uint256);
    /// @notice Game token held here, waiting to be sold on the next flush.
    function pendingToken() external view returns (uint256);
}
