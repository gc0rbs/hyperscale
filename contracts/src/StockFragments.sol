// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {IStockFragments} from "./interfaces/IStockFragments.sol";

/// @title StockFragments – per-season ERC-1155; id = block index (docs/05 §7)
/// @notice 1,000,000 fragments (fragPerToken) = one Stock Token of stocks[id]. Minted only by the
///         mine on claim, burned only by the vault on redemption. Non-transferable in v1 (FR: doc 07).
contract StockFragments is ERC1155, IStockFragments {
    address public immutable mine;
    address public immutable vault;
    bool public immutable transfersEnabled;
    uint256 public immutable fragPerToken;
    address[] internal _stocks;
    mapping(uint256 => uint256) public totalSupply;

    constructor(
        address mine_,
        address vault_,
        address[] memory stocks_,
        uint256 fragPerToken_,
        bool transfersEnabled_,
        string memory uri_
    ) ERC1155(uri_) {
        mine = mine_;
        vault = vault_;
        _stocks = stocks_;
        fragPerToken = fragPerToken_;
        transfersEnabled = transfersEnabled_;
    }

    function mint(address to, uint256 id, uint256 amount) external {
        if (msg.sender != mine) revert NotMinter();
        totalSupply[id] += amount;
        _mint(to, id, amount, "");
    }

    function burn(address from, uint256 id, uint256 amount) external {
        if (msg.sender != vault) revert NotBurner();
        totalSupply[id] -= amount;
        _burn(from, id, amount);
    }

    function stockOf(uint256 id) external view returns (address) {
        return _stocks[id];
    }

    function _update(address from, address to, uint256[] memory ids, uint256[] memory values)
        internal
        override
    {
        if (!transfersEnabled && from != address(0) && to != address(0)) revert TransfersDisabled();
        super._update(from, to, ids, values);
    }
}
