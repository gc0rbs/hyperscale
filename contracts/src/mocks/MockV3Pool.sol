// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IUniswapV3SwapCallbackLike {
    function uniswapV3SwapCallback(int256 amount0Delta, int256 amount1Delta, bytes calldata data) external;
}

/// @dev Models the part of a Uniswap v3 pool the FeeFunder uses: `token0/token1`, and `swap` with the
///      pay-in-callback pattern at a fixed price (`outPerIn`, 1e18-scaled token1-per-token0). Exact-input
///      only. The pool must hold the output token. `setRate` lets a test move the price under the funder.
contract MockV3Pool {
    address public immutable token0;
    address public immutable token1;
    uint256 public outPerIn; // token1 per token0, 1e18-scaled
    uint24 public immutable fee;

    error Unpaid();

    constructor(address a, address b, uint24 fee_, uint256 outPerIn_) {
        (token0, token1) = a < b ? (a, b) : (b, a);
        fee = fee_;
        outPerIn = outPerIn_;
    }

    function setRate(uint256 outPerIn_) external {
        outPerIn = outPerIn_;
    }

    function swap(address recipient, bool zeroForOne, int256 amountSpecified, uint160, bytes calldata data)
        external
        returns (int256 amount0, int256 amount1)
    {
        require(amountSpecified > 0, "exact input only");
        uint256 amountIn = uint256(amountSpecified);
        uint256 amountOut = zeroForOne ? (amountIn * outPerIn) / 1e18 : (amountIn * 1e18) / outPerIn;
        (address tokenIn, address tokenOut) = zeroForOne ? (token0, token1) : (token1, token0);
        (amount0, amount1) =
            zeroForOne ? (int256(amountIn), -int256(amountOut)) : (-int256(amountOut), int256(amountIn));
        IERC20(tokenOut).transfer(recipient, amountOut);
        uint256 before = IERC20(tokenIn).balanceOf(address(this));
        IUniswapV3SwapCallbackLike(msg.sender).uniswapV3SwapCallback(amount0, amount1, data);
        if (IERC20(tokenIn).balanceOf(address(this)) < before + amountIn) revert Unpaid();
    }
}
