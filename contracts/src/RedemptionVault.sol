// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
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
    /// @dev Robinhood's Chainlink equity feeds update on a 0.5% deviation or a 24 h heartbeat, so a quiet
    ///      price legitimately carries a day-old timestamp, and over a weekend the last print is Friday's
    ///      close. The cap is a season parameter (`maxPriceAgeSeconds`, retro 2026-09-05) so a weekend
    ///      launch can accept a Friday price for cash-out; in-kind redemption never depends on it.
    uint32 public immutable maxPriceAge;
    /// @dev 1e18 USD → quote-token units; the quote token (USDG on Robinhood Chain, USDC elsewhere) is
    ///      read for `decimals()` once at construction.
    uint256 internal immutable USDC_SCALE;

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
    /// @dev Fragments burned per id through `redeem` and `cashOut`; with `claimableCap` this bounds what
    ///      the vault must still hold for a block.
    uint256[] internal _redeemed;
    bool public funded;
    bool public swept;
    /// @dev Reserve pulled at `fund` plus every `topUpReserve`; the base for the share kept on `rescue`.
    uint256 public fundedReserve;

    error InvalidParams();

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
        uint32 maxPriceAge;
    }

    constructor(Config memory c) {
        mine = c.mine;
        fragments = c.fragments;
        usdc = c.usdc;
        uint8 qd = IERC20Metadata(c.usdc).decimals();
        if (qd > 18) revert InvalidParams();
        USDC_SCALE = 10 ** (18 - qd);
        eligibility = c.eligibility;
        oracle = c.oracle;
        treasury = c.treasury;
        operator = c.operator;
        cashOutFeeBps = c.cashOutFeeBps;
        redemptionDays = c.redemptionDays;
        fragPerToken = c.fragPerToken;
        _stocks = c.stocks;
        _poolTokens = c.poolTokens;
        _redeemed = new uint256[](c.stocks.length);
        maxPriceAge = c.maxPriceAge;
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
        fundedReserve = usdcReserve;
        emit Funded(_poolTokens, usdcReserve);
    }

    /// @inheritdoc IRedemptionVault
    function topUpReserve(uint256 amount) external nonReentrant {
        if (!funded) revert NotFunded();
        IERC20(usdc).safeTransferFrom(msg.sender, address(this), amount);
        fundedReserve += amount;
        emit ReserveToppedUp(msg.sender, amount);
    }

    /// @inheritdoc IRedemptionVault
    function redeem(uint256 id, uint256 fragmentAmount) external nonReentrant returns (uint256 tokens) {
        _requireWindowOpen();
        if (!IEligibility(eligibility).isEligible(msg.sender)) revert NotEligible();
        tokens = (fragmentAmount * WAD) / fragPerToken;
        IStockFragments(fragments).burn(msg.sender, id, fragmentAmount);
        _redeemed[id] += fragmentAmount;
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
        _redeemed[id] += fragmentAmount;
        IERC20(usdc).safeTransfer(msg.sender, net);
        emit CashedOut(msg.sender, id, fragmentAmount, net, fee);
    }

    /// @inheritdoc IRedemptionVault
    /// @dev Repeatable like `sweep`: an asset whose hook refuses the treasury stays and is retried.
    function sweepUnmined() external nonReentrant {
        ISeasonMine m = ISeasonMine(mine);
        m.poke();
        if (m.closeX() == 0 || m.phase() == ISeasonMine.Phase.Cancelled) revert NotClosed();
        uint256[] memory moved = _moveExcess(treasury);
        emit UnminedSwept(treasury, moved, 0);
    }

    /// @inheritdoc IRedemptionVault
    /// @dev A cancelled season has `closeX == 0` and every `claimableCap` is zero, so `_moveExcess`
    ///      takes the whole pool; the reserve follows in full.
    function rescue() external nonReentrant {
        if (msg.sender != operator) revert NotOperator();
        ISeasonMine m = ISeasonMine(mine);
        if (m.phase() != ISeasonMine.Phase.Cancelled) revert NotCancelled();
        uint256[] memory moved = _moveExcess(operator);
        uint256 bal = IERC20(usdc).balanceOf(address(this));
        if (bal > 0) IERC20(usdc).safeTransfer(operator, bal);
        emit UnminedSwept(operator, moved, bal);
    }

    /// @inheritdoc IRedemptionVault
    /// @dev Repeatable: a Stock Token whose transfer hook refuses the treasury (or returns false)
    ///      keeps its balance here and is retried on the next call, so one asset never strands the rest.
    function sweep() external nonReentrant {
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
            // slither-disable-next-line unchecked-transfer
            try s.transfer(treasury, bal) returns (bool) {} catch {}
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

    /// @notice Stock the vault must keep for block `id` after close: the claimable cap minus what was
    ///         already redeemed, rounded up to whole token wei.
    function requiredOf(uint256 id) public view returns (uint256) {
        uint256 cap = ISeasonMine(mine).claimableCap(uint8(id));
        uint256 r = _redeemed[id];
        uint256 frags = cap > r ? cap - r : 0;
        return Math.mulDiv(frags, WAD, fragPerToken, Math.Rounding.Ceil);
    }

    function redeemedOf(uint256 id) external view returns (uint256) {
        return _redeemed[id];
    }

    function quoteCashOut(uint256 id, uint256 fragmentAmount) public view returns (uint256 net, uint256 fee) {
        (uint256 price, uint64 updatedAt) = IPriceOracle(oracle).usdPrice(_stocks[id]);
        if (price == 0 || updatedAt + maxPriceAge < block.timestamp) revert StalePrice();
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

    /// @dev Moves everything above `requiredOf` per stock to `to`. A hook that refuses `to` leaves the
    ///      asset for a retry, so one asset never strands the rest (same posture as `sweep`).
    function _moveExcess(address to) internal returns (uint256[] memory moved) {
        moved = new uint256[](_stocks.length);
        for (uint256 b; b < _stocks.length; ++b) {
            IERC20 s = IERC20(_stocks[b]);
            uint256 bal = s.balanceOf(address(this));
            uint256 need = requiredOf(b);
            if (bal <= need) continue;
            uint256 amt = bal - need;
            // slither-disable-next-line unchecked-transfer
            try s.transfer(to, amt) returns (bool ok) {
                if (ok) moved[b] = amt;
            } catch {}
        }
    }

    function _requireWindowOpen() internal {
        if (!funded) revert NotFunded();
        ISeasonMine m = ISeasonMine(mine);
        m.poke();
        if (m.closeX() == 0) revert NotClosed();
        if (m.phase() == ISeasonMine.Phase.Cancelled) revert WindowClosed();
        if (block.timestamp > redemptionEnd()) revert WindowClosed();
    }
}
