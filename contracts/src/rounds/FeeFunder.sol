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

/// @title FeeFunder – the Pons creator fee recipient that turns the fees into the running round's pot
/// @notice See IFeeFunder. Pons V2 credits the creator's ETH in its fee escrow, so every flush starts
///         with the owner-configured collect calls (sweep, then claim); the ETH lands in `receive`.
///         Swaps go straight against the Uniswap v3 pools (no router dependency): this contract is the
///         swap caller and pays the pool in `uniswapV3SwapCallback`. The callback only accepts a
///         configured pool as `msg.sender` and only pays WETH, so a foreign caller can never pull
///         funds. The flusher's `minOut` values are the slippage guards; the owner is the mine's
///         operator (client decision 2026-09-08: fees flow into the pots with no key holding them).
contract FeeFunder is IFeeFunder, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 internal constant BPS = 10_000;
    uint256 internal constant MAX_COLLECTS = 8;
    /// @dev Uniswap v3 TickMath bounds: swap to the edge of the curve, `minOut` does the guarding.
    uint160 internal constant MIN_SQRT_RATIO_PLUS_ONE = 4295128740;
    uint160 internal constant MAX_SQRT_RATIO_MINUS_ONE = 1461446703485210103287273052203988822378723970341;

    address public immutable owner;
    address public immutable mine;
    address public immutable weth;
    mapping(address => bool) public flushers;
    Leg[] internal _legs;
    /// @dev configured stock pools (the only callers the swap callback pays)
    mapping(address => bool) internal _isPool;
    address[] internal _stocks;
    Collect[] internal _collects;

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

    /// @dev The escrow's `claim` pays ETH here; a manual top-up may too.
    receive() external payable {}

    /// @inheritdoc IFeeFunder
    function flush(uint256[] calldata minOut) external nonReentrant returns (uint256 wethIn, uint256[] memory tokensOut) {
        if (!flushers[msg.sender]) revert NotFlusher();
        uint256 n = _legs.length;
        if (minOut.length != n) revert BadLegs();
        // 1. Pull whatever Pons owes: sweep the pending fees into the escrow, then claim them. Nothing
        //    owed (or a sweep only the Pons operator may run right now) is not an error here: the
        //    ETH/WETH already held may still be worth flushing.
        uint256 c = _collects.length;
        for (uint256 i; i < c; ++i) {
            Collect storage k = _collects[i];
            (bool ok,) = k.target.call(k.data);
            ok; // a revert is swallowed on purpose
        }
        // 2. Wrap ETH.
        uint256 ethBal = address(this).balance;
        if (ethBal > 0) IWETH9(weth).deposit{value: ethBal}();
        // 3. Split all the WETH across the stock legs and fund the running round.
        wethIn = IERC20(weth).balanceOf(address(this));
        if (wethIn == 0) revert NothingToFlush();
        tokensOut = new uint256[](n);
        for (uint256 i; i < n; ++i) {
            Leg memory l = _legs[i];
            uint256 amountIn = (wethIn * l.shareBps) / BPS;
            if (amountIn == 0) continue;
            uint256 out = _swap(l.pool, amountIn);
            if (out < minOut[i]) revert Slippage(l.stock, out, minOut[i]);
            tokensOut[i] = out;
            if (out > 0) {
                IERC20(_stocks[l.stock]).forceApprove(mine, out);
                IRoundMine(mine).fund(l.stock, out);
            }
        }
        emit Flushed(msg.sender, wethIn, tokensOut, IRoundMine(mine).currentRound());
    }

    /// @dev Uniswap v3 pays the pool through this callback; only a configured pool may call it and
    ///      only WETH is ever paid, so no other caller can move funds out of here.
    function uniswapV3SwapCallback(int256 amount0Delta, int256 amount1Delta, bytes calldata) external {
        if (!_isPool[msg.sender]) revert NotPool();
        IUniswapV3PoolMinimal p = IUniswapV3PoolMinimal(msg.sender);
        if (amount0Delta > 0) {
            if (p.token0() != weth) revert NotPool();
            IERC20(weth).safeTransfer(msg.sender, uint256(amount0Delta));
        } else if (amount1Delta > 0) {
            if (p.token1() != weth) revert NotPool();
            IERC20(weth).safeTransfer(msg.sender, uint256(amount1Delta));
        }
    }

    // ── owner ────────────────────────────────────────────────────────────────

    /// @inheritdoc IFeeFunder
    function setLegs(Leg[] calldata legs) external onlyOwner {
        _setLegs(legs);
    }

    /// @inheritdoc IFeeFunder
    function setCollects(Collect[] calldata collects) external onlyOwner {
        if (collects.length > MAX_COLLECTS) revert BadCollect();
        delete _collects;
        for (uint256 i; i < collects.length; ++i) {
            address t = collects[i].target;
            if (t == address(0) || t == weth || t == mine || _isPool[t]) revert BadCollect();
            _collects.push(collects[i]);
        }
        emit CollectsSet(collects);
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

    function collectCount() external view returns (uint256) {
        return _collects.length;
    }

    function collect(uint256 i) external view returns (Collect memory) {
        return _collects[i];
    }

    function pending() external view returns (uint256) {
        return address(this).balance + IERC20(weth).balanceOf(address(this));
    }

    // ── internal ─────────────────────────────────────────────────────────────

    function _setLegs(Leg[] memory legs) internal {
        for (uint256 i; i < _legs.length; ++i) {
            _isPool[_legs[i].pool] = false;
        }
        delete _legs;
        uint256 total;
        for (uint256 i; i < legs.length; ++i) {
            Leg memory l = legs[i];
            if (l.pool == address(0) || l.stock >= _stocks.length || l.shareBps == 0) revert BadLegs();
            IUniswapV3PoolMinimal p = IUniswapV3PoolMinimal(l.pool);
            address t0 = p.token0();
            address t1 = p.token1();
            address stock = _stocks[l.stock];
            if (!((t0 == weth && t1 == stock) || (t1 == weth && t0 == stock))) revert BadLegs();
            total += l.shareBps;
            _legs.push(l);
            _isPool[l.pool] = true;
        }
        if (legs.length == 0 || total != BPS) revert BadLegs();
        for (uint256 i; i < _collects.length; ++i) {
            if (_isPool[_collects[i].target]) revert BadLegs(); // a collect target can never become a pool
        }
        emit LegsSet(legs);
    }

    /// @dev Exact-input swap of `amountIn` WETH on `pool`; returns the stock received.
    function _swap(address pool, uint256 amountIn) internal returns (uint256 out) {
        IUniswapV3PoolMinimal p = IUniswapV3PoolMinimal(pool);
        bool zeroForOne = p.token0() == weth;
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
