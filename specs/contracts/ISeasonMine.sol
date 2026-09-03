// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ISeasonMine – one 24-hour virtual mine (see docs/05-TECH-SPEC-CONTRACTS.md)
interface ISeasonMine {
    enum Phase { Funding, PreOpen, Open, Closed, Cancelled }
    enum Asset { RIG, LP }

    struct SeasonParams {
        address rig;
        address lpToken;             // address(0) disables LP staking
        uint256 lpWeightPerToken;    // 1e18-scaled RIG-equivalent per LP token, bonus included
        uint64  openTime;
        uint32  blockSeconds;        // 21600
        uint8   blocks;              // 4
        address[] stocks;            // stocks[b]
        uint256[] poolTokens;        // 1e18-scaled Stock Token amount per block
        uint256 fragPerToken;        // 1_000_000
        uint256 minStakeWeight;
        uint16  activationFeeBps;
        uint16[6] gpuMultBps;
        uint16[5] gpuCostBps;
        uint16[3] coolCostBps;
        uint8[4]  heatPerOc;
        uint8[4]  coolPerBlock;
        uint8   heatMax;
        uint16  ocCostBps;
        uint16  ocBoostBps;
        uint8   maxOcPerBlock;
        uint32  redemptionDays;
        uint16  cashOutFeeBps;
        uint32  pauseGraceSeconds;
        address treasury;
    }

    struct Rig {
        address owner;
        Asset   asset;
        uint128 amount;
        uint128 weight;
        uint8   gpuTier;
        uint8   coolingTier;
        uint8   heat;
        uint8   ocCount;
        uint8   lastBlock;
        uint128 baseHash;
        uint128 ocHash;
        uint256 debt;
        uint128[4] earned;   // 1e18-scaled fragments, settled, unclaimed
        uint8   claimedMask;
        bool    withdrawn;
    }

    // ── errors ──────────────────────────────────────────────────────────────
    error WrongPhase(Phase current);
    error NotOwner();
    error BelowMinStake();
    error LpDisabled();
    error MaxTier();
    error HeatTooHigh();
    error MaxOverclocks();
    error NotUnlocked(uint8 blockIdx);
    error AlreadyClaimed(uint8 blockIdx);
    error AlreadyWithdrawn();
    error PauseGraceNotElapsed();

    // ── events ──────────────────────────────────────────────────────────────
    event RigActivated(uint256 indexed rigId, address indexed owner, Asset asset, uint256 amount, uint256 weight, uint256 fee);
    event GpuUpgraded(uint256 indexed rigId, uint8 tier, uint256 burned);
    event CoolingUpgraded(uint256 indexed rigId, uint8 tier, uint256 burned);
    event Overclocked(uint256 indexed rigId, uint8 blockIdx, uint8 ocCount, uint8 heat, uint256 burned);
    event BlockSettled(uint8 indexed blockIdx, uint256 accAtEnd, uint256 totalHashAfter);
    event Claimed(uint256 indexed rigId, uint8 indexed blockIdx, uint256 fragments);
    event Withdrawn(uint256 indexed rigId, uint256 amount);
    event SeasonCancelled(uint64 at);

    // ── player actions ──────────────────────────────────────────────────────
    function activate(Asset asset, uint256 amount) external returns (uint256 rigId);
    function upgradeGpu(uint256 rigId) external;
    function upgradeCooling(uint256 rigId) external;
    function overclock(uint256 rigId) external;
    function claim(uint256 rigId, uint8 blockIdx) external returns (uint256 fragments);
    function claimAll(uint256 rigId) external returns (uint256[4] memory fragments);
    function withdraw(uint256 rigId) external;
    function emergencyWithdraw(uint256 rigId) external;

    // ── admin (emergency only) ──────────────────────────────────────────────
    function pause() external;
    function unpause() external;

    // ── views ───────────────────────────────────────────────────────────────
    function params() external view returns (SeasonParams memory);
    function phase() external view returns (Phase);
    function currentBlock() external view returns (uint8);
    function blockEnd(uint8 blockIdx) external view returns (uint64);
    function closeTime() external view returns (uint64);
    function totalHash() external view returns (uint256);
    function totalOcHash() external view returns (uint256);
    function accPerHash() external view returns (uint256);
    function accAtEnd(uint8 blockIdx) external view returns (uint256);
    function lastUpdate() external view returns (uint64);
    function ratePerSecond(uint8 blockIdx) external view returns (uint256);
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
