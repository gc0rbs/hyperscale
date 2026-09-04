// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockStockToken – models the expected Robinhood Stock Token restriction (docs/07 §1)
/// @notice ERC-20 with an owner-managed allowlist; transfers require both sides to be allowlisted
///         (mint/burn exempt). The real hook interface is unknown (PRD §10.2); the vault treats the
///         token as an opaque ERC-20 that may revert on transfer.
contract MockStockToken is ERC20 {
    address public immutable owner;
    mapping(address => bool) public allowed;
    bool public restricted = true;

    error NotAllowed(address account);
    error NotOwner();

    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {
        owner = msg.sender;
        allowed[msg.sender] = true;
    }

    function mint(address to, uint256 amount) external {
        if (msg.sender != owner) revert NotOwner();
        _mint(to, amount);
    }

    function setAllowed(address account, bool ok) external {
        if (msg.sender != owner) revert NotOwner();
        allowed[account] = ok;
    }

    function setRestricted(bool on) external {
        if (msg.sender != owner) revert NotOwner();
        restricted = on;
    }

    function _update(address from, address to, uint256 value) internal override {
        if (restricted) {
            if (from != address(0) && !allowed[from]) revert NotAllowed(from);
            if (to != address(0) && !allowed[to]) revert NotAllowed(to);
        }
        super._update(from, to, value);
    }
}
