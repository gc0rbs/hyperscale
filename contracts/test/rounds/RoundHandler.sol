// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {RoundMine} from "../../src/rounds/RoundMine.sol";
import {RoundVault} from "../../src/rounds/RoundVault.sol";
import {StockFragments} from "../../src/StockFragments.sol";
import {IRoundMine} from "../../src/interfaces/IRoundMine.sol";
import {RIG} from "../../src/tokens/RIG.sol";
import {MockStockToken} from "../../src/mocks/MockStockToken.sol";
import {MockPriceOracle} from "../../src/mocks/MockPriceOracle.sol";

/// @dev Random players activate, upgrade, overclock, claim, exit and redeem; the fee wallet funds;
///      the operator unschedules and (rarely) halts; the guardian pauses; time warps. Ghost state
///      tracks deposits, funded stock and the claims of every closed round for docs/13 §4.
contract RoundHandler is Test {
    RoundMine public mine;
    RoundVault public vault;
    StockFragments public frags;
    RIG public rig;
    MockStockToken[4] public stocks;
    MockPriceOracle public oracle;
    address public operator;
    address public feeWallet;

    address[] public actors;
    uint256[] public rigIds;
    uint256 public ghostDeposits;
    uint256[4] public ghostFunded; // stock moved into the vault minus unscheduled minus redeemed in kind
    uint256 public calls;
    uint256 public claims;
    uint256 public halts;
    uint64 public haltedAtClosed;
    // Work of the latest closed round must never change: snapshot when first observed.
    mapping(uint64 => uint256) public roundWorkSeen;
    mapping(uint64 => bool) public roundSeen;
    bool public roundWorkChanged;

    constructor(
        RoundMine mine_,
        RoundVault vault_,
        StockFragments frags_,
        RIG rig_,
        MockStockToken[4] memory stocks_,
        MockPriceOracle oracle_,
        address operator_,
        address feeWallet_
    ) {
        mine = mine_;
        vault = vault_;
        frags = frags_;
        rig = rig_;
        stocks = stocks_;
        oracle = oracle_;
        operator = operator_;
        feeWallet = feeWallet_;
        for (uint256 i; i < 5; ++i) {
            address a = address(uint160(0xB000 + i));
            actors.push(a);
            vm.prank(a);
            rig.approve(address(mine), type(uint256).max);
        }
    }

    modifier track() {
        calls++;
        _;
        _snapshotClosed();
    }

    function warp(uint32 dt) external track {
        dt = uint32(bound(dt, 1, 3 hours));
        vm.warp(block.timestamp + dt);
        mine.poke();
        for (uint8 b; b < 4; ++b) {
            oracle.set(address(stocks[b]), 100e8, uint64(block.timestamp));
        }
    }

    function fund(uint8 s, uint256 amount, uint64 rounds) external track {
        s = s % 4;
        amount = bound(amount, 1e15, 100e18);
        rounds = uint64(bound(rounds, 1, 48));
        stocks[s].mint(feeWallet, amount);
        vm.startPrank(feeWallet);
        stocks[s].approve(address(mine), amount);
        try mine.fund(s, amount, rounds) {
            ghostFunded[s] += (amount / rounds) * rounds;
        } catch {}
        vm.stopPrank();
    }

    function unschedule(uint8 s, uint64 ahead) external track {
        s = s % 4;
        ahead = uint64(bound(ahead, 1, 48));
        vm.prank(operator);
        try mine.unschedule(s, mine.currentRound() + ahead) returns (uint256 out) {
            ghostFunded[s] -= out;
        } catch {}
    }

    function activate(uint8 who, uint256 amount) external track {
        address a = actors[who % actors.length];
        amount = bound(amount, 100e18, 2_000_000e18);
        rig.transfer(a, amount * 2);
        vm.prank(a);
        try mine.activate(amount) returns (uint256 id) {
            rigIds.push(id);
            ghostDeposits += amount;
        } catch {}
    }

    function upgradeGpu(uint256 which) external track {
        (uint256 id, address o) = _pick(which);
        if (o == address(0)) return;
        IRoundMine.Rig memory r = mine.rigs(id);
        if (r.inactive || r.gpuTier >= 5) return;
        rig.transfer(o, mine.gpuCost(id));
        vm.prank(o);
        try mine.upgradeGpu(id) {} catch {}
    }

    function upgradeCooling(uint256 which) external track {
        (uint256 id, address o) = _pick(which);
        if (o == address(0)) return;
        IRoundMine.Rig memory r = mine.rigs(id);
        if (r.inactive || r.coolingTier >= 3) return;
        rig.transfer(o, mine.coolingCost(id));
        vm.prank(o);
        try mine.upgradeCooling(id) {} catch {}
    }

    function overclock(uint256 which) external track {
        (uint256 id, address o) = _pick(which);
        if (o == address(0)) return;
        if (mine.rigs(id).inactive) return;
        rig.transfer(o, mine.overclockCost(id));
        vm.prank(o);
        try mine.overclock(id) {} catch {}
    }

    function claim(uint256 which) external track {
        (uint256 id, address o) = _pick(which);
        if (o == address(0)) return;
        vm.prank(o);
        try mine.claim(id) {
            claims++;
        } catch {}
    }

    function claimAll(uint8 who) external track {
        address a = actors[who % actors.length];
        vm.prank(a);
        try mine.claimAll() {} catch {}
    }

    function exitRig(uint256 which) external track {
        (uint256 id, address o) = _pick(which);
        if (o == address(0)) return;
        IRoundMine.Rig memory r = mine.rigs(id);
        if (r.inactive) return;
        vm.prank(o);
        try mine.exit(id) {
            ghostDeposits -= r.amount;
        } catch {}
    }

    function redeem(uint256 which, uint8 s, bool cash) external track {
        (uint256 id, address o) = _pick(which);
        if (o == address(0)) return;
        s = s % 4;
        uint256 bal = frags.balanceOf(o, s);
        if (bal == 0) return;
        vm.prank(o);
        if (cash) {
            try vault.cashOut(s, bal) {} catch {}
        } else {
            try vault.redeem(s, bal) returns (uint256 tokens) {
                ghostFunded[s] -= tokens;
            } catch {}
        }
    }

    /// @dev Guardian pauses; time passes; an unpause, or (rarely, past the grace period) an emergency
    ///      withdrawal that halts the mine.
    function pauseCycle(uint32 dt, uint256 which, uint8 mode) external track {
        if (mine.paused() || mine.halted()) return;
        address guardian = mine.params().treasury;
        vm.prank(guardian);
        try mine.pause() {}
            catch {
            return;
        }
        dt = uint32(bound(dt, 1 minutes, 2 hours));
        vm.warp(block.timestamp + dt);
        mine.poke();
        if (mode % 64 == 0 && dt > 30 minutes) {
            _emergencyWithdraw(which);
            return;
        }
        vm.prank(guardian);
        mine.unpause();
    }

    function halt(uint8 mode) external track {
        if (mode % 128 != 0 || mine.halted()) return;
        vm.prank(operator);
        try mine.halt() {
            halts++;
            haltedAtClosed = mine.closedRounds();
        } catch {}
    }

    function emergencyWithdraw(uint256 which) external track {
        if (!mine.halted() && !mine.paused()) return;
        _emergencyWithdraw(which);
    }

    function _emergencyWithdraw(uint256 which) internal {
        (uint256 id, address o) = _pick(which);
        if (o == address(0)) return;
        IRoundMine.Rig memory r = mine.rigs(id);
        if (r.inactive) return;
        vm.prank(o);
        try mine.emergencyWithdraw(id) {
            ghostDeposits -= r.amount;
            if (mine.halted() && halts == 0) {
                halts++;
                haltedAtClosed = mine.closedRounds();
            }
        } catch {}
    }

    function rigCount() external view returns (uint256) {
        return rigIds.length;
    }

    function actorCount() external view returns (uint256) {
        return actors.length;
    }

    function _pick(uint256 which) internal view returns (uint256 id, address owner) {
        if (rigIds.length == 0) return (0, address(0));
        id = rigIds[which % rigIds.length];
        owner = mine.rigs(id).owner;
    }

    /// @dev Invariant 3: a closed round's work is final. Record it the first time it is closed and
    ///      compare on every later call.
    function _snapshotClosed() internal {
        uint64 closed = mine.closedRounds();
        if (closed == 0) return;
        uint64 r = closed - 1;
        if (!roundSeen[r]) {
            roundSeen[r] = true;
            roundWorkSeen[r] = mine.roundWork(r);
        } else if (mine.roundWork(r) != roundWorkSeen[r]) {
            roundWorkChanged = true;
        }
    }
}
