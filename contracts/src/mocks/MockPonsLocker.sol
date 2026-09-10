// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @dev Models what the FeeFunder needs from PonsLaunchLocker (verified on chain 4663, 2026-09-10):
///      `collectFees(token)` pays the fee recipient BOTH pool assets as ERC-20 transfers, only the
///      deployer, the recipient or an allowed collector may call it, and it reverts when nothing is
///      owed. A test or the Anvil demo "accrues" fees with `accrue`; `setFeeRedirect` mirrors the
///      real locker's creator redirect.
contract MockPonsLocker {
    using SafeERC20 for IERC20;

    error NotAuthorized();
    error NoFeesToCollect();
    error TokenNotFound();

    address public immutable weth;
    mapping(address => address) public deployers;
    mapping(address => address) public feeRedirects;
    mapping(address => bool) public feeCollectors;
    mapping(address => uint256) public owedWeth;
    mapping(address => uint256) public owedToken;

    constructor(address weth_) {
        weth = weth_;
    }

    function register(address token, address deployer) external {
        deployers[token] = deployer;
    }

    function setFeeRedirect(address token, address newFeeWallet) external {
        if (msg.sender != deployers[token]) revert NotAuthorized();
        feeRedirects[token] = newFeeWallet;
    }

    function setFeeCollector(address who, bool allowed) external {
        feeCollectors[who] = allowed;
    }

    /// @dev The locker must already hold the amounts (the test mints them here).
    function accrue(address token, uint256 wethAmount, uint256 tokenAmount) external {
        owedWeth[token] += wethAmount;
        owedToken[token] += tokenAmount;
    }

    function collectFees(address token) external returns (uint256 amount0, uint256 amount1) {
        address deployer = deployers[token];
        if (deployer == address(0)) revert TokenNotFound();
        address recipient = feeRedirects[token];
        if (recipient == address(0)) recipient = deployer;
        if (msg.sender != deployer && msg.sender != recipient && !feeCollectors[msg.sender]) revert NotAuthorized();
        amount0 = owedWeth[token];
        amount1 = owedToken[token];
        if (amount0 == 0 && amount1 == 0) revert NoFeesToCollect();
        owedWeth[token] = 0;
        owedToken[token] = 0;
        if (amount0 > 0) IERC20(weth).safeTransfer(recipient, amount0);
        if (amount1 > 0) IERC20(token).safeTransfer(recipient, amount1);
    }
}
