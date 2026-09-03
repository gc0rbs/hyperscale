// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ISeasonMine} from "./ISeasonMine.sol";

/// @title ISeasonFactory – deploys and registers seasons
interface ISeasonFactory {
    error InvalidParams(string reason);

    event SeasonCreated(uint256 indexed seasonId, address mine, address fragments, address vault, bytes32 paramsHash);

    /// @dev Validates: array lengths == blocks == 4; gpuMultBps strictly increasing from 10000;
    ///      ocBoostBps * maxActiveOc <= 30000; heatPerOc[c] <= heatMax; difficulty[b] > 0 and
    ///      divisible by shiftsPerBlock; maxDurationSeconds >= 14 days; openTime >= block.timestamp + 48h.
    function create(
        ISeasonMine.SeasonParams calldata params,
        address eligibility,
        address oracle,
        address usdc,
        bool transfersEnabled
    ) external returns (uint256 seasonId, address mine, address fragments, address vault);

    function seasonCount() external view returns (uint256);
    function season(uint256 seasonId) external view returns (address mine, address fragments, address vault);
    function latest() external view returns (uint256 seasonId);
}
