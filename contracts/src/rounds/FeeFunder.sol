// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IFeeFunder} from "../interfaces/IFeeFunder.sol";
import {IRoundMine} from "../interfaces/IRoundMine.sol";

interface IWETH9 {
    function deposit() external payable;
}

interface IUniswapV3PoolMinimal {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function swap(
        address recipient,
        bool zeroForOne,
        int256 amountSpecified,
        uint160 sqrtPriceLimitX96,
        bytes calldata data
    ) external returns (int256 amount0, int256 amount1);
}

/// @dev The Pons locker's payout entry point (PonsLaunchLocker, verified on chain 4663). Callable by
///      the token's fee recipient, which is this contract once the deployer has redirected fees here.
interface IPonsLocker {
    function collectFees(address token) external returns (uint256 amount0, uint256 amount1);
}

/// @title FeeFunder – the Pons fee wallet that turns trading fees into the running round's pot
/// @notice See IFeeFunder. Swaps go straight against the Uniswap v3 pools (no router dependency):
///         this contract is the swap caller and pays the pool in `uniswapV3SwapCallback`. The callback
///         only accepts a configured pool as `msg.sender` and only pays that pool's input asset (WETH
///         on the stock legs, the game token on its own pool), so a foreign caller can never pull
///         funds. The flusher's `minOut` values are the slippage guards; the owner is the mine's
///         operator (client decision 2026-09-08: fees flow into the pots with no key holding them).
contract FeeFunder is IFeeFunder, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 internal constant BPS = 10_000;
    /// @dev Uniswap v3 TickMath bounds: swap to the edge of the curve, `minOut` does the guarding.
    uint160 internal constant MIN_SQRT_RATIO_PLUS_ONE = 4295128740;
    uint160 internal constant MAX_SQRT_RATIO_MINUS_ONE = 1461446703485210103287273052203988822378723970341;

    address public immutable owner;
    address public immutable mine;
    address public immutable weth;
    mapping(address => bool) public flushers;
    Leg[] internal _legs;
    /// @dev pool => the asset this contract pays that pool (zero = not a configured pool)
    mapping(address => address) internal _payToken;
    address[] internal _stocks;
    Source internal _source;

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    /// @param flusher_ first allowed flusher (zero for none): lets a deploy-only key wire the keeper
    ///        while `owner_` (the operator, whose key never touches a deploy host) keeps every power.
    constructor(address owner_, address mine_, address weth_, Leg[] memory legs, address flusher_) {
        if (owner_ == address(0) || mine_ == address(0) || weth_ == address(0)) revert BadLegs();
        owner = owner_;
        mine = mine_;
        weth = weth_;
        _stocks = IRoundMine(mine_).params().stocks;
        _setLegs(legs);
        if (flusher_ != address(0)) {
            flushers[flusher_] = true;
            emit FlusherSet(flusher_, true);
        }
    }

    /// @dev Plain ETH is accepted too (a Pons flow or a manual top-up may pay ETH instead of WETH).
    receive() external payable {}

    /// @inheritdoc IFeeFunder
    function flush(uint256 minWethFromToken, uint256[] calldata minOut)
        external
        nonReentrant
        returns (uint256 wethIn, uint256 wethFromToken, uint256[] memory tokensOut)
    {
        if (!flushers[msg.sender]) revert NotFlusher();
        uint256 n = _legs.length;
        if (minOut.length != n) revert BadLegs();
        Source memory src = _source;
        // 1. Pull whatever the locked position has earned since the last flush. Nothing owed is not
        //    an error here: the ETH/WETH/token already held may still be worth flushing.
        if (src.locker != address(0)) {
            try IPonsLocker(src.locker).collectFees(src.token) {} catch {}
        }
        // 2. Wrap ETH.
        uint256 ethBal = address(this).balance;
        if (ethBal > 0) IWETH9(weth).deposit{value: ethBal}();
        // 3. Sell the token half for WETH on its own pool.
        uint256 tokenIn;
        if (src.pool != address(0)) {
            tokenIn = IERC20(src.token).balanceOf(address(this));
            if (tokenIn > 0) {
                wethFromToken = _swap(src.pool, src.token, tokenIn);
                if (wethFromToken < minWethFromToken) revert TokenSlippage(wethFromToken, minWethFromToken);
            }
        }
        // 4. Split all the WETH across the stock legs and fund the running round.
        wethIn = IERC20(weth).balanceOf(address(this));
        if (wethIn == 0) revert NothingToFlush();
        tokensOut = new uint256[](n);
        for (uint256 i; i < n; ++i) {
            Leg memory l = _legs[i];
            uint256 amountIn = (wethIn * l.shareBps) / BPS;
            if (amountIn == 0) continue;
            uint256 out = _swap(l.pool, weth, amountIn);
            if (out < minOut[i]) revert Slippage(l.stock, out, minOut[i]);
            tokensOut[i] = out;
            if (out > 0) {
                IERC20(_stocks[l.stock]).forceApprove(mine, out);
                IRoundMine(mine).fund(l.stock, out);
            }
        }
        emit Flushed(msg.sender, wethIn, tokenIn, tokensOut, IRoundMine(mine).currentRound());
    }

    /// @dev Uniswap v3 pays the pool through this callback; only a configured pool may call it and
    ///      only that pool's input asset is ever paid, so no other caller can move funds out of here.
    function uniswapV3SwapCallback(int256 amount0Delta, int256 amount1Delta, bytes calldata) external {
        address pay = _payToken[msg.sender];
        if (pay == address(0)) revert NotPool();
        IUniswapV3PoolMinimal p = IUniswapV3PoolMinimal(msg.sender);
        if (amount0Delta > 0) {
            if (p.token0() != pay) revert NotPool();
            IERC20(pay).safeTransfer(msg.sender, uint256(amount0Delta));
        } else if (amount1Delta > 0) {
            if (p.token1() != pay) revert NotPool();
            IERC20(pay).safeTransfer(msg.sender, uint256(amount1Delta));
        }
    }

    // ── owner ────────────────────────────────────────────────────────────────

    /// @inheritdoc IFeeFunder
    function setLegs(Leg[] calldata legs) external onlyOwner {
        _setLegs(legs);
    }

    /// @inheritdoc IFeeFunder
    function setSource(Source calldata s) external onlyOwner {
        if (_source.pool != address(0)) _payToken[_source.pool] = address(0);
        if (s.pool != address(0)) {
            if (s.token == address(0) || s.token == weth) revert BadSource();
            IUniswapV3PoolMinimal p = IUniswapV3PoolMinimal(s.pool);
            address t0 = p.token0();
            address t1 = p.token1();
            if (!((t0 == weth && t1 == s.token) || (t1 == weth && t0 == s.token))) revert BadSource();
            if (_payToken[s.pool] != address(0)) revert BadSource(); // never a stock leg's pool
            _payToken[s.pool] = s.token;
        }
        if (s.locker != address(0) && s.token == address(0)) revert BadSource();
        _source = s;
        emit SourceSet(s.locker, s.token, s.pool);
    }

    /// @inheritdoc IFeeFunder
    function setFlusher(address flusher, bool allowed) external onlyOwner {
        flushers[flusher] = allowed;
        emit FlusherSet(flusher, allowed);
    }

    /// @inheritdoc IFeeFunder
    function sweep(address token, address to, uint256 amount) external onlyOwner nonReentrant {
        if (token == address(0)) {
            (bool ok,) = to.call{value: amount}("");
            require(ok, "eth");
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
        emit Swept(to, token, amount);
    }

    // ── views ────────────────────────────────────────────────────────────────

    function legCount() external view returns (uint256) {
        return _legs.length;
    }

    function leg(uint256 i) external view returns (Leg memory) {
        return _legs[i];
    }

    function source() external view returns (Source memory) {
        return _source;
    }

    function pending() external view returns (uint256) {
        return address(this).balance + IERC20(weth).balanceOf(address(this));
    }

    function pendingToken() external view returns (uint256) {
        return _source.token == address(0) ? 0 : IERC20(_source.token).balanceOf(address(this));
    }

    // ── internal ─────────────────────────────────────────────────────────────

    function _setLegs(Leg[] memory legs) internal {
        for (uint256 i; i < _legs.length; ++i) {
            _payToken[_legs[i].pool] = address(0);
        }
        delete _legs;
        uint256 total;
        for (uint256 i; i < legs.length; ++i) {
            Leg memory l = legs[i];
            if (l.pool == address(0) || l.stock >= _stocks.length || l.shareBps == 0) revert BadLegs();
            if (l.pool == _source.pool) revert BadLegs(); // never the token's own pool
            IUniswapV3PoolMinimal p = IUniswapV3PoolMinimal(l.pool);
            address t0 = p.token0();
            address t1 = p.token1();
            address stock = _stocks[l.stock];
            if (!((t0 == weth && t1 == stock) || (t1 == weth && t0 == stock))) revert BadLegs();
            total += l.shareBps;
            _legs.push(l);
            _payToken[l.pool] = weth;
        }
        if (legs.length == 0 || total != BPS) revert BadLegs();
        emit LegsSet(legs);
    }

    /// @dev Exact-input swap of `amountIn` of `tokenIn` on `pool`; returns the other asset received.
    function _swap(address pool, address tokenIn, uint256 amountIn) internal returns (uint256 out) {
        IUniswapV3PoolMinimal p = IUniswapV3PoolMinimal(pool);
        bool zeroForOne = p.token0() == tokenIn;
        (int256 a0, int256 a1) = p.swap(
            address(this),
            zeroForOne,
            int256(amountIn),
            zeroForOne ? MIN_SQRT_RATIO_PLUS_ONE : MAX_SQRT_RATIO_MINUS_ONE,
            ""
        );
        int256 delta = zeroForOne ? a1 : a0;
        out = delta < 0 ? uint256(-delta) : 0;
    }
}
