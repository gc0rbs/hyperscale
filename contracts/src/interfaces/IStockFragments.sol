// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IStockFragments – per-season ERC-1155; id = block index (stock index)
/// @dev Transfers other than mint/burn revert while transfersEnabled() == false (v1: always false).
interface IStockFragments {
    error TransfersDisabled();
    error NotMinter();
    error NotBurner();

    function mint(address to, uint256 id, uint256 amount) external; // SeasonMine only
    function burn(address from, uint256 id, uint256 amount) external; // RedemptionVault only

    function transfersEnabled() external view returns (bool);
    function mine() external view returns (address);
    function vault() external view returns (address);
    function stockOf(uint256 id) external view returns (address);
    function fragPerToken() external view returns (uint256);
    function totalSupply(uint256 id) external view returns (uint256);
}
