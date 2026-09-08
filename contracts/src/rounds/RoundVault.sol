// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IRoundMine} from "../interfaces/IRoundMine.sol";
import {IRoundVault} from "../interfaces/IRoundVault.sol";
import {IStockFragments} from "../interfaces/IStockFragments.sol";
import {IEligibility, IPriceOracle} from "../interfaces/IRedemptionVault.sol";

/// @title RoundVault – holds the round mine's Stock Tokens and USDG reserve (docs/13 §2)
/// @notice Stock arrives through `RoundMine.fund`, leaves through redemption, unscheduling and, once
///         the mine is halted, `rescue`. Fragments redeem at any time; there is no window. Oracle use
///         is confined to `cashOut`.
contract RoundVault is IRoundVault, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 internal constant WAD = 1e18;
    uint256 internal constant BPS = 10_000;
    uint256 internal immutable USDC_SCALE;

    address public immutable mine;
    address public immutable fragments;
    address public immutable usdc;
    address public immutable eligibility;
    address public immutable oracle;
    address public immutable operator;
    uint16 public immutable cashOutFeeBps;
    uint256 public immutable fragPerToken;
    uint32 public immutable maxPriceAge;
    address[] internal _stocks;
    uint256[] internal _redeemed;

    error InvalidParams();

    struct Config {
        address mine;
        address fragments;
        address usdc;
        address eligibility;
        address oracle;
        address operator;
        uint16 cashOutFeeBps;
        uint256 fragPerToken;
        uint32 maxPriceAge;
        address[] stocks;
    }

    constructor(Config memory c) {
        if (
            c.mine == address(0) || c.fragments == address(0) || c.usdc == address(0)
                || c.eligibility == address(0) || c.oracle == address(0) || c.operator == address(0)
        ) revert InvalidParams();
        if (c.cashOutFeeBps > 1000 || c.fragPerToken == 0 || c.maxPriceAge < 1 hours) revert InvalidParams();
        mine = c.mine;
        fragments = c.fragments;
        usdc = c.usdc;
        uint8 qd = IERC20Metadata(c.usdc).decimals();
        if (qd > 18) revert InvalidParams();
        USDC_SCALE = 10 ** (18 - qd);
        eligibility = c.eligibility;
        oracle = c.oracle;
        operator = c.operator;
        cashOutFeeBps = c.cashOutFeeBps;
        fragPerToken = c.fragPerToken;
        maxPriceAge = c.maxPriceAge;
        _stocks = c.stocks;
        _redeemed = new uint256[](c.stocks.length);
    }

    /// @inheritdoc IRoundVault
    function release(uint256 id, address to, uint256 amount) external nonReentrant {
        if (msg.sender != mine) revert NotMine();
        IERC20(_stocks[id]).safeTransfer(to, amount);
        emit Released(to, id, amount);
    }

    /// @inheritdoc IRoundVault
    function redeem(uint256 id, uint256 fragmentAmount) external nonReentrant returns (uint256 tokens) {
        if (!IEligibility(eligibility).isEligible(msg.sender)) revert NotEligible();
        tokens = (fragmentAmount * WAD) / fragPerToken;
        IStockFragments(fragments).burn(msg.sender, id, fragmentAmount);
        _redeemed[id] += fragmentAmount;
        IERC20(_stocks[id]).safeTransfer(msg.sender, tokens);
        emit Redeemed(msg.sender, id, fragmentAmount, tokens);
    }

    /// @inheritdoc IRoundVault
    function cashOut(uint256 id, uint256 fragmentAmount) external nonReentrant returns (uint256 net) {
        uint256 fee;
        (net, fee) = quoteCashOut(id, fragmentAmount);
        if (net == 0) revert ReserveInsufficient();
        if (IERC20(usdc).balanceOf(address(this)) < net) revert ReserveInsufficient();
        IStockFragments(fragments).burn(msg.sender, id, fragmentAmount);
        _redeemed[id] += fragmentAmount;
        IERC20(usdc).safeTransfer(msg.sender, net);
        emit CashedOut(msg.sender, id, fragmentAmount, net, fee);
    }

    /// @inheritdoc IRoundVault
    function topUpReserve(uint256 amount) external nonReentrant {
        IERC20(usdc).safeTransferFrom(msg.sender, address(this), amount);
        emit ReserveToppedUp(msg.sender, amount);
    }

    /// @inheritdoc IRoundVault
    /// @dev Cash-outs burn fragments without taking stock, so the stock behind them is excess too.
    function rescue() external nonReentrant {
        if (msg.sender != operator) revert NotOperator();
        if (!IRoundMine(mine).halted()) revert NotHalted();
        uint256[] memory moved = new uint256[](_stocks.length);
        for (uint256 b; b < _stocks.length; ++b) {
            IERC20 s = IERC20(_stocks[b]);
            uint256 bal = s.balanceOf(address(this));
            uint256 need = requiredOf(b);
            if (bal <= need) continue;
            uint256 amt = bal - need;
            // A stock token's hook may refuse the operator; do not let one asset block the rest.
            // slither-disable-next-line unchecked-transfer
            try s.transfer(operator, amt) returns (bool ok) {
                if (ok) moved[b] = amt;
            } catch {}
        }
        uint256 u = IERC20(usdc).balanceOf(address(this));
        if (u > 0) IERC20(usdc).safeTransfer(operator, u);
        emit Rescued(operator, moved, u);
    }

    // ── views ───────────────────────────────────────────────────────────────

    function reserve() external view returns (uint256) {
        return IERC20(usdc).balanceOf(address(this));
    }

    function stockOf(uint256 id) external view returns (address) {
        return _stocks[id];
    }

    /// @inheritdoc IRoundVault
    function requiredOf(uint256 id) public view returns (uint256) {
        // totalSupply is minted minus burned, i.e. exactly the fragments still out there.
        uint256 outstanding = IStockFragments(fragments).totalSupply(id);
        return Math.mulDiv(outstanding, WAD, fragPerToken, Math.Rounding.Ceil);
    }

    function redeemedOf(uint256 id) external view returns (uint256) {
        return _redeemed[id];
    }

    function quoteCashOut(uint256 id, uint256 fragmentAmount) public view returns (uint256 net, uint256 fee) {
        (uint256 price, uint64 updatedAt) = IPriceOracle(oracle).usdPrice(_stocks[id]);
        if (price == 0 || updatedAt + maxPriceAge < block.timestamp) revert StalePrice();
        uint256 tokens = (fragmentAmount * WAD) / fragPerToken;
        uint256 usd18 = (tokens * price) / 1e8;
        uint256 gross = usd18 / USDC_SCALE;
        fee = (gross * cashOutFeeBps) / BPS;
        net = gross - fee;
    }
}
