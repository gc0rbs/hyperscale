// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IEligibility} from "../interfaces/IRedemptionVault.sol";

/// @notice Everyone may redeem in kind. For permissionless stock-token issuers (docs/07, Q1 option b).
contract OpenEligibility is IEligibility {
    function isEligible(address) external pure returns (bool) {
        return true;
    }
}
