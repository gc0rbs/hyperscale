// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ISeasonMine} from "../interfaces/ISeasonMine.sol";
import {SeasonMine} from "../SeasonMine.sol";
import {StockFragments} from "../StockFragments.sol";
import {RedemptionVault} from "../RedemptionVault.sol";

/// @dev Each season contract is created by its own tiny deployer so the factory's runtime stays
///      under the EIP-170 size limit. A deployer's CREATE nonce is `deployments + 1`, which the
///      factory uses to predict addresses before any of the three mutually-referencing contracts exist.
contract MineDeployer {
    address public immutable creator;
    address public factory;
    uint64 public deployments;

    error NotFactory();
    error AlreadyInitialized();

    constructor() {
        creator = msg.sender;
    }

    /// @dev One-time wiring by whoever deployed this deployer; the factory is created afterwards
    ///      because embedding three creation codes in one factory exceeds the EIP-3860 initcode limit.
    function init(address factory_) external {
        if (msg.sender != creator || factory != address(0)) revert AlreadyInitialized();
        factory = factory_;
    }

    function deploy(ISeasonMine.SeasonParams calldata p, address fragments, address vault)
        external
        returns (address)
    {
        if (msg.sender != factory) revert NotFactory();
        deployments += 1;
        return address(new SeasonMine(p, fragments, vault));
    }
}

contract FragmentsDeployer {
    address public immutable creator;
    address public factory;
    uint64 public deployments;

    error NotFactory();
    error AlreadyInitialized();

    constructor() {
        creator = msg.sender;
    }

    /// @dev One-time wiring by whoever deployed this deployer; the factory is created afterwards
    ///      because embedding three creation codes in one factory exceeds the EIP-3860 initcode limit.
    function init(address factory_) external {
        if (msg.sender != creator || factory != address(0)) revert AlreadyInitialized();
        factory = factory_;
    }

    function deploy(
        address mine,
        address vault,
        address[] calldata stocks,
        uint256 fragPerToken,
        bool transfersEnabled,
        string calldata uri
    ) external returns (address) {
        if (msg.sender != factory) revert NotFactory();
        deployments += 1;
        return address(new StockFragments(mine, vault, stocks, fragPerToken, transfersEnabled, uri));
    }
}

contract VaultDeployer {
    address public immutable creator;
    address public factory;
    uint64 public deployments;

    error NotFactory();
    error AlreadyInitialized();

    constructor() {
        creator = msg.sender;
    }

    /// @dev One-time wiring by whoever deployed this deployer; the factory is created afterwards
    ///      because embedding three creation codes in one factory exceeds the EIP-3860 initcode limit.
    function init(address factory_) external {
        if (msg.sender != creator || factory != address(0)) revert AlreadyInitialized();
        factory = factory_;
    }

    function deploy(RedemptionVault.Config calldata c) external returns (address) {
        if (msg.sender != factory) revert NotFactory();
        deployments += 1;
        return address(new RedemptionVault(c));
    }
}
