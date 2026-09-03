// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IEligibility} from "../interfaces/IRedemptionVault.sol";

/// @notice Owner-managed allowlist of wallets eligible for in-kind redemption (docs/07 §1).
/// @dev Lives outside the immutable season contracts on purpose: the issuer's KYC list changes.
///      A season binds to one adapter address at creation; the adapter's owner is the treasury.
contract AllowlistEligibility is IEligibility, Ownable {
    mapping(address => bool) public eligible;

    event EligibilitySet(address indexed account, bool eligible);

    constructor(address owner_) Ownable(owner_) {}

    function set(address account, bool ok) external onlyOwner {
        eligible[account] = ok;
        emit EligibilitySet(account, ok);
    }

    function setMany(address[] calldata accounts, bool ok) external onlyOwner {
        for (uint256 i; i < accounts.length; ++i) {
            eligible[accounts[i]] = ok;
            emit EligibilitySet(accounts[i], ok);
        }
    }

    function isEligible(address account) external view returns (bool) {
        return eligible[account];
    }
}
