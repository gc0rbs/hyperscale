// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SeasonMine} from "../../src/SeasonMine.sol";
import {ISeasonMine} from "../../src/interfaces/ISeasonMine.sol";
import {RIG} from "../../src/tokens/RIG.sol";
import {MockERC20} from "../../src/mocks/MockERC20.sol";

/// @dev Random players activate, upgrade, overclock, claim, exit, poke and warp time. Ghost state
///      tracks deposits and the last-seen pending per (rig, block) for the monotonicity invariant.
contract MineHandler is Test {
    SeasonMine public mine;
    RIG public rig;
    MockERC20 public lp;
    uint64 public openTime;

    address[] public actors;
    uint256[] public rigIds;
    mapping(uint256 => uint256[4]) public lastPending;
    uint256 public ghostRigDeposits;
    uint256 public ghostLpDeposits;
    uint256 public calls;
    bool public monotonic = true;

    constructor(SeasonMine mine_, RIG rig_, MockERC20 lp_, uint64 openTime_) {
        mine = mine_;
        rig = rig_;
        lp = lp_;
        openTime = openTime_;
        for (uint256 i; i < 5; ++i) {
            address a = address(uint160(0xA000 + i));
            actors.push(a);
            vm.startPrank(a);
            rig.approve(address(mine), type(uint256).max);
            lp.approve(address(mine), type(uint256).max);
            vm.stopPrank();
        }
    }

    function fund(address a, uint256 amt, uint256 lpAmt) external {
        rig.transfer(a, amt);
        if (lpAmt > 0) lp.mint(a, lpAmt);
    }

    modifier track() {
        calls++;
        _;
        _checkMonotone();
    }

    function warp(uint32 dt) external track {
        dt = uint32(bound(dt, 1, 2 days));
        vm.warp(block.timestamp + dt);
        mine.poke();
    }

    function activate(uint8 who, uint256 amount, bool useLp) external track {
        address a = actors[who % actors.length];
        if (mine.phase() != ISeasonMine.Phase.PreOpen && mine.phase() != ISeasonMine.Phase.Open) return;
        if (useLp) {
            amount = bound(amount, 100e18, 2_000_000e18);
            lp.mint(a, amount);
            rig.transfer(a, amount); // fee money
            vm.prank(a);
            uint256 id = mine.activate(ISeasonMine.Asset.LP, amount);
            rigIds.push(id);
            ghostLpDeposits += amount;
        } else {
            amount = bound(amount, 100e18, 5_000_000e18);
            rig.transfer(a, amount * 2);
            vm.prank(a);
            uint256 id = mine.activate(ISeasonMine.Asset.RIG, amount);
            rigIds.push(id);
            ghostRigDeposits += amount;
        }
    }

    function upgradeGpu(uint256 which) external track {
        (uint256 id, address o) = _pick(which);
        if (o == address(0)) return;
        ISeasonMine.Rig memory r = mine.rigs(id);
        if (r.inactive || r.gpuTier >= 5) return;
        ISeasonMine.Phase ph = mine.phase();
        if (ph != ISeasonMine.Phase.PreOpen && ph != ISeasonMine.Phase.Open) return;
        rig.transfer(o, mine.gpuCost(id));
        vm.prank(o);
        mine.upgradeGpu(id);
    }

    function upgradeCooling(uint256 which) external track {
        (uint256 id, address o) = _pick(which);
        if (o == address(0)) return;
        ISeasonMine.Rig memory r = mine.rigs(id);
        if (r.inactive || r.coolingTier >= 3) return;
        ISeasonMine.Phase ph = mine.phase();
        if (ph != ISeasonMine.Phase.PreOpen && ph != ISeasonMine.Phase.Open) return;
        rig.transfer(o, mine.coolingCost(id));
        vm.prank(o);
        mine.upgradeCooling(id);
    }

    function overclock(uint256 which) external track {
        (uint256 id, address o) = _pick(which);
        if (o == address(0)) return;
        if (mine.phase() != ISeasonMine.Phase.Open) return;
        ISeasonMine.Rig memory r = mine.rigs(id);
        if (r.inactive) return;
        rig.transfer(o, mine.overclockCost(id));
        vm.prank(o);
        try mine.overclock(id) {} catch {}
    }

    function claimAll(uint256 which) external track {
        (uint256 id, address o) = _pick(which);
        if (o == address(0)) return;
        vm.prank(o);
        try mine.claimAll(id) returns (uint256[4] memory got) {
            for (uint256 b; b < 4; ++b) {
                if (got[b] > 0) lastPending[id][b] = 0;
            }
        } catch {}
    }

    function exitRig(uint256 which) external track {
        (uint256 id, address o) = _pick(which);
        if (o == address(0)) return;
        ISeasonMine.Rig memory r = mine.rigs(id);
        if (r.inactive) return;
        ISeasonMine.Phase ph = mine.phase();
        if (ph == ISeasonMine.Phase.Closed) {
            vm.prank(o);
            mine.withdraw(id);
        } else if (ph == ISeasonMine.Phase.Open || ph == ISeasonMine.Phase.PreOpen) {
            vm.prank(o);
            mine.exit(id);
        } else {
            return;
        }
        if (r.asset == ISeasonMine.Asset.RIG) ghostRigDeposits -= r.amount;
        else ghostLpDeposits -= r.amount;
    }

    function rigCount() external view returns (uint256) {
        return rigIds.length;
    }

    function _pick(uint256 which) internal view returns (uint256 id, address owner) {
        if (rigIds.length == 0) return (0, address(0));
        id = rigIds[which % rigIds.length];
        owner = mine.rigs(id).owner;
    }

    function _checkMonotone() internal {
        for (uint256 i; i < rigIds.length; ++i) {
            uint256 id = rigIds[i];
            for (uint8 b; b < 4; ++b) {
                uint256 p = mine.pending(id, b);
                if (p < lastPending[id][b]) monotonic = false;
                lastPending[id][b] = p;
            }
        }
    }
}
