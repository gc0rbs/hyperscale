// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ISeasonMine – one progress-based virtual mine (see docs/05-TECH-SPEC-CONTRACTS.md)
/// @notice Blocks are found by accumulated work (hash-seconds), not by time. Duration is an outcome.
interface ISeasonMine {
    enum Phase {
        Funding,
        PreOpen,
        Open,
        Closed,
        Cancelled
    }
    enum Asset {
        RIG,
        LP
    }

    struct SeasonParams {
        address rig;
        address lpToken; // address(0) disables LP staking
        uint256 lpWeightPerToken; // 1e18-scaled RIG-equivalent per LP token, bonus included
        uint64 openTime;
        uint32 maxDurationSeconds; // fail-safe close after openTime; not a schedule
        uint8 blocks; // 4
        uint8 shiftsPerBlock; // 8
        address[] stocks; // stocks[b]
        uint256[] poolTokens; // 1e18-scaled Stock Token amount per block
        uint256[] difficulty; // hash-seconds per block; divisible by shiftsPerBlock
        uint256 fragPerToken; // 1_000_000
        uint256 minStakeWeight;
        uint16 activationFeeBps;
        uint16 earlyExitFeeBps;
        uint16[6] gpuMultBps;
        uint16[5] gpuCostBps;
        uint16[3] coolCostBps;
        uint8[4] heatPerOc;
        uint8[4] coolPerShift;
        uint8 heatMax;
        uint16 ocCostBps;
        uint16 ocBoostBps;
        uint8 maxActiveOc;
        uint8 ocShiftSpan; // overclocks expire at end of shift (current + span)
        uint32 redemptionDays;
        uint16 cashOutFeeBps;
        uint32 pauseGraceSeconds;
        address treasury;
    }

    struct Rig {
        address owner;
        Asset asset;
        uint128 amount;
        uint128 weight;
        uint8 gpuTier;
        uint8 coolingTier;
        uint8 heat;
        uint8 activeOc;
        uint16 ocExpiryShift;
        uint16 lastShift;
        uint256 lastX; // X-time (seconds × 1e18) of last settlement
        uint128 baseHash;
        uint128 ocHash;
        uint128[4] earned; // 1e18-scaled fragments, settled, unclaimed
        uint8 claimedMask;
        bool inactive;
    }

    struct Progress {
        uint8 blockIdx; // current block (== blocks when closed)
        uint16 shift; // global shift index
        uint256 workInShift;
        uint256 shiftDifficulty;
        uint256 workRemainingInBlock;
        uint256 workRemainingInSeason;
        uint256 closeX; // 0 while open
    }

    struct Eta {
        uint256 toShiftEnd; // seconds at current totalHash; 0 if idle or closed
        uint256 toBlockFound;
        uint256 toClose;
        bool idle; // totalHash == 0
    }

    // ── errors ──────────────────────────────────────────────────────────────
    error WrongPhase(Phase current);
    error NotOwner();
    error RigInactive();
    error BelowMinStake();
    error LpDisabled();
    error MaxTier();
    error HeatTooHigh();
    error MaxOverclocks();
    error NotFound(uint8 blockIdx);
    error AlreadyClaimed(uint8 blockIdx);
    error PoolExhausted(uint8 blockIdx);
    error PauseGraceNotElapsed();

    // ── events ──────────────────────────────────────────────────────────────
    event RigActivated(
        uint256 indexed rigId, address indexed owner, Asset asset, uint256 amount, uint256 weight, uint256 fee
    );
    event GpuUpgraded(uint256 indexed rigId, uint8 tier, uint256 burned);
    event CoolingUpgraded(uint256 indexed rigId, uint8 tier, uint256 burned);
    event Overclocked(
        uint256 indexed rigId, uint16 shift, uint8 activeOc, uint16 expiryShift, uint8 heat, uint256 burned
    );
    event ShiftEnded(uint16 indexed shift, uint256 endX, uint256 totalHashAfter);
    event BlockFound(uint8 indexed blockIdx, uint256 endX);
    event ClosedByFailSafe(uint16 shift);
    event Claimed(uint256 indexed rigId, uint8 indexed blockIdx, uint256 fragments);
    event Exited(uint256 indexed rigId, uint256 returned, uint256 fee);
    event Withdrawn(uint256 indexed rigId, uint256 amount);
    event SeasonCancelled(uint64 at);

    // ── permissionless maintenance ──────────────────────────────────────────
    /// @notice Advances shift/block discovery up to now. Anyone may call; correctness never depends on it.
    function poke() external;

    // ── player actions ──────────────────────────────────────────────────────
    function activate(Asset asset, uint256 amount) external returns (uint256 rigId);
    function upgradeGpu(uint256 rigId) external;
    function upgradeCooling(uint256 rigId) external;
    function overclock(uint256 rigId) external;
    function claim(uint256 rigId, uint8 blockIdx) external returns (uint256 minted);
    function claimAll(uint256 rigId) external returns (uint256[4] memory minted);
    /// @notice Leave while the mine is open: deposit minus earlyExitFee returned, earned fragments kept.
    function exit(uint256 rigId) external;
    function withdraw(uint256 rigId) external;
    function emergencyWithdraw(uint256 rigId) external;

    // ── admin (emergency only) ──────────────────────────────────────────────
    /// @notice Guardian emergency stop; reverts once the season has closed. Claims and post-close
    ///         withdrawals ignore a pause after the close is persisted, so earned fragments can never
    ///         be stranded by a lost guardian key.
    function pause() external;
    function unpause() external;

    // ── views ───────────────────────────────────────────────────────────────
    function params() external view returns (SeasonParams memory);
    function phase() external view returns (Phase);
    function progress() external view returns (Progress memory);
    function eta() external view returns (Eta memory);
    function shift() external view returns (uint16);
    function shiftEndX(uint16 shiftIdx) external view returns (uint256);
    function blockEndX(uint8 blockIdx) external view returns (uint256);
    function closeX() external view returns (uint256);
    function lastX() external view returns (uint256);
    function totalHash() external view returns (uint256);
    function ocExpiring(uint16 shiftIdx) external view returns (uint256);
    function ratePerWork(uint8 blockIdx) external view returns (uint256);
    function mintedFragments(uint8 blockIdx) external view returns (uint256);
    function rigs(uint256 rigId) external view returns (Rig memory);
    function rigHash(uint256 rigId) external view returns (uint256);
    /// @notice settled + simulated-unsettled fragments for a block, in whole fragments
    function pending(uint256 rigId, uint8 blockIdx) external view returns (uint256);
    function rigsOf(address owner) external view returns (uint256[] memory);
    function gpuCost(uint256 rigId) external view returns (uint256);
    function coolingCost(uint256 rigId) external view returns (uint256);
    function overclockCost(uint256 rigId) external view returns (uint256);
    function fragments() external view returns (address);
    function vault() external view returns (address);
}
