// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {IRoundMine} from "../interfaces/IRoundMine.sol";
import {IRoundVault} from "../interfaces/IRoundVault.sol";
import {IStockFragments} from "../interfaces/IStockFragments.sol";

/// @title RoundMine – the continuous mine with hourly rounds (docs/13-ROUNDS.md)
/// @notice Rounds close on the clock. Each round's pot per stock is split among rigs by the exact
///         work (hash × seconds) they did in that round, is claimable for `claimSeconds` after the
///         close, and whatever is not claimed rolls into the next round's pot. Funding is a schedule
///         of stock per round filled by anyone; the operator can take back only rounds that have not
///         begun, or halt the mine (client decision 2026-09-08, stated on the site). Immutable: no
///         setters, no upgrade path.
/// @dev Units: hash is 1e18-scaled; work is hash × whole seconds, so every product here is exact and
///      the sum of rig work in a closed round equals the round's work (docs/13 §4.4 without dust).
contract RoundMine is IRoundMine, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;
    using SafeCast for uint256;

    uint256 internal constant WAD = 1e18;
    uint256 internal constant BPS = 10_000;
    uint256 internal constant STOCKS = 4;
    uint64 internal constant MAX_FUND_ROUNDS = 720; // 30 days of hourly rounds
    /// @dev Upgrade spend is sent here: $RIG has no burn function, so the dead address is the burn.
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    // ── immutable configuration ─────────────────────────────────────────────
    RoundParams internal _p;
    IERC20 internal immutable _rig;
    address public immutable operator;
    address public immutable vault;
    address public immutable fragments;
    uint64 internal immutable _genesis;
    uint32 internal immutable _L;
    uint32 internal immutable _W;

    // ── global state ────────────────────────────────────────────────────────
    uint256 public totalHash;
    uint64 internal _closed; // rounds 0 .. _closed-1 are recorded
    uint64 internal _lastTime; // global settlement time (≥ genesis)
    uint256 internal _workAcc; // work of the open round since its start, up to _lastTime
    mapping(uint64 => uint256) internal _roundWork;
    mapping(uint64 => uint256[4]) internal _pot;
    mapping(uint64 => uint256[4]) internal _claimed;
    mapping(uint8 => mapping(uint64 => uint256)) internal _scheduled;
    mapping(uint8 => uint64) internal _scheduledUntil; // highest round with a schedule, per stock
    mapping(uint64 => uint256) public ocExpiring; // hash leaving at the end of round r
    bool public halted;
    uint64 public pausedAt;

    // ── rigs ────────────────────────────────────────────────────────────────
    Rig[] internal _rigs;
    mapping(address => uint256[]) internal _rigsOf;
    mapping(uint256 => mapping(uint64 => uint256)) internal _rigWork;

    modifier onlyOperator() {
        if (msg.sender != operator) revert NotOperator();
        _;
    }

    modifier onlyGuardian() {
        if (msg.sender != _p.treasury) revert NotGuardian();
        _;
    }

    modifier notHalted() {
        if (halted) revert Halted();
        _;
    }

    constructor(RoundParams memory p, address operator_, address fragments_, address vault_) {
        if (p.stocks.length != STOCKS) revert InvalidParams("stocks");
        for (uint256 i; i < STOCKS; ++i) {
            if (p.stocks[i] == address(0)) revert InvalidParams("stocks");
        }
        if (p.rig == address(0) || p.treasury == address(0) || operator_ == address(0)) {
            revert InvalidParams("addresses");
        }
        if (p.roundSeconds == 0) revert InvalidParams("round");
        if (p.claimSeconds == 0 || p.claimSeconds >= p.roundSeconds) revert InvalidParams("claim < round");
        if (p.fragPerToken == 0 || p.fragPerToken > WAD) revert InvalidParams("fragPerToken");
        if (p.minStakeWeight == 0) revert InvalidParams("minStakeWeight");
        if (p.gpuMultBps[0] != BPS) revert InvalidParams("gpuMultBps");
        for (uint256 i = 1; i < 6; ++i) {
            if (p.gpuMultBps[i] <= p.gpuMultBps[i - 1]) revert InvalidParams("gpuMultBps");
        }
        if (uint256(p.ocBoostBps) * p.maxActiveOc > 30_000) revert InvalidParams("ocBoost*maxActiveOc");
        if (p.maxActiveOc == 0 || p.ocRoundSpan == 0) revert InvalidParams("overclock config");
        for (uint256 c; c < 4; ++c) {
            if (p.heatPerOc[c] > p.heatMax) revert InvalidParams("heatPerOc > heatMax");
        }
        if (p.activationFeeBps > 1000 || p.exitFeeBps > 2000) revert InvalidParams("fees");
        if (p.pauseGraceSeconds == 0) revert InvalidParams("grace");
        _p = p;
        _rig = IERC20(p.rig);
        operator = operator_;
        fragments = fragments_;
        vault = vault_;
        _genesis = p.genesis;
        _L = p.roundSeconds;
        _W = p.claimSeconds;
        _lastTime = p.genesis;
    }

    // ── permissionless maintenance ──────────────────────────────────────────

    /// @inheritdoc IRoundMine
    function poke() external {
        _updateGlobal();
    }

    // ── funding ─────────────────────────────────────────────────────────────

    /// @inheritdoc IRoundMine
    /// @dev `amount / rounds` per round, the remainder never leaves the funder. The schedule starts
    ///      with the round after the current one so a running round's pot is never changed under the
    ///      rigs mining it.
    function fund(uint8 s, uint256 amount, uint64 rounds) external nonReentrant notHalted {
        if (s >= STOCKS) revert InvalidParams("stock");
        if (rounds == 0 || rounds > MAX_FUND_ROUNDS) revert InvalidParams("rounds");
        _updateGlobal();
        uint256 per = amount / rounds;
        if (per == 0) revert InvalidParams("amount");
        // Before genesis round 0 has not started, so it can be funded; afterwards the running round's
        // pot is never changed under the rigs mining it.
        uint64 first = _now() < _genesis ? 0 : currentRound() + 1;
        for (uint64 r = first; r < first + rounds; ++r) {
            _scheduled[s][r] += per;
        }
        if (first + rounds - 1 > _scheduledUntil[s]) _scheduledUntil[s] = first + rounds - 1;
        IERC20(_p.stocks[s]).safeTransferFrom(msg.sender, vault, per * rounds);
        emit Funded(msg.sender, s, per * rounds, first, rounds);
    }

    /// @inheritdoc IRoundMine
    function unschedule(uint8 s, uint64 fromRound)
        external
        nonReentrant
        onlyOperator
        returns (uint256 amount)
    {
        if (s >= STOCKS) revert InvalidParams("stock");
        _updateGlobal();
        if (_now() >= _genesis && fromRound <= currentRound()) revert RoundStarted();
        uint64 until = _scheduledUntil[s];
        for (uint64 r = fromRound; r <= until; ++r) {
            amount += _scheduled[s][r];
            delete _scheduled[s][r];
        }
        if (until >= fromRound) _scheduledUntil[s] = fromRound - 1;
        if (amount > 0) IRoundVault(vault).release(s, operator, amount);
        emit Unscheduled(s, fromRound, amount);
    }

    // ── player actions ──────────────────────────────────────────────────────

    /// @inheritdoc IRoundMine
    function activate(uint256 amount) external nonReentrant whenNotPaused notHalted returns (uint256 rigId) {
        _updateGlobal();
        if (amount < _p.minStakeWeight) revert BelowMinStake();
        _rig.safeTransferFrom(msg.sender, address(this), amount);
        uint256 fee = (amount * _p.activationFeeBps) / BPS;
        if (fee > 0) _rig.safeTransferFrom(msg.sender, _p.treasury, fee);

        rigId = _rigs.length;
        _rigs.push();
        Rig storage r = _rigs[rigId];
        r.owner = msg.sender;
        r.amount = amount.toUint128();
        r.baseHash = ((amount * _p.gpuMultBps[0]) / BPS).toUint128();
        r.lastRound = currentRound();
        r.lastTime = _now();
        _rigsOf[msg.sender].push(rigId);
        totalHash += r.baseHash;
        emit RigActivated(rigId, msg.sender, amount, fee);
    }

    /// @inheritdoc IRoundMine
    function upgradeGpu(uint256 rigId) external nonReentrant whenNotPaused notHalted {
        _updateGlobal();
        Rig storage r = _ownedActive(rigId);
        _settleRig(rigId, r);
        uint8 tier = r.gpuTier;
        if (tier >= 5) revert MaxTier();
        uint256 cost = (uint256(r.amount) * _p.gpuCostBps[tier]) / BPS;
        uint8 newTier = tier + 1;
        uint256 newBase = (uint256(r.amount) * _p.gpuMultBps[newTier]) / BPS;
        uint256 delta = newBase - r.baseHash;
        if (r.ocHash > 0) {
            uint256 newOc = (newBase * _p.ocBoostBps * r.activeOc) / BPS;
            ocExpiring[r.ocExpiryRound] = ocExpiring[r.ocExpiryRound] - r.ocHash + newOc;
            delta += newOc - r.ocHash;
            r.ocHash = newOc.toUint128();
        }
        r.gpuTier = newTier;
        r.baseHash = newBase.toUint128();
        totalHash += delta;
        _burn(cost);
        emit GpuUpgraded(rigId, newTier, cost);
    }

    /// @inheritdoc IRoundMine
    function upgradeCooling(uint256 rigId) external nonReentrant whenNotPaused notHalted {
        _updateGlobal();
        Rig storage r = _ownedActive(rigId);
        _settleRig(rigId, r);
        uint8 tier = r.coolingTier;
        if (tier >= 3) revert MaxTier();
        uint256 cost = (uint256(r.amount) * _p.coolCostBps[tier]) / BPS;
        r.coolingTier = tier + 1;
        _burn(cost);
        emit CoolingUpgraded(rigId, tier + 1, cost);
    }

    /// @inheritdoc IRoundMine
    /// @dev Active until the end of round `current + ocRoundSpan`; buying another refreshes all.
    function overclock(uint256 rigId) external nonReentrant whenNotPaused notHalted {
        _updateGlobal();
        Rig storage r = _ownedActive(rigId);
        _settleRig(rigId, r);
        if (r.activeOc >= _p.maxActiveOc) revert MaxOverclocks();
        uint256 heatAfter = uint256(r.heat) + _p.heatPerOc[r.coolingTier];
        if (heatAfter > _p.heatMax) revert HeatTooHigh();
        uint256 cost = (uint256(r.amount) * _p.ocCostBps) / BPS;
        r.heat = uint8(heatAfter);
        r.activeOc += 1;
        uint256 newOc = (uint256(r.baseHash) * _p.ocBoostBps * r.activeOc) / BPS;
        if (r.ocHash > 0) ocExpiring[r.ocExpiryRound] -= r.ocHash;
        uint64 cur = currentRound();
        uint64 expiry = cur + _p.ocRoundSpan;
        r.ocExpiryRound = expiry;
        ocExpiring[expiry] += newOc;
        totalHash = totalHash - r.ocHash + newOc;
        r.ocHash = newOc.toUint128();
        _burn(cost);
        emit Overclocked(rigId, cur, r.activeOc, expiry, r.heat, cost);
    }

    /// @inheritdoc IRoundMine
    function claim(uint256 rigId)
        external
        nonReentrant
        whenNotPaused
        notHalted
        returns (uint256[] memory out)
    {
        _updateGlobal();
        Rig storage r = _owned(rigId);
        if (_closed == 0) revert NothingToClaim();
        if (_now() >= roundEnd(_closed - 1) + _W) revert ClaimWindowClosed();
        bool any;
        (out, any) = _claim(rigId, r);
        if (!any) revert NothingToClaim();
    }

    /// @inheritdoc IRoundMine
    function claimAll() external nonReentrant whenNotPaused notHalted returns (uint256[] memory out) {
        _updateGlobal();
        out = new uint256[](STOCKS);
        uint256[] storage ids = _rigsOf[msg.sender];
        if (_closed == 0 || _now() >= roundEnd(_closed - 1) + _W) return out;
        for (uint256 i; i < ids.length; ++i) {
            (uint256[] memory got, bool any) = _claim(ids[i], _rigs[ids[i]]);
            if (!any) continue;
            for (uint256 s; s < got.length; ++s) {
                out[s] += got[s];
            }
        }
    }

    /// @inheritdoc IRoundMine
    function exit(uint256 rigId) external nonReentrant whenNotPaused notHalted {
        _updateGlobal();
        Rig storage r = _ownedActive(rigId);
        _settleRig(rigId, r);
        _removeHash(r);
        r.inactive = true;
        uint256 fee = (uint256(r.amount) * _p.exitFeeBps) / BPS;
        if (fee > 0) _rig.safeTransfer(_p.treasury, fee);
        _rig.safeTransfer(r.owner, r.amount - fee);
        emit Exited(rigId, r.amount - fee, fee);
    }

    /// @inheritdoc IRoundMine
    /// @dev A pause that outlived its grace period halts the mine on the first withdrawal (FR-S6).
    function emergencyWithdraw(uint256 rigId) external nonReentrant {
        if (!halted) {
            if (!paused() || _now() <= uint256(pausedAt) + _p.pauseGraceSeconds) {
                revert PauseGraceNotElapsed();
            }
            _halt();
        }
        Rig storage r = _ownedActive(rigId);
        _removeHash(r);
        r.inactive = true;
        _rig.safeTransfer(r.owner, r.amount);
        emit Withdrawn(rigId, r.amount);
    }

    // ── admin ───────────────────────────────────────────────────────────────

    /// @inheritdoc IRoundMine
    function halt() external onlyOperator notHalted {
        _updateGlobal();
        _halt();
    }

    /// @inheritdoc IRoundMine
    function pause() external onlyGuardian notHalted {
        _updateGlobal();
        pausedAt = _now();
        _pause();
    }

    /// @inheritdoc IRoundMine
    function unpause() external onlyGuardian {
        if (halted) revert Halted();
        _unpause();
    }

    // ── views ───────────────────────────────────────────────────────────────

    function params() external view returns (RoundParams memory) {
        return _p;
    }

    function currentRound() public view returns (uint64) {
        uint64 t = _now();
        if (t < _genesis) return 0;
        return (t - _genesis) / _L;
    }

    function roundEnd(uint64 r) public view returns (uint64) {
        return _genesis + (r + 1) * _L;
    }

    function closedRounds() external view returns (uint64) {
        return _closed;
    }

    function roundWork(uint64 r) external view returns (uint256) {
        if (r < _closed) return _roundWork[r];
        (uint64 closed, uint256[] memory works,) = _simulate();
        if (r < closed) return works[r - _closed];
        if (r == closed && r == currentRound()) return works[closed - _closed];
        return 0;
    }

    function pot(uint64 r, uint8 s) public view returns (uint256) {
        if (r < _closed) return _pot[r][s];
        // Not closed yet: scheduled plus the rollover chain back to the last recorded round.
        uint256 p = _scheduled[s][r];
        if (r == 0) return p;
        uint64 prev = r - 1;
        if (prev < _closed) return p + _pot[prev][s] - _claimed[prev][s];
        return p + pot(prev, s); // an unclosed earlier round has no claims yet
    }

    function claimedOf(uint64 r, uint8 s) external view returns (uint256) {
        return _claimed[r][s];
    }

    function scheduled(uint8 s, uint64 r) external view returns (uint256) {
        return _scheduled[s][r];
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

    function rigHash(uint256 rigId) external view returns (uint256) {
        Rig memory r = _rigs[rigId];
        if (r.inactive) return 0;
        uint256 h = r.baseHash;
        if (r.ocHash > 0 && currentRound() <= r.ocExpiryRound) h += r.ocHash;
        return h;
    }

    function rigWork(uint256 rigId, uint64 r) external view returns (uint256) {
        Rig memory rg = _rigs[rigId];
        uint256 stored = _rigWork[rigId][r];
        // Stored work ends at the rig's last settlement; the rest is the same arithmetic settlement
        // would do, so the view is exact for any round the rig was live in.
        if (rg.inactive || r > currentRound()) return stored;
        return stored + _workIn(rg, r, _now());
    }

    function claimable(uint256 rigId) external view returns (uint256[] memory out) {
        out = new uint256[](STOCKS);
        if (halted || _now() < _genesis) return out;
        (uint64 closed, uint256[] memory works,) = _simulate();
        if (closed == 0) return out;
        uint64 r = closed - 1;
        if (_now() >= roundEnd(r) + _W) return out;
        Rig memory rg = _rigs[rigId];
        if (rg.claimedPlusOne > r) return out;
        uint256 w = _rigWork[rigId][r] + (rg.inactive ? 0 : _workIn(rg, r, _now()));
        uint256 rw = r < _closed ? _roundWork[r] : works[r - _closed];
        if (w == 0 || rw == 0) return out;
        for (uint8 s; s < STOCKS; ++s) {
            out[s] = Math.mulDiv(Math.mulDiv(pot(r, s), w, rw), _p.fragPerToken, WAD);
        }
    }

    function gpuCost(uint256 rigId) external view returns (uint256) {
        Rig storage r = _rigs[rigId];
        if (r.gpuTier >= 5) revert MaxTier();
        return (uint256(r.amount) * _p.gpuCostBps[r.gpuTier]) / BPS;
    }

    function coolingCost(uint256 rigId) external view returns (uint256) {
        Rig storage r = _rigs[rigId];
        if (r.coolingTier >= 3) revert MaxTier();
        return (uint256(r.amount) * _p.coolCostBps[r.coolingTier]) / BPS;
    }

    function overclockCost(uint256 rigId) external view returns (uint256) {
        return (uint256(_rigs[rigId].amount) * _p.ocCostBps) / BPS;
    }

    // ── internal: global settlement ─────────────────────────────────────────

    /// @dev Records every round boundary between `_lastTime` and now: the round's work, its pot
    ///      (scheduled + the previous round's unclaimed remainder, final because that round's claim
    ///      window ended before this one closed) and the overclock hash that expires with it. Bounded
    ///      by the rounds elapsed since the last transaction; the keeper keeps it to one.
    function _updateGlobal() internal {
        if (halted) return;
        uint64 t = _now();
        if (t <= _lastTime) return;
        uint64 r = _closed;
        uint64 end = roundEnd(r);
        while (end <= t) {
            _workAcc += totalHash * (end - _lastTime);
            _roundWork[r] = _workAcc;
            _workAcc = 0;
            _lastTime = end;
            totalHash -= ocExpiring[r];
            delete ocExpiring[r];
            uint256[] memory p = new uint256[](STOCKS);
            for (uint8 s; s < STOCKS; ++s) {
                uint256 v = _scheduled[s][r];
                if (r > 0) v += _pot[r - 1][s] - _claimed[r - 1][s];
                _pot[r][s] = v;
                p[s] = v;
            }
            emit RoundClosed(r, _roundWork[r], p, totalHash);
            ++r;
            end += _L;
        }
        _closed = r;
        _workAcc += totalHash * (t - _lastTime);
        _lastTime = t;
    }

    /// @dev Memory replay of `_updateGlobal` for views: rounds `_closed .. closed-1` with their work,
    ///      plus the open round's work so far, and the total hash after every expiry.
    function _simulate() internal view returns (uint64 closed, uint256[] memory works, uint256 hashNow) {
        uint64 t = _now();
        uint64 r = _closed;
        uint64 last = _lastTime;
        uint256 acc = _workAcc;
        uint256 h = totalHash;
        uint64 cur = currentRound();
        uint256 n = cur >= _closed ? cur - _closed + 1 : 1;
        works = new uint256[](n);
        if (halted || t <= last) {
            works[0] = acc;
            return (_closed, works, h);
        }
        uint64 end = roundEnd(r);
        while (end <= t) {
            acc += h * (end - last);
            works[r - _closed] = acc;
            acc = 0;
            last = end;
            h -= ocExpiring[r];
            ++r;
            end += _L;
        }
        acc += h * (t - last);
        if (r - _closed < n) works[r - _closed] = acc;
        return (r, works, h);
    }

    // ── internal: rig settlement ────────────────────────────────────────────

    /// @dev Credits the rig's work since its last settlement to the rounds it can still claim (the
    ///      latest closed round and the current one); earlier rounds have rolled over, so their share
    ///      is never needed. Then expires the overclock if its round has closed, decays heat one step
    ///      per boundary crossed, and stamps the settlement time.
    function _settleRig(uint256 rigId, Rig storage rs) internal {
        Rig memory r = rs;
        uint64 t = _now();
        if (t < _genesis) return;
        uint64 cur = currentRound();
        if (t > r.lastTime && !r.inactive) {
            uint64 from = cur > 0 ? cur - 1 : 0;
            uint64 lastRound = r.lastTime <= _genesis ? 0 : (r.lastTime - _genesis) / _L;
            if (lastRound > from) from = lastRound;
            for (uint64 k = from; k <= cur; ++k) {
                uint256 w = _workIn(r, k, t);
                if (w > 0) _rigWork[rigId][k] += w;
            }
        }
        if (r.ocHash > 0 && cur > r.ocExpiryRound) {
            rs.ocHash = 0;
            rs.activeOc = 0;
        }
        uint64 crossed = cur > r.lastRound ? cur - r.lastRound : 0;
        if (crossed > 0 && r.heat > 0) {
            uint256 dec = uint256(crossed) * _p.coolPerRound[r.coolingTier];
            rs.heat = dec >= r.heat ? 0 : uint8(r.heat - dec);
        }
        rs.lastRound = cur;
        rs.lastTime = t;
    }

    /// @dev Work the rig did in round `k` between its last settlement and `t`, from its
    ///      piecewise-constant hash: base always, overclock through the end of `ocExpiryRound`.
    function _workIn(Rig memory r, uint64 k, uint64 t) internal view returns (uint256) {
        uint64 start = _genesis + k * _L;
        uint64 end = start + _L;
        uint64 lo = r.lastTime > start ? r.lastTime : start;
        uint64 hi = t < end ? t : end;
        if (hi <= lo) return 0;
        uint256 w = uint256(r.baseHash) * (hi - lo);
        if (r.ocHash > 0 && k <= r.ocExpiryRound) w += uint256(r.ocHash) * (hi - lo);
        return w;
    }

    /// @dev Pays the latest closed round's share as whole fragments per stock; the stock value of the
    ///      whole fragments is what counts as claimed, so rounding dust stays in the pot and rolls.
    ///      The caller has checked that a closed round exists and its window is open.
    function _claim(uint256 rigId, Rig storage r) internal returns (uint256[] memory out, bool any) {
        uint64 round = _closed - 1;
        out = new uint256[](STOCKS);
        if (r.claimedPlusOne > round) return (out, false);
        _settleRig(rigId, r);
        uint256 w = _rigWork[rigId][round];
        uint256 rw = _roundWork[round];
        if (w == 0 || rw == 0) return (out, false);
        for (uint8 s; s < STOCKS; ++s) {
            uint256 share = Math.mulDiv(_pot[round][s], w, rw);
            uint256 f = Math.mulDiv(share, _p.fragPerToken, WAD);
            if (f == 0) continue;
            _claimed[round][s] += Math.mulDiv(f, WAD, _p.fragPerToken);
            out[s] = f;
            any = true;
        }
        if (!any) return (out, false);
        r.claimedPlusOne = round + 1;
        for (uint8 s; s < STOCKS; ++s) {
            if (out[s] > 0) IStockFragments(fragments).mint(r.owner, s, out[s]);
        }
        emit Claimed(rigId, round, out);
    }

    // ── internal helpers ────────────────────────────────────────────────────

    function _halt() internal {
        halted = true;
        emit MineHalted(_now(), msg.sender);
    }

    function _removeHash(Rig storage r) internal {
        uint256 live = r.baseHash;
        if (r.ocHash > 0) {
            if (currentRound() <= r.ocExpiryRound) {
                live += r.ocHash;
                uint256 bucket = ocExpiring[r.ocExpiryRound];
                ocExpiring[r.ocExpiryRound] = bucket > r.ocHash ? bucket - r.ocHash : 0;
            }
            r.ocHash = 0;
            r.activeOc = 0;
        }
        totalHash = totalHash > live ? totalHash - live : 0;
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

    function _now() internal view returns (uint64) {
        return uint64(block.timestamp);
    }
}
