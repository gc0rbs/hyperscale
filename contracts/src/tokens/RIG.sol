// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/// @title RIG – the dev stand-in for the game token ($VRAM on mainnet is the Pons launch; docs/04 §1)
/// @notice Fixed supply minted once at genesis. Burnable (upgrade spend is burned). Permit for gasless
///         approvals. No mint, no owner, no hooks.
contract RIG is ERC20, ERC20Burnable, ERC20Permit {
    uint256 public constant GENESIS_SUPPLY = 1_000_000_000e18;

    constructor(address genesisRecipient) ERC20("Hyperscaler VRAM", "VRAM") ERC20Permit("Hyperscaler VRAM") {
        _mint(genesisRecipient, GENESIS_SUPPLY);
    }
}
