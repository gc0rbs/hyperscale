// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IRoundMine – the continuous mine with hourly rounds (docs/13-ROUNDS.md)
/// @notice Rounds close on the clock. Each round's pot (per stock) is split among rigs by the work
///         they did in that round, is claimable for `claimSeconds` after the round closes, and rolls
///         into the next round if unclaimed. Funding is a schedule of stock per round, filled by
///         anyone (the fee wallet) and taken back by the operator only for rounds that have not begun.
interface IRoundMine {
    struct RoundParams {
        address rig;
        address[] stocks; // 4
        address treasury; // guardian (pause) and fee recipient
        uint64 genesis; // start of round 0
        uint32 roundSeconds; // 3600
        uint32 claimSeconds; // 900; < roundSeconds
        uint256 fragPerToken; // 1_000_000
        uint256 minStakeWeight;
        uint16 activationFeeBps;
        uint16 exitFeeBps;
        uint16[6] gpuMultBps;
        uint16[5] gpuCostBps;
        uint16[3] coolCostBps;
        uint8[4] heatPerOc;
        uint8[4] coolPerRound;
        uint8 heatMax;
        uint16 ocCostBps;
        uint16 ocBoostBps;
        uint8 maxActiveOc;
        uint8 ocRoundSpan; // overclocks expire at the end of round (current + span)
        uint32 pauseGraceSeconds;
    }

    struct Rig {
        address owner;
        uint128 amount; // deposit = weight
        uint8 gpuTier;
        uint8 coolingTier;
        uint8 heat;
        uint8 activeOc;
        uint64 ocExpiryRound; // overclock hash counts through the end of this round
        uint64 lastRound; // round of last settlement (heat decay)
        uint64 lastTime; // timestamp of last settlement
        uint64 claimedPlusOne; // 1 + the last round claimed (0 = none)
        uint128 baseHash;
        uint128 ocHash;
        bool inactive;
    }

    // ── errors ──────────────────────────────────────────────────────────────
    error NotOwner();
    error NotOperator();
    error NotGuardian();
    error RigInactive();
    error BelowMinStake();
    error MaxTier();
    error HeatTooHigh();
    error MaxOverclocks();
    error Halted();
    error NotHalted();
    error NothingToClaim();
    error ClaimWindowClosed();
    error PauseGraceNotElapsed();
    error InvalidParams(string reason);
    error RoundStarted();

    // ── events ──────────────────────────────────────────────────────────────
    event RigActivated(uint256 indexed rigId, address indexed owner, uint256 amount, uint256 fee);
    event GpuUpgraded(uint256 indexed rigId, uint8 tier, uint256 burned);
    event CoolingUpgraded(uint256 indexed rigId, uint8 tier, uint256 burned);
    event Overclocked(
        uint256 indexed rigId, uint64 round, uint8 activeOc, uint64 expiryRound, uint8 heat, uint256 burned
    );
    event RoundClosed(uint64 indexed round, uint256 work, uint256[] pot, uint256 totalHashAfter);
    event Claimed(uint256 indexed rigId, uint64 indexed round, uint256[] fragments);
    event Exited(uint256 indexed rigId, uint256 returned, uint256 fee);
    event Withdrawn(uint256 indexed rigId, uint256 amount);
    event Funded(address indexed from, uint8 indexed stock, uint256 amount, uint64 firstRound, uint64 rounds);
    event Unscheduled(uint8 indexed stock, uint64 fromRound, uint256 amount);
    event MineHalted(uint64 at, address by);

    // ── permissionless maintenance ──────────────────────────────────────────
    /// @notice Records every round boundary up to now (work, pot, overclock expiry). Anyone may call;
    ///         correctness never depends on it.
    function poke() external;

    // ── funding ─────────────────────────────────────────────────────────────
    /// @notice Pull `amount` of stock `s` into the vault and schedule `amount / rounds` into each of the
    ///         next `rounds` rounds, starting with the round after the current one. Anyone may fund.
    function fund(uint8 s, uint256 amount, uint64 rounds) external;
    /// @notice Operator: remove everything scheduled for stock `s` from `fromRound` (which must not have
    ///         started) onwards and send it from the vault to the operator.
    function unschedule(uint8 s, uint64 fromRound) external returns (uint256 amount);

    // ── player actions ──────────────────────────────────────────────────────
    function activate(uint256 amount) external returns (uint256 rigId);
    function upgradeGpu(uint256 rigId) external;
    function upgradeCooling(uint256 rigId) external;
    function overclock(uint256 rigId) external;
    /// @notice Claim the latest closed round's share for one rig, inside its claim window.
    function claim(uint256 rigId) external returns (uint256[] memory fragments);
    /// @notice `claim` for every rig of the caller that has something to claim; never reverts for
    ///         rigs with nothing.
    function claimAll() external returns (uint256[] memory fragments);
    /// @notice Leave: deposit minus `exitFeeBps` back. Work done in the current round still counts.
    function exit(uint256 rigId) external;
    /// @notice Full deposit back, only when the mine is halted (operator `halt`, or a pause that
    ///         outlived its grace period, which halts it).
    function emergencyWithdraw(uint256 rigId) external;

    // ── admin ───────────────────────────────────────────────────────────────
    /// @notice Operator: stop the mine for good. No round closes after this; the vault's `rescue`
    ///         returns unclaimed pots and everything scheduled to the operator. Client decision
    ///         2026-09-08, stated on the site.
    function halt() external;
    function pause() external;
    function unpause() external;

    // ── views ───────────────────────────────────────────────────────────────
    function params() external view returns (RoundParams memory);
    function operator() external view returns (address);
    function vault() external view returns (address);
    function fragments() external view returns (address);
    function halted() external view returns (bool);
    /// @notice Current round index at `block.timestamp` (0 before genesis + roundSeconds means round 0).
    function currentRound() external view returns (uint64);
    /// @notice Timestamp at which round `r` closes.
    function roundEnd(uint64 r) external view returns (uint64);
    /// @notice Number of rounds whose close has been recorded on chain (rounds 0 .. closedRounds-1).
    function closedRounds() external view returns (uint64);
    function totalHash() external view returns (uint256);
    /// @notice Work recorded for round `r` (final once closed; live otherwise, simulated to now).
    function roundWork(uint64 r) external view returns (uint256);
    /// @notice Pot of stock `s` in round `r`: final once closed; for the current round the scheduled
    ///         amount plus the rollover known so far.
    function pot(uint64 r, uint8 s) external view returns (uint256);
    function claimedOf(uint64 r, uint8 s) external view returns (uint256);
    function scheduled(uint8 s, uint64 r) external view returns (uint256);
    function rigs(uint256 rigId) external view returns (Rig memory);
    function rigCount() external view returns (uint256);
    function rigsOf(address owner) external view returns (uint256[] memory);
    function rigHash(uint256 rigId) external view returns (uint256);
    /// @notice The rig's work in round `r` (simulated to now for the current round).
    function rigWork(uint256 rigId, uint64 r) external view returns (uint256);
    /// @notice What `claim` would pay now for the latest closed round (zero outside the window).
    function claimable(uint256 rigId) external view returns (uint256[] memory fragments);
    function gpuCost(uint256 rigId) external view returns (uint256);
    function coolingCost(uint256 rigId) external view returns (uint256);
    function overclockCost(uint256 rigId) external view returns (uint256);
}
