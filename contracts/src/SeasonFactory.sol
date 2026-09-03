// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ISeasonFactory} from "./interfaces/ISeasonFactory.sol";
import {ISeasonMine} from "./interfaces/ISeasonMine.sol";
import {RedemptionVault} from "./RedemptionVault.sol";
import {MineDeployer, FragmentsDeployer, VaultDeployer} from "./factory/Deployers.sol";
import {CreateAddress} from "./factory/CreateAddress.sol";

/// @title SeasonFactory – deploys and registers seasons (docs/05 §1, §12)
/// @notice Validates parameters, deploys the three mutually-referencing season contracts at predicted
///         addresses, and records them. The caller of `create` becomes the vault's funding operator.
contract SeasonFactory is ISeasonFactory {
    struct Season {
        address mine;
        address fragments;
        address vault;
    }

    uint256 internal constant BPS = 10_000;

    MineDeployer public immutable mineDeployer;
    FragmentsDeployer public immutable fragmentsDeployer;
    VaultDeployer public immutable vaultDeployer;
    string public baseUri;
    Season[] internal _seasons;

    error AddressMismatch(string which);

    /// @param mineDeployer_ etc. Pre-deployed deployers; call `init(factory)` on each after this.
    constructor(
        string memory baseUri_,
        address mineDeployer_,
        address fragmentsDeployer_,
        address vaultDeployer_
    ) {
        mineDeployer = MineDeployer(mineDeployer_);
        fragmentsDeployer = FragmentsDeployer(fragmentsDeployer_);
        vaultDeployer = VaultDeployer(vaultDeployer_);
        baseUri = baseUri_;
    }

    /// @inheritdoc ISeasonFactory
    function create(
        ISeasonMine.SeasonParams calldata params,
        address eligibility,
        address oracle,
        address usdc,
        bool transfersEnabled
    ) external returns (uint256 seasonId, address mine, address fragments, address vault) {
        _validate(params);

        mine = CreateAddress.predict(address(mineDeployer), mineDeployer.deployments() + 1);
        fragments = CreateAddress.predict(address(fragmentsDeployer), fragmentsDeployer.deployments() + 1);
        vault = CreateAddress.predict(address(vaultDeployer), vaultDeployer.deployments() + 1);

        if (mineDeployer.deploy(params, fragments, vault) != mine) revert AddressMismatch("mine");
        if (
            fragmentsDeployer.deploy(
                    mine, vault, params.stocks, params.fragPerToken, transfersEnabled, baseUri
                ) != fragments
        ) revert AddressMismatch("fragments");
        RedemptionVault.Config memory c = RedemptionVault.Config({
            mine: mine,
            fragments: fragments,
            usdc: usdc,
            eligibility: eligibility,
            oracle: oracle,
            treasury: params.treasury,
            operator: msg.sender,
            cashOutFeeBps: params.cashOutFeeBps,
            redemptionDays: params.redemptionDays,
            fragPerToken: params.fragPerToken,
            stocks: params.stocks,
            poolTokens: params.poolTokens
        });
        if (vaultDeployer.deploy(c) != vault) revert AddressMismatch("vault");

        seasonId = _seasons.length;
        _seasons.push(Season(mine, fragments, vault));
        emit SeasonCreated(seasonId, mine, fragments, vault, keccak256(abi.encode(params)));
    }

    function seasonCount() external view returns (uint256) {
        return _seasons.length;
    }

    function season(uint256 seasonId) external view returns (address mine, address fragments, address vault) {
        Season storage s = _seasons[seasonId];
        return (s.mine, s.fragments, s.vault);
    }

    function latest() external view returns (uint256) {
        if (_seasons.length == 0) revert InvalidParams("no seasons");
        return _seasons.length - 1;
    }

    /// @dev Validation rules from docs/05 §9 (factory misconfiguration row).
    function _validate(ISeasonMine.SeasonParams calldata p) internal view {
        if (p.blocks != 4) revert InvalidParams("blocks must be 4");
        if (p.stocks.length != 4 || p.poolTokens.length != 4 || p.difficulty.length != 4) {
            revert InvalidParams("array lengths");
        }
        if (p.shiftsPerBlock == 0 || p.shiftsPerBlock > 64) revert InvalidParams("shiftsPerBlock");
        if (p.gpuMultBps[0] != BPS) revert InvalidParams("gpuMultBps[0]");
        for (uint256 i = 1; i < 6; ++i) {
            if (p.gpuMultBps[i] <= p.gpuMultBps[i - 1]) revert InvalidParams("gpuMultBps increasing");
        }
        if (uint256(p.ocBoostBps) * p.maxActiveOc > 30_000) revert InvalidParams("ocBoost*maxActiveOc");
        if (p.maxActiveOc == 0 || p.ocShiftSpan == 0) revert InvalidParams("overclock config");
        for (uint256 c; c < 4; ++c) {
            if (p.heatPerOc[c] > p.heatMax) revert InvalidParams("heatPerOc > heatMax");
        }
        for (uint256 b; b < 4; ++b) {
            if (p.difficulty[b] == 0 || p.difficulty[b] % p.shiftsPerBlock != 0) {
                revert InvalidParams("difficulty divisible by shiftsPerBlock");
            }
            if (p.poolTokens[b] == 0 || p.stocks[b] == address(0)) revert InvalidParams("pool");
        }
        if (p.maxDurationSeconds < 14 days) revert InvalidParams("maxDuration >= 14 days");
        if (p.openTime < block.timestamp + 48 hours) revert InvalidParams("openTime >= now + 48h");
        if (p.fragPerToken == 0) revert InvalidParams("fragPerToken");
        if (p.rig == address(0) || p.treasury == address(0)) revert InvalidParams("addresses");
        if (p.activationFeeBps > 1000 || p.earlyExitFeeBps > 2000 || p.cashOutFeeBps > 1000) {
            revert InvalidParams("fees");
        }
        if (p.redemptionDays == 0 || p.pauseGraceSeconds == 0) revert InvalidParams("windows");
    }
}
