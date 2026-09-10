// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IFeeFunder – turns the Pons creator fees into the running round's pot (docs/13 §2)
/// @notice How Pons V2 pays (verified on chain 2026-09-10 from the verified `PonsV2LaunchFactory`,
///         `PonsV2BondingCurve`, `PonsV2MemeHook` sources; docs/DECISIONS.md): a launch names a
///         **creator fee recipient** and a creator tax (up to 10% of every trade). The tax and the
///         creator's share of the base fee are paid in ETH, but never pushed: the bonding curve (before
///         graduation) and the meme hook (after it) *credit* the recipient in the shared
///         `PonsV2FeeEscrow`, and the recipient must call `claim()` on the escrow to receive the ETH.
///         Sweeping the fees into the escrow is done by the Pons sweep operator, or by the recipient
///         itself when no internal swap is needed. This contract is that recipient.
///
///         A flusher (the keeper, holding only gas) calls `flush` every few minutes. The contract first
///         runs its **collect calls**, owner-configured calls made in order with failures swallowed
///         (`curve.sweepFees(0)`, `hook.sweepPoolFees(poolId, 0, 0)`, `escrow.claim()`), wraps every
///         ETH it holds, splits the WETH across the four Stock Tokens by share, swaps directly against
///         their Uniswap v3 WETH pools, and funds every token bought into the mine's running round. No
///         key ever holds the fees; the flusher only supplies the slippage bounds it quoted off-chain.
///         The owner (the mine's operator) wires the collect calls once the token exists, can change
///         pools and shares, and can sweep the contract, which is the escape hatch if a pool dies.
interface IFeeFunder {
    struct Leg {
        address pool; // Uniswap v3 pool of WETH against stocks[stock]
        uint8 stock; // index into the mine's stocks
        uint16 shareBps; // share of each flush's WETH; legs sum to 10_000
    }

    /// @dev A call made at the start of every flush to pull what Pons owes this contract. Made with
    ///      no value; a revert is swallowed (nothing owed is not an error), so a call for a phase that
    ///      is over (the curve after graduation) can stay configured.
    struct Collect {
        address target;
        bytes data;
    }

    error NotOwner();
    error NotFlusher();
    error NotPool();
    error BadLegs();
    error BadCollect();
    error NothingToFlush();
    error Slippage(uint8 stock, uint256 out, uint256 minOut);

    event Flushed(address indexed by, uint256 wethIn, uint256[] tokensOut, uint64 round);
    event LegsSet(Leg[] legs);
    event CollectsSet(Collect[] collects);
    event FlusherSet(address indexed flusher, bool allowed);
    event Swept(address indexed to, address indexed token, uint256 amount);

    /// @notice Run the collect calls, wrap all ETH, swap all WETH into the four stocks and fund the
    ///         mine's running round. `minOut[i]` bounds leg i (the flusher quotes off-chain: simulate
    ///         with zeros, then send with a haircut). Reverts with `Slippage` if any swap pays less, and
    ///         with `NothingToFlush` when there is no WETH to spend after collecting.
    /// @return wethIn total WETH spent on the legs (ETH collected and wrapped + WETH held)
    /// @return tokensOut stock received and funded per leg
    function flush(uint256[] calldata minOut) external returns (uint256 wethIn, uint256[] memory tokensOut);

    // ── owner ────────────────────────────────────────────────────────────────
    function setLegs(Leg[] calldata legs) external;
    /// @notice Wire the Pons collect calls once the token exists (and re-point them if Pons changes).
    ///         At most 8; a target may not be zero, WETH, a configured pool or the mine.
    function setCollects(Collect[] calldata collects) external;
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
    function collectCount() external view returns (uint256);
    function collect(uint256 i) external view returns (Collect memory);
    /// @notice ETH plus WETH held here, waiting to be flushed (what the escrow still holds for this
    ///         contract is not included; simulate `flush` to see the whole picture).
    function pending() external view returns (uint256);
}
