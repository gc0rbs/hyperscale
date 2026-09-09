// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {ISeasonMine} from "./interfaces/ISeasonMine.sol";
import {IStockFragments} from "./interfaces/IStockFragments.sol";
import {IRedemptionVault} from "./interfaces/IRedemptionVault.sol";

/// @title SeasonMine – one progress-based virtual mine (docs/05-TECH-SPEC-CONTRACTS.md)
/// @notice Blocks are found by accumulated work (hash × seconds), never by time. Each block pays a
///         fixed number of fragments per unit of work, so a rig's earnings are independent of other
///         rigs (FR-M2). Immutable: no setters, no upgrade path; the only admin power is `pause`
///         (FR-S6). Season length is an outcome of participation (FR-S2, FR-S3).
/// @dev Units (spec §2): hash and stake weight are 1e18-scaled; "X-time" is seconds × 1e18 so shift
///      boundaries are exact; work = hash × dtX / 1e18; fragments are tracked internally as 1e18-scaled
///      "fragment wei" and minted as whole fragments.
contract SeasonMine is ISeasonMine, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;
    using SafeCast for uint256;

    uint256 internal constant WAD = 1e18;
    uint256 internal constant BPS = 10_000;
    /// @dev Upgrade spend is sent here. $RIG is a launchpad-issued ERC-20 with no burn function, so a
    ///      transfer to the conventional dead address is the burn: provably unrecoverable, visible on chain.
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    // ── immutable configuration ─────────────────────────────────────────────
    SeasonParams internal _p;
    IERC20 internal immutable _rig;
    IERC20 internal immutable _lp;
    address public immutable fragments;
    address public immutable vault;
    uint64 public immutable openTime;
    uint256 internal immutable _openX;
    uint256 internal immutable _deadlineX;
    uint16 internal immutable _totalShifts;
    uint8 internal immutable _spb;
    uint256[4] internal _difficulty; // hash-seconds per block (1e18-scaled hash × seconds)
    uint256[4] internal _shiftDiff; // per shift
    uint256[4] internal _rate; // fragment-wei per unit work, 1e18-scaled
    uint256[4] internal _supplyWhole; // poolTokens × fragPerToken / 1e18, whole fragments

    // ── global mining state (spec §4) ───────────────────────────────────────
    uint16 public shift;
    uint256 public workInShift;
    uint256 public lastX;
    uint256 public totalHash;
    mapping(uint16 => uint256) public ocExpiring;
    mapping(uint16 => uint256) public shiftEndX;
    uint256 public closeX;
    uint256[4] internal _minted;

    // ── rigs ────────────────────────────────────────────────────────────────
    Rig[] internal _rigs;
    mapping(address => uint256[]) internal _rigsOf;

    // ── emergency ───────────────────────────────────────────────────────────
    bool public cancelled;
    uint64 public pausedAt;

    struct G {
        uint16 shift;
        uint256 workInShift;
        uint256 lastX;
        uint256 totalHash;
        uint256 closeX;
    }

    error NotGuardian();
    error InvalidParams(string reason);

    modifier onlyGuardian() {
        if (msg.sender != _p.treasury) revert NotGuardian();
        _;
    }

    /// @dev Claims and post-close withdrawals ignore a pause once the close is persisted (audit R2): the
    ///      mine then holds only deposits and minting is capped by the pool, so a lost guardian key can
    ///      never strand earned fragments. A cancelled season has `closeX == 0`, so its unclaimed
    ///      fragments stay forfeited.
    modifier whenNotPausedOrClosed() {
        if (paused()) {
            _updateGlobal();
            if (closeX == 0) revert EnforcedPause();
        }
        _;
    }

    /// @dev Parameter validation lives in SeasonFactory._validate (docs/05 §9); the constructor only
    ///      enforces what its own arithmetic depends on, to keep the deployer under EIP-170.
    constructor(SeasonParams memory p, address fragments_, address vault_) {
        if (p.blocks != 4 || p.stocks.length != 4 || p.poolTokens.length != 4 || p.difficulty.length != 4) {
            revert InvalidParams("blocks");
        }
        if (p.shiftsPerBlock == 0 || p.fragPerToken == 0 || p.treasury == address(0)) {
            revert InvalidParams("params");
        }

        _p = p;
        _rig = IERC20(p.rig);
        _lp = IERC20(p.lpToken);
        fragments = fragments_;
        vault = vault_;
        openTime = p.openTime;
        _openX = uint256(p.openTime) * WAD;
        _deadlineX = (uint256(p.openTime) + p.maxDurationSeconds) * WAD;
        _spb = p.shiftsPerBlock;
        _totalShifts = uint16(uint256(p.blocks) * p.shiftsPerBlock);
        for (uint256 b; b < 4; ++b) {
            uint256 d = p.difficulty[b];
            if (d == 0 || d % p.shiftsPerBlock != 0) revert InvalidParams("difficulty");
            _difficulty[b] = d;
            _shiftDiff[b] = d / p.shiftsPerBlock;
            uint256 supplyWei = p.poolTokens[b] * p.fragPerToken; // fragment-wei (1e18-scaled fragments)
            _supplyWhole[b] = supplyWei / WAD;
            _rate[b] = Math.mulDiv(supplyWei, WAD, d);
            if (_rate[b] == 0) revert InvalidParams("rate");
        }
        lastX = _openX;
    }

    // ── permissionless maintenance ──────────────────────────────────────────

    /// @inheritdoc ISeasonMine
    function poke() external {
        _updateGlobal();
    }

    // ── player actions ──────────────────────────────────────────────────────

    /// @inheritdoc ISeasonMine
    /// @dev FR-R1..R4. Stake weight is fixed for the rig's life (FR-R3).
    function activate(Asset asset, uint256 amount)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 rigId)
    {
        _updateGlobal();
        Phase ph = _phaseAfterUpdate();
        if (ph != Phase.PreOpen && ph != Phase.Open) revert WrongPhase(ph);

        uint256 weight;
        if (asset == Asset.RIG) {
            _rig.safeTransferFrom(msg.sender, address(this), amount);
            weight = amount;
        } else {
            if (address(_lp) == address(0)) revert LpDisabled();
            _lp.safeTransferFrom(msg.sender, address(this), amount);
            weight = Math.mulDiv(amount, _p.lpWeightPerToken, WAD);
        }
        if (weight < _p.minStakeWeight) revert BelowMinStake();
        uint256 fee = (weight * _p.activationFeeBps) / BPS;
        if (fee > 0) _rig.safeTransferFrom(msg.sender, _p.treasury, fee);

        rigId = _rigs.length;
        _rigs.push();
        Rig storage r = _rigs[rigId];
        r.owner = msg.sender;
        r.asset = asset;
        r.amount = amount.toUint128();
        r.weight = weight.toUint128();
        r.baseHash = ((weight * _p.gpuMultBps[0]) / BPS).toUint128();
        r.lastShift = shift;
        r.lastX = lastX;
        _rigsOf[msg.sender].push(rigId);
        totalHash += r.baseHash;
        emit RigActivated(rigId, msg.sender, asset, amount, weight, fee);
    }

    /// @inheritdoc ISeasonMine
    /// @dev FR-U1, FR-U5 (100% burned).
    function upgradeGpu(uint256 rigId) external nonReentrant whenNotPaused {
        _updateGlobal();
        Rig storage r = _ownedActive(rigId);
        Phase ph = _phaseAfterUpdate();
        if (ph != Phase.PreOpen && ph != Phase.Open) revert WrongPhase(ph);
        _settleRig(r);
        uint8 tier = r.gpuTier;
        if (tier >= 5) revert MaxTier();
        uint256 cost = (uint256(r.weight) * _p.gpuCostBps[tier]) / BPS;
        uint8 newTier = tier + 1;
        uint256 newBase = (uint256(r.weight) * _p.gpuMultBps[newTier]) / BPS;
        uint256 delta = newBase - r.baseHash;
        if (r.ocHash > 0) {
            uint256 newOc = (newBase * _p.ocBoostBps * r.activeOc) / BPS;
            ocExpiring[r.ocExpiryShift] = ocExpiring[r.ocExpiryShift] - r.ocHash + newOc;
            delta += newOc - r.ocHash;
            r.ocHash = newOc.toUint128();
        }
        r.gpuTier = newTier;
        r.baseHash = newBase.toUint128();
        totalHash += delta;
        _burn(cost);
        emit GpuUpgraded(rigId, newTier, cost);
    }

    /// @inheritdoc ISeasonMine
    /// @dev FR-U2, FR-U5.
    function upgradeCooling(uint256 rigId) external nonReentrant whenNotPaused {
        _updateGlobal();
        Rig storage r = _ownedActive(rigId);
        Phase ph = _phaseAfterUpdate();
        if (ph != Phase.PreOpen && ph != Phase.Open) revert WrongPhase(ph);
        _settleRig(r);
        uint8 tier = r.coolingTier;
        if (tier >= 3) revert MaxTier();
        uint256 cost = (uint256(r.weight) * _p.coolCostBps[tier]) / BPS;
        r.coolingTier = tier + 1;
        _burn(cost);
        emit CoolingUpgraded(rigId, tier + 1, cost);
    }

    /// @inheritdoc ISeasonMine
    /// @dev FR-U3: active until the end of shift `current + ocShiftSpan`; buying another refreshes all.
    function overclock(uint256 rigId) external nonReentrant whenNotPaused {
        _updateGlobal();
        Rig storage r = _ownedActive(rigId);
        Phase ph = _phaseAfterUpdate();
        if (ph != Phase.Open) revert WrongPhase(ph);
        _settleRig(r);
        if (r.activeOc >= _p.maxActiveOc) revert MaxOverclocks();
        uint256 heatAfter = uint256(r.heat) + _p.heatPerOc[r.coolingTier];
        if (heatAfter > _p.heatMax) revert HeatTooHigh();
        uint256 cost = (uint256(r.weight) * _p.ocCostBps) / BPS;
        r.heat = uint8(heatAfter);
        r.activeOc += 1;
        uint256 newOc = (uint256(r.baseHash) * _p.ocBoostBps * r.activeOc) / BPS;
        if (r.ocHash > 0) ocExpiring[r.ocExpiryShift] -= r.ocHash;
        uint16 expiry = shift + _p.ocShiftSpan;
        r.ocExpiryShift = expiry;
        ocExpiring[expiry] += newOc;
        totalHash = totalHash - r.ocHash + newOc;
        r.ocHash = newOc.toUint128();
        _burn(cost);
        emit Overclocked(rigId, shift, r.activeOc, expiry, r.heat, cost);
    }

    /// @inheritdoc ISeasonMine
    /// @dev FR-M5, FR-M7.
    function claim(uint256 rigId, uint8 blockIdx)
        external
        nonReentrant
        whenNotPausedOrClosed
        returns (uint256)
    {
        _updateGlobal();
        Rig storage r = _owned(rigId);
        _settleRig(r);
        uint256 f = _claim(rigId, r, blockIdx);
        if (f == 0) revert AlreadyClaimed(blockIdx);
        return f;
    }

    /// @inheritdoc ISeasonMine
    function claimAll(uint256 rigId)
        external
        nonReentrant
        whenNotPausedOrClosed
        returns (uint256[4] memory out)
    {
        _updateGlobal();
        Rig storage r = _owned(rigId);
        _settleRig(r);
        for (uint8 b; b < 4; ++b) {
            if (_isFound(b)) out[b] = _claim(rigId, r, b);
        }
    }

    /// @inheritdoc ISeasonMine
    /// @dev FR-R6: leave early for `earlyExitFeeBps` of the deposit; earned fragments stay claimable.
    function exit(uint256 rigId) external nonReentrant whenNotPaused {
        _updateGlobal();
        Rig storage r = _ownedActive(rigId);
        Phase ph = _phaseAfterUpdate();
        if (ph != Phase.Open && ph != Phase.PreOpen) revert WrongPhase(ph);
        _settleRig(r);
        _removeHash(r);
        r.inactive = true;
        uint256 fee = (uint256(r.amount) * _p.earlyExitFeeBps) / BPS;
        IERC20 token = r.asset == Asset.RIG ? _rig : _lp;
        if (fee > 0) token.safeTransfer(_p.treasury, fee);
        token.safeTransfer(r.owner, r.amount - fee);
        emit Exited(rigId, r.amount - fee, fee);
    }

    /// @inheritdoc ISeasonMine
    /// @dev FR-C1: full deposit back after close.
    function withdraw(uint256 rigId) external nonReentrant whenNotPausedOrClosed {
        _updateGlobal();
        Rig storage r = _ownedActive(rigId);
        Phase ph = _phaseAfterUpdate();
        if (ph != Phase.Closed) revert WrongPhase(ph);
        _settleRig(r);
        _removeHash(r);
        r.inactive = true;
        IERC20 token = r.asset == Asset.RIG ? _rig : _lp;
        token.safeTransfer(r.owner, r.amount);
        emit Withdrawn(rigId, r.amount);
    }

    /// @inheritdoc ISeasonMine
    /// @dev FR-S6: on a season the operator cancelled with `abort`, or after a pause has lasted longer
    ///      than the grace period. The latter cancels a season that is still open: unclaimed fragments
    ///      are forfeited and the vault sweeps to treasury. A season that already closed is not
    ///      cancelled; this then only returns the deposit (as `withdraw` would, but the pause blocks it)
    ///      and earned fragments stay claimable after an unpause.
    function emergencyWithdraw(uint256 rigId) external nonReentrant {
        if (!cancelled && (!paused() || block.timestamp <= uint256(pausedAt) + _p.pauseGraceSeconds)) {
            revert PauseGraceNotElapsed();
        }
        _updateGlobal();
        Rig storage r = _ownedActive(rigId);
        if (!cancelled && closeX == 0) {
            cancelled = true;
            emit SeasonCancelled(uint64(block.timestamp));
        }
        _settleRig(r);
        _removeHash(r);
        r.inactive = true;
        IERC20 token = r.asset == Asset.RIG ? _rig : _lp;
        token.safeTransfer(r.owner, r.amount);
        emit Withdrawn(rigId, r.amount);
    }

    // ── admin (emergency only) ──────────────────────────────────────────────

    /// @inheritdoc ISeasonMine
    /// @dev The operator is the vault's funding operator (the `SeasonFactory.create` caller). The
    ///      season is cancelled exactly as by the pause path (audit B4: frozen at this instant), so
    ///      `emergencyWithdraw` returns every deposit in full and no fragment can be claimed or
    ///      redeemed. Works while paused: it is the escape hatch. The window is measured from
    ///      `openTime`, so a season created with the wrong open time can always be aborted before it
    ///      opens. The client chose the full-pool return over an early close that would honour
    ///      earnings (DECISIONS 2026-09-08); the site states the window.
    function abort() external nonReentrant {
        if (msg.sender != IRedemptionVault(vault).operator()) revert NotOperator();
        _updateGlobal();
        if (cancelled) revert WrongPhase(Phase.Cancelled);
        if (closeX != 0) revert WrongPhase(Phase.Closed);
        if (_p.rescueWindowSeconds == 0 || block.timestamp > rescueDeadline()) revert RescueWindowClosed();
        cancelled = true;
        emit SeasonCancelled(uint64(block.timestamp));
    }

    /// @inheritdoc ISeasonMine
    /// @dev Only while the season can still change (audit R2): once the close is persisted there is
    ///      nothing a pause could protect, and claims/withdrawals ignore it anyway.
    function pause() external onlyGuardian {
        _updateGlobal();
        if (closeX != 0) revert WrongPhase(Phase.Closed);
        pausedAt = uint64(block.timestamp);
        _pause();
    }

    /// @inheritdoc ISeasonMine
    function unpause() external onlyGuardian {
        if (cancelled) revert WrongPhase(Phase.Cancelled);
        _unpause();
    }

    // ── views ───────────────────────────────────────────────────────────────

    function params() external view returns (SeasonParams memory) {
        return _p;
    }

    function phase() public view returns (Phase) {
        if (cancelled) return Phase.Cancelled;
        if (!IRedemptionVault(vault).funded()) return Phase.Funding;
        if (block.timestamp < openTime) return Phase.PreOpen;
        if (closeX != 0) return Phase.Closed;
        if (block.timestamp * WAD >= _deadlineX) return Phase.Closed;
        (G memory g,) = _simulate();
        return g.closeX != 0 ? Phase.Closed : Phase.Open;
    }

    function progress() external view returns (Progress memory pr) {
        (G memory g,) = _simulate();
        uint16 s = g.shift >= _totalShifts ? _totalShifts - 1 : g.shift;
        uint8 b = uint8(s / _spb);
        pr.blockIdx = g.shift >= _totalShifts ? uint8(4) : b;
        pr.shift = g.shift;
        pr.workInShift = g.workInShift;
        pr.shiftDifficulty = _shiftDiff[b];
        pr.closeX = g.closeX;
        if (g.closeX == 0) {
            uint256 shiftsLeftInBlock = uint256(_spb) - (s % _spb) - 1;
            pr.workRemainingInBlock = (_shiftDiff[b] - g.workInShift) + shiftsLeftInBlock * _shiftDiff[b];
            uint256 rem = pr.workRemainingInBlock;
            for (uint256 k = b + 1; k < 4; ++k) {
                rem += _difficulty[k];
            }
            pr.workRemainingInSeason = rem;
        }
    }

    function eta() external view returns (Eta memory e) {
        (G memory g,) = _simulate();
        if (g.closeX != 0) return e;
        if (g.totalHash == 0) {
            e.idle = true;
            return e;
        }
        uint16 s = g.shift;
        uint8 b = uint8(s / _spb);
        uint256 remShift = _shiftDiff[b] - g.workInShift;
        uint256 shiftsLeftInBlock = uint256(_spb) - (s % _spb) - 1;
        uint256 remBlock = remShift + shiftsLeftInBlock * _shiftDiff[b];
        uint256 remSeason = remBlock;
        for (uint256 k = b + 1; k < 4; ++k) {
            remSeason += _difficulty[k];
        }
        e.toShiftEnd = remShift / g.totalHash;
        e.toBlockFound = remBlock / g.totalHash;
        e.toClose = remSeason / g.totalHash;
    }

    function blockEndX(uint8 blockIdx) public view returns (uint256) {
        return shiftEndX[uint16((uint256(blockIdx) + 1) * _spb - 1)];
    }

    function ratePerWork(uint8 blockIdx) external view returns (uint256) {
        return _rate[blockIdx];
    }

    function mintedFragments(uint8 blockIdx) external view returns (uint256) {
        return _minted[blockIdx];
    }

    function difficulty(uint8 blockIdx) external view returns (uint256) {
        return _difficulty[blockIdx];
    }

    function fragmentSupply(uint8 blockIdx) external view returns (uint256) {
        return _supplyWhole[blockIdx];
    }

    /// @inheritdoc ISeasonMine
    function rescueDeadline() public view returns (uint64) {
        return uint64(uint256(openTime) + _p.rescueWindowSeconds);
    }

    /// @inheritdoc ISeasonMine
    /// @dev Every rig's pay for a block is `mulDiv(hash × dt, rate)` floored per settlement, so the sum
    ///      over rigs never exceeds the block's true work times the rate; the stored work floors per
    ///      global segment and can trail the true work by less than one work unit per segment, worth a
    ///      negligible fraction of a fragment. One whole fragment of margin covers that (docs/05 §5.1).
    function claimableCap(uint8 blockIdx) external view returns (uint256) {
        if (cancelled) return 0;
        if (closeX == 0) revert WrongPhase(_phaseAfterUpdate());
        uint16 s = shift;
        if (s >= _totalShifts) return _supplyWhole[blockIdx];
        uint8 current = uint8(s / _spb);
        if (blockIdx < current) return _supplyWhole[blockIdx];
        if (blockIdx > current) return 0;
        uint256 work = uint256(s % _spb) * _shiftDiff[blockIdx] + workInShift;
        uint256 frags = Math.mulDiv(work, _rate[blockIdx], WAD) / WAD + 1;
        return frags > _supplyWhole[blockIdx] ? _supplyWhole[blockIdx] : frags;
    }

    function rigs(uint256 rigId) external view returns (Rig memory) {
        return _rigs[rigId];
    }

    function rigCount() external view returns (uint256) {
        return _rigs.length;
    }

    function rigsOf(address owner) external view returns (uint256[] memory) {
        return _rigsOf[owner];
    }

    /// @notice Live hashrate including overclocks that have not yet expired, simulated to now.
    function rigHash(uint256 rigId) external view returns (uint256) {
        (G memory g, uint256[] memory ends) = _simulate();
        Rig memory r = _rigs[rigId];
        if (r.inactive) return 0;
        _settleCalc(r, g, ends);
        return uint256(r.baseHash) + r.ocHash;
    }

    /// @inheritdoc ISeasonMine
    function pending(uint256 rigId, uint8 blockIdx) external view returns (uint256) {
        (G memory g, uint256[] memory ends) = _simulate();
        Rig memory r = _rigs[rigId];
        _settleCalc(r, g, ends);
        return uint256(r.earned[blockIdx]) / WAD;
    }

    function gpuCost(uint256 rigId) external view returns (uint256) {
        Rig storage r = _rigs[rigId];
        if (r.gpuTier >= 5) revert MaxTier();
        return (uint256(r.weight) * _p.gpuCostBps[r.gpuTier]) / BPS;
    }

    function coolingCost(uint256 rigId) external view returns (uint256) {
        Rig storage r = _rigs[rigId];
        if (r.coolingTier >= 3) revert MaxTier();
        return (uint256(r.weight) * _p.coolCostBps[r.coolingTier]) / BPS;
    }

    function overclockCost(uint256 rigId) external view returns (uint256) {
        return (uint256(_rigs[rigId].weight) * _p.ocCostBps) / BPS;
    }

    // ── internal: global settlement (spec §5.1) ─────────────────────────────

    function _load() internal view returns (G memory g) {
        g.shift = shift;
        g.workInShift = workInShift;
        g.lastX = lastX;
        g.totalHash = totalHash;
        g.closeX = closeX;
    }

    function _store(G memory g) internal {
        shift = g.shift;
        workInShift = g.workInShift;
        lastX = g.lastX;
        totalHash = g.totalHash;
        closeX = g.closeX;
    }

    function _updateGlobal() internal {
        G memory g = _load();
        uint16 from = g.shift;
        bool wasOpen = g.closeX == 0;
        uint256[] memory ends = new uint256[](_totalShifts);
        uint256[] memory hashAfter = new uint256[](_totalShifts);
        _advanceView(g, ends, hashAfter);
        for (uint16 s = from; s < g.shift; ++s) {
            shiftEndX[s] = ends[s];
            delete ocExpiring[s];
            emit ShiftEnded(s, ends[s], hashAfter[s]);
            if ((uint256(s) + 1) % _spb == 0) emit BlockFound(uint8(s / _spb), ends[s]);
        }
        if (wasOpen && g.closeX == _deadlineX && g.shift < _totalShifts) emit ClosedByFailSafe(g.shift);
        _store(g);
    }

    function _simulate() internal view returns (G memory g, uint256[] memory ends) {
        g = _load();
        ends = new uint256[](_totalShifts);
        _advanceView(g, ends, new uint256[](0));
    }

    /// @dev Discovers every shift boundary between `g.lastX` and now, exactly, from the piecewise-
    ///      constant total hash. Loop bound: shifts crossed since the last update (≤ blocks × spb).
    ///      Pure over memory plus reads of `ocExpiring`; `_updateGlobal` commits the results.
    function _advanceView(G memory g, uint256[] memory ends, uint256[] memory hashAfter) internal view {
        // A cancelled season is frozen at the cancellation instant (audit B4): no further boundaries,
        // work or close are discovered, so later emergency withdrawals settle against a fixed state.
        if (g.closeX != 0 || cancelled || block.timestamp < openTime) return;
        uint256 nowX = block.timestamp * WAD;
        if (nowX > _deadlineX) nowX = _deadlineX;
        while (g.lastX < nowX) {
            if (g.totalHash == 0) {
                g.lastX = nowX;
                break;
            }
            uint256 sd = _shiftDiff[g.shift / _spb];
            uint256 remaining = sd - g.workInShift;
            uint256 spanX = Math.mulDiv(remaining, WAD, g.totalHash);
            if (g.lastX + spanX > nowX) {
                g.workInShift += Math.mulDiv(g.totalHash, nowX - g.lastX, WAD);
                g.lastX = nowX;
                break;
            }
            uint256 endX = g.lastX + spanX;
            uint16 s = g.shift;
            ends[s] = endX;
            g.workInShift = 0;
            g.lastX = endX;
            g.totalHash -= ocExpiring[s];
            if (hashAfter.length > 0) hashAfter[s] = g.totalHash;
            g.shift = s + 1;
            if (g.shift == _totalShifts) {
                g.closeX = endX;
                return;
            }
        }
        if (g.closeX == 0 && nowX == _deadlineX && g.lastX == _deadlineX) g.closeX = _deadlineX;
    }

    // ── internal: rig settlement (spec §5.2) ────────────────────────────────

    function _settleRig(Rig storage rs) internal {
        Rig memory r = rs;
        G memory g = _load();
        uint256[] memory none;
        _settleCalc(r, g, none);
        rs.earned = r.earned;
        rs.ocHash = r.ocHash;
        rs.activeOc = r.activeOc;
        rs.heat = r.heat;
        rs.lastShift = r.lastShift;
        rs.lastX = r.lastX;
    }

    function _endX(uint256 idx, uint256[] memory ends) internal view returns (uint256 e) {
        e = shiftEndX[uint16(idx)];
        if (e == 0 && ends.length > idx) e = ends[idx];
    }

    /// @dev Pays the rig for [r.lastX, toX] block by block (≤ 4 iterations), then applies overclock
    ///      expiry and heat decay for every shift boundary crossed. Pure over memory + stored ends.
    function _settleCalc(Rig memory r, G memory g, uint256[] memory ends) internal view {
        uint256 toX = g.lastX;
        if (g.closeX != 0 && toX > g.closeX) toX = g.closeX;
        uint256 fromX = r.lastX;
        if (toX > fromX && !r.inactive) {
            uint16 cur = g.shift >= _totalShifts ? _totalShifts - 1 : g.shift;
            uint256 bFrom = r.lastShift >= _totalShifts ? 3 : r.lastShift / _spb;
            uint256 bTo = cur / _spb;
            uint256 ocEndX;
            if (r.ocHash > 0) {
                ocEndX = _endX(r.ocExpiryShift, ends);
                if (ocEndX == 0) ocEndX = toX;
            }
            for (uint256 b = bFrom; b <= bTo; ++b) {
                uint256 startX = b == 0 ? _openX : _endX(b * _spb - 1, ends);
                uint256 endX = _endX((b + 1) * _spb - 1, ends);
                if (endX == 0) endX = toX;
                uint256 lo = fromX > startX ? fromX : startX;
                uint256 hi = toX < endX ? toX : endX;
                if (hi <= lo) continue;
                uint256 e = Math.mulDiv(Math.mulDiv(r.baseHash, hi - lo, WAD), _rate[b], WAD);
                if (r.ocHash > 0) {
                    uint256 hi2 = hi < ocEndX ? hi : ocEndX;
                    if (hi2 > lo) e += Math.mulDiv(Math.mulDiv(r.ocHash, hi2 - lo, WAD), _rate[b], WAD);
                }
                r.earned[b] = (uint256(r.earned[b]) + e).toUint128();
            }
        }
        if (r.ocHash > 0 && _endX(r.ocExpiryShift, ends) != 0) {
            r.ocHash = 0;
            r.activeOc = 0;
        }
        uint256 crossed = g.shift > r.lastShift ? g.shift - r.lastShift : 0;
        if (crossed > 0 && r.heat > 0) {
            uint256 dec = crossed * _p.coolPerShift[r.coolingTier];
            r.heat = dec >= r.heat ? 0 : uint8(r.heat - dec);
        }
        r.lastShift = g.shift;
        r.lastX = toX;
    }

    // ── internal helpers ────────────────────────────────────────────────────

    function _claim(uint256 rigId, Rig storage r, uint8 b) internal returns (uint256 f) {
        if (!_isFound(b)) revert NotFound(b);
        f = uint256(r.earned[b]) / WAD;
        if (f == 0) return 0;
        if (_minted[b] + f > _supplyWhole[b]) revert PoolExhausted(b);
        _minted[b] += f;
        r.earned[b] = (uint256(r.earned[b]) - f * WAD).toUint128();
        r.claimedMask |= uint8(1 << b);
        IStockFragments(fragments).mint(r.owner, b, f);
        emit Claimed(rigId, b, f);
    }

    function _isFound(uint8 b) internal view returns (bool) {
        return blockEndX(b) != 0 || closeX != 0;
    }

    function _removeHash(Rig storage r) internal {
        uint256 h = uint256(r.baseHash) + r.ocHash;
        if (r.ocHash > 0 && closeX == 0) {
            uint256 bucket = ocExpiring[r.ocExpiryShift];
            ocExpiring[r.ocExpiryShift] = bucket > r.ocHash ? bucket - r.ocHash : 0;
        }
        totalHash = totalHash > h ? totalHash - h : 0;
        r.ocHash = 0;
        r.activeOc = 0;
    }

    function _burn(uint256 amount) internal {
        if (amount > 0) _rig.safeTransferFrom(msg.sender, BURN_ADDRESS, amount);
    }

    function _owned(uint256 rigId) internal view returns (Rig storage r) {
        r = _rigs[rigId];
        if (r.owner != msg.sender) revert NotOwner();
    }

    function _ownedActive(uint256 rigId) internal view returns (Rig storage r) {
        r = _owned(rigId);
        if (r.inactive) revert RigInactive();
    }

    /// @dev Phase after `_updateGlobal` ran in this call: closeX is authoritative.
    function _phaseAfterUpdate() internal view returns (Phase) {
        if (cancelled) return Phase.Cancelled;
        if (!IRedemptionVault(vault).funded()) return Phase.Funding;
        if (block.timestamp < openTime) return Phase.PreOpen;
        if (closeX != 0) return Phase.Closed;
        return Phase.Open;
    }
}
