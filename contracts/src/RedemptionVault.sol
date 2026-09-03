// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ISeasonMine} from "./interfaces/ISeasonMine.sol";
import {IStockFragments} from "./interfaces/IStockFragments.sol";
import {IRedemptionVault, IEligibility, IPriceOracle} from "./interfaces/IRedemptionVault.sol";

/// @title RedemptionVault – holds the season's Stock Tokens and USDC reserve (docs/05 §8)
/// @notice Redemption opens at close (FR-C2/C3) and lasts `redemptionDays` (FR-C4). The mine cannot
///         open until `fund()` has pulled the full advertised pool (FR-S5). Oracle use is confined to
///         `cashOut` (CLAUDE.md hard rule).
contract RedemptionVault is IRedemptionVault, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 internal constant WAD = 1e18;
    uint256 internal constant BPS = 10_000;
    uint256 internal constant MAX_PRICE_AGE = 1 hours;
    uint256 internal constant USDC_SCALE = 1e12; // 1e18 USD → 6-decimal USDC

    address public immutable mine;
    address public immutable fragments;
    address public immutable usdc;
    address public immutable eligibility;
    address public immutable oracle;
    address public immutable treasury;
    address public immutable operator;
    uint16 public immutable cashOutFeeBps;
    uint32 public immutable redemptionDays;
    uint256 public immutable fragPerToken;
    address[] internal _stocks;
    uint256[] internal _poolTokens;
    bool public funded;
    bool public swept;

    error NotOperator();
    error NotClosed();

    struct Config {
        address mine;
        address fragments;
        address usdc;
        address eligibility;
        address oracle;
        address treasury;
        address operator;
        uint16 cashOutFeeBps;
        uint32 redemptionDays;
        uint256 fragPerToken;
        address[] stocks;
        uint256[] poolTokens;
    }

    constructor(Config memory c) {
        mine = c.mine;
        fragments = c.fragments;
        usdc = c.usdc;
        eligibility = c.eligibility;
        oracle = c.oracle;
        treasury = c.treasury;
        operator = c.operator;
        cashOutFeeBps = c.cashOutFeeBps;
        redemptionDays = c.redemptionDays;
        fragPerToken = c.fragPerToken;
        _stocks = c.stocks;
        _poolTokens = c.poolTokens;
    }

    /// @inheritdoc IRedemptionVault
    function fund(uint256 usdcReserve) external nonReentrant {
        if (msg.sender != operator) revert NotOperator();
        if (funded) revert AlreadyFunded();
        for (uint256 b; b < _stocks.length; ++b) {
            IERC20(_stocks[b]).safeTransferFrom(msg.sender, address(this), _poolTokens[b]);
        }
        if (usdcReserve > 0) IERC20(usdc).safeTransferFrom(msg.sender, address(this), usdcReserve);
        funded = true;
        emit Funded(_poolTokens, usdcReserve);
    }

    /// @inheritdoc IRedemptionVault
    function redeem(uint256 id, uint256 fragmentAmount) external nonReentrant returns (uint256 tokens) {
        _requireWindowOpen();
        if (!IEligibility(eligibility).isEligible(msg.sender)) revert NotEligible();
        tokens = (fragmentAmount * WAD) / fragPerToken;
        IStockFragments(fragments).burn(msg.sender, id, fragmentAmount);
        IERC20(_stocks[id]).safeTransfer(msg.sender, tokens);
        emit Redeemed(msg.sender, id, fragmentAmount, tokens);
    }

    /// @inheritdoc IRedemptionVault
    function cashOut(uint256 id, uint256 fragmentAmount) external nonReentrant returns (uint256 net) {
        _requireWindowOpen();
        uint256 fee;
        (net, fee) = quoteCashOut(id, fragmentAmount);
        if (net == 0) revert ReserveInsufficient();
        if (IERC20(usdc).balanceOf(address(this)) < net) revert ReserveInsufficient();
        IStockFragments(fragments).burn(msg.sender, id, fragmentAmount);
        IERC20(usdc).safeTransfer(msg.sender, net);
        emit CashedOut(msg.sender, id, fragmentAmount, net, fee);
    }

    /// @inheritdoc IRedemptionVault
    function sweep() external nonReentrant {
        if (swept) revert WindowClosed();
        ISeasonMine m = ISeasonMine(mine);
        bool cancelled = m.phase() == ISeasonMine.Phase.Cancelled;
        if (!cancelled) {
            m.poke();
            uint256 end = redemptionEnd();
            if (end == 0 || block.timestamp <= end) revert WindowOpen();
        }
        swept = true;
        for (uint256 b; b < _stocks.length; ++b) {
            IERC20 s = IERC20(_stocks[b]);
            uint256 bal = s.balanceOf(address(this));
            if (bal == 0) continue;
            // A stock token's transfer hook may refuse the treasury; do not let one asset block the rest.
            try s.transfer(treasury, bal) {} catch {}
        }
        uint256 u = IERC20(usdc).balanceOf(address(this));
        if (u > 0) IERC20(usdc).safeTransfer(treasury, u);
        emit Swept(treasury);
    }

    // ── views ───────────────────────────────────────────────────────────────

    function redemptionEnd() public view returns (uint64) {
        uint256 cx = ISeasonMine(mine).closeX();
        if (cx == 0) return 0;
        return uint64(cx / WAD + uint256(redemptionDays) * 1 days);
    }

    function reserve() external view returns (uint256) {
        return IERC20(usdc).balanceOf(address(this));
    }

    function quoteCashOut(uint256 id, uint256 fragmentAmount) public view returns (uint256 net, uint256 fee) {
        (uint256 price, uint64 updatedAt) = IPriceOracle(oracle).usdPrice(_stocks[id]);
        if (price == 0 || updatedAt + MAX_PRICE_AGE < block.timestamp) revert StalePrice();
        uint256 tokens = (fragmentAmount * WAD) / fragPerToken; // 1e18 stock units
        uint256 usd18 = (tokens * price) / 1e8; // 1e18-scaled USD
        uint256 gross = usd18 / USDC_SCALE; // 6-decimal USDC
        fee = (gross * cashOutFeeBps) / BPS;
        net = gross - fee;
    }

    function stockOf(uint256 id) external view returns (address) {
        return _stocks[id];
    }

    function poolTokensOf(uint256 id) external view returns (uint256) {
        return _poolTokens[id];
    }

    // ── internal ────────────────────────────────────────────────────────────

    function _requireWindowOpen() internal {
        if (!funded) revert NotFunded();
        ISeasonMine m = ISeasonMine(mine);
        m.poke();
        if (m.closeX() == 0) revert NotClosed();
        if (m.phase() == ISeasonMine.Phase.Cancelled) revert WindowClosed();
        if (block.timestamp > redemptionEnd()) revert WindowClosed();
    }
}
