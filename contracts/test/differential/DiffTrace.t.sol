// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SeasonTestBase} from "../base/SeasonTestBase.sol";
import {ISeasonMine} from "../../src/interfaces/ISeasonMine.sol";
import {SeasonMine} from "../../src/SeasonMine.sol";
import {RedemptionVault} from "../../src/RedemptionVault.sol";
import {StockFragments} from "../../src/StockFragments.sol";

/// @title Differential fuzz: SeasonMine vs the Python reference (sim/sim/mine.py)
/// @notice Every fuzz run builds a random action trace from the seed, plays it against one of eight
///         pre-deployed seasons (different difficulty scales and fail-safe durations), and appends
///         `{trace, outcome}` as one JSON line to `DIFF_OUT` (if set). `python -m sim.diff <file>`
///         replays each line through the reference and diffs action results, revert names and the
///         final state. Without `DIFF_OUT` the test still runs and checks only that nothing panics.
/// @dev    forge test --match-contract DiffTrace --fuzz-runs 100000   (DIFF_OUT=diff/traces.jsonl)
contract DiffTraceTest is SeasonTestBase {
    uint256 internal constant N_SEASONS = 8;

    SeasonMine[] internal mines;
    StockFragments[] internal fragsOf;
    uint256[] internal diffWhole; // whole hash-seconds, index = season * 4 + block
    uint32[] internal maxDur;
    address[5] internal actors;
    string internal outPath;
    bool internal writeOut;

    // per-run scratch
    string internal actionsJson;
    uint256[4][] internal claimedByRig;

    function setUp() public override {
        super.setUp();
        outPath = vm.envOr("DIFF_OUT", string(""));
        writeOut = bytes(outPath).length > 0;
        for (uint256 i; i < 5; ++i) {
            actors[i] = address(uint160(0xD1FF0000 + i));
            rig.transfer(actors[i], 100_000_000e18);
            lp.mint(actors[i], 100_000_000e18);
        }
        // scale numerators/denominators for difficulty, and fail-safe durations
        uint256[8] memory num = [uint256(1), 1, 1, 4, 1, 1, 16, 1];
        uint256[8] memory den = [uint256(1), 16, 4, 1, 1, 64, 1, 2];
        uint32[8] memory dur =
            [uint32(30 days), 30 days, 30 days, 30 days, 14 days, 14 days, 60 days, 20 days];
        for (uint256 s; s < N_SEASONS; ++s) {
            ISeasonMine.SeasonParams memory p = defaultParams();
            p.maxDurationSeconds = dur[s];
            for (uint256 b; b < 4; ++b) {
                uint256 whole = (DIFFICULTY[b] / WAD) * num[s] / den[s];
                p.difficulty[b] = whole * WAD;
                diffWhole.push(whole);
            }
            maxDur.push(dur[s]);
            (, address m, address f, address v) =
                factory.create(p, address(elig), address(oracle), address(usdc), false);
            mines.push(SeasonMine(m));
            fragsOf.push(StockFragments(f));
            _fundVault(RedemptionVault(v));
            for (uint256 i; i < 5; ++i) {
                vm.startPrank(actors[i]);
                rig.approve(m, type(uint256).max);
                lp.approve(m, type(uint256).max);
                vm.stopPrank();
            }
        }
    }

    function _fundVault(RedemptionVault v) internal {
        for (uint256 i; i < 4; ++i) {
            stocks[i].setAllowed(address(v), true);
            stocks[i].mint(address(this), POOL[i]);
            stocks[i].approve(address(v), POOL[i]);
        }
        usdc.mint(address(this), 1e6);
        usdc.approve(address(v), 1e6);
        v.fund(1e6);
    }

    // ── the fuzz entry point ────────────────────────────────────────────────

    function testFuzz_trace_matches_reference(uint256 seed) public {
        uint256 s = seed % N_SEASONS;
        SeasonMine m = mines[s];
        uint256 n = 6 + (uint256(keccak256(abi.encode(seed, "n"))) % 40);
        vm.warp(OPEN - 1 hours);
        actionsJson = "";
        delete claimedByRig;

        for (uint256 i; i < n; ++i) {
            uint256 r = uint256(keccak256(abi.encode(seed, i)));
            _advanceTime(m, r, s);
            _act(m, r >> 64, i);
        }
        // Final poke plus a claimAll per rig, so stored rig state is settled to now on both sides and
        // the snapshot compares like with like.
        m.poke();
        uint256 rc = m.rigCount();
        for (uint256 id; id < rc; ++id) {
            _rigCall(m, id, n + id, "claimAll");
        }

        if (writeOut) vm.writeLine(outPath, _line(m, s));
    }

    // ── time ────────────────────────────────────────────────────────────────

    function _advanceTime(SeasonMine m, uint256 r, uint256 s) internal {
        uint256 roll = r % 100;
        if (roll < 35) return; // same second as the previous action
        uint256 dt;
        ISeasonMine.Eta memory e = m.eta();
        if (roll < 43 && !e.idle) {
            dt = e.toBlockFound + 1;
        } else if (roll < 46 && !e.idle) {
            dt = e.toClose + 1;
        } else if (roll < 48) {
            uint256 deadline = uint256(OPEN) + maxDur[s] + 1;
            dt = deadline > block.timestamp ? deadline - block.timestamp : 0;
        } else if (roll < 52 && block.timestamp < OPEN) {
            dt = OPEN - block.timestamp + (r >> 8) % 3;
        } else if (e.idle || e.toShiftEnd == 0) {
            dt = (r >> 8) % 3600;
        } else {
            dt = (r >> 8) % (e.toShiftEnd * 3 / 2 + 2);
        }
        if (dt > 400 days) dt = 400 days; // keep the fail-safe reachable without absurd jumps
        vm.warp(block.timestamp + dt);
    }

    // ── actions ─────────────────────────────────────────────────────────────

    function _act(SeasonMine m, uint256 r, uint256 idx) internal {
        uint256 kind = r % 100;
        uint256 rigCount = m.rigCount();
        if (rigCount == 0 && kind >= 18) kind = kind % 2 == 0 ? 0 : 90; // activate or poke first
        if (kind < 18) return _activate(m, r >> 8, idx);
        if (kind < 30) return _rigCall(m, r >> 8, idx, "upgradeGpu");
        if (kind < 38) return _rigCall(m, r >> 8, idx, "upgradeCooling");
        if (kind < 58) return _rigCall(m, r >> 8, idx, "overclock");
        if (kind < 66) return _claim(m, r >> 8, idx);
        if (kind < 74) return _rigCall(m, r >> 8, idx, "claimAll");
        if (kind < 80) return _rigCall(m, r >> 8, idx, "exit");
        if (kind < 88) return _rigCall(m, r >> 8, idx, "withdraw");
        if (kind < 94) return _poke(m, idx);
        return _rigCall(m, r >> 8, idx, "wrongOwner");
    }

    function _activate(SeasonMine m, uint256 r, uint256 idx) internal {
        uint256 who = r % 5;
        bool useLp = (r >> 8) % 4 == 0;
        uint256 amount = useLp ? 30e18 + (r >> 16) % 1_000_000e18 : 50e18 + (r >> 16) % 2_000_000e18;
        ISeasonMine.Asset asset = useLp ? ISeasonMine.Asset.LP : ISeasonMine.Asset.RIG;
        vm.prank(actors[who]);
        try m.activate(asset, amount) returns (uint256 id) {
            claimedByRig.push();
            _record(
                idx,
                "activate",
                string.concat(
                    '"owner":"',
                    _actor(who),
                    '","asset":"',
                    useLp ? "LP" : "RIG",
                    '","amount":"',
                    vm.toString(amount),
                    '"'
                ),
                string.concat('"rig":', vm.toString(id)),
                "",
                m
            );
        } catch (bytes memory err) {
            _record(
                idx,
                "activate",
                string.concat(
                    '"owner":"',
                    _actor(who),
                    '","asset":"',
                    useLp ? "LP" : "RIG",
                    '","amount":"',
                    vm.toString(amount),
                    '"'
                ),
                "",
                _errName(err),
                m
            );
        }
    }

    function _claim(SeasonMine m, uint256 r, uint256 idx) internal {
        uint256 id = r % m.rigCount();
        uint8 b = uint8((r >> 8) % 4);
        address o = m.rigs(id).owner;
        vm.prank(o);
        try m.claim(id, b) returns (uint256 f) {
            claimedByRig[id][b] += f;
            _record(
                idx,
                "claim",
                string.concat(
                    '"rig":', vm.toString(id), ',"block":', vm.toString(b), ',"owner":"', _actorOf(o), '"'
                ),
                string.concat('"fragments":', vm.toString(f)),
                "",
                m
            );
        } catch (bytes memory err) {
            _record(
                idx,
                "claim",
                string.concat(
                    '"rig":', vm.toString(id), ',"block":', vm.toString(b), ',"owner":"', _actorOf(o), '"'
                ),
                "",
                _errName(err),
                m
            );
        }
    }

    function _poke(SeasonMine m, uint256 idx) internal {
        m.poke();
        _record(idx, "poke", "", "", "", m);
    }

    /// @dev One rig-scoped call. "wrongOwner" picks a random other actor and a random mutator, so the
    ///      reference's ownership checks are exercised before its phase checks.
    function _rigCall(SeasonMine m, uint256 r, uint256 idx, string memory what) internal {
        uint256 id = r % m.rigCount();
        address o = m.rigs(id).owner;
        string memory name = what;
        if (keccak256(bytes(what)) == keccak256("wrongOwner")) {
            uint256 who = (r >> 8) % 5;
            if (actors[who] == o) who = (who + 1) % 5;
            o = actors[who];
            string[5] memory ops = ["upgradeGpu", "upgradeCooling", "overclock", "exit", "withdraw"];
            name = ops[(r >> 16) % 5];
        }
        string memory args = string.concat('"rig":', vm.toString(id), ',"owner":"', _actorOf(o), '"');
        bytes4 sel = keccak256(bytes(name)) == keccak256("claimAll")
            ? m.claimAll.selector
            : keccak256(bytes(name)) == keccak256("upgradeGpu")
                ? m.upgradeGpu.selector
                : keccak256(bytes(name)) == keccak256("upgradeCooling")
                    ? m.upgradeCooling.selector
                    : keccak256(bytes(name)) == keccak256("overclock")
                        ? m.overclock.selector
                        : keccak256(bytes(name)) == keccak256("exit") ? m.exit.selector : m.withdraw.selector;
        uint256 cost;
        uint256 amount = m.rigs(id).amount;
        if (sel == m.upgradeGpu.selector && m.rigs(id).gpuTier < 5) cost = m.gpuCost(id);
        if (sel == m.upgradeCooling.selector && m.rigs(id).coolingTier < 3) cost = m.coolingCost(id);
        if (sel == m.overclock.selector) cost = m.overclockCost(id);
        vm.prank(o);
        (bool ok, bytes memory ret) = address(m).call(abi.encodeWithSelector(sel, id));
        if (!ok) return _record(idx, name, args, "", _errName(ret), m);
        string memory res;
        if (sel == m.claimAll.selector) {
            uint256[4] memory got = abi.decode(ret, (uint256[4]));
            for (uint256 b; b < 4; ++b) {
                claimedByRig[id][b] += got[b];
            }
            res = string.concat('"fragments":', _arr4(got));
        } else if (sel == m.exit.selector) {
            uint256 fee = (amount * 300) / 10_000;
            res = string.concat('"returned":"', vm.toString(amount - fee), '","fee":"', vm.toString(fee), '"');
        } else if (sel == m.withdraw.selector) {
            res = string.concat('"returned":"', vm.toString(amount), '"');
        } else {
            res = string.concat('"burned":"', vm.toString(cost), '"');
        }
        _record(idx, name, args, res, "", m);
    }

    // ── JSON ────────────────────────────────────────────────────────────────

    function _record(
        uint256 idx,
        string memory name,
        string memory args,
        string memory result,
        string memory revertName,
        SeasonMine m
    ) internal {
        if (!writeOut) return;
        string memory a = string.concat(
            '{"i":',
            vm.toString(idx),
            ',"t":',
            vm.toString(block.timestamp),
            ',"action":"',
            name,
            '","args":{',
            args,
            "}"
        );
        if (bytes(revertName).length > 0) {
            a = string.concat(a, ',"ok":false,"revert":"', revertName, '"}');
        } else {
            a = string.concat(a, ',"ok":true,"shift":', vm.toString(m.shift()));
            if (bytes(result).length > 0) a = string.concat(a, ",", result);
            a = string.concat(a, "}");
        }
        actionsJson = bytes(actionsJson).length == 0 ? a : string.concat(actionsJson, ",", a);
    }

    function _line(SeasonMine m, uint256 s) internal view returns (string memory out) {
        string memory diff = string.concat(
            "[",
            vm.toString(diffWhole[s * 4]),
            ",",
            vm.toString(diffWhole[s * 4 + 1]),
            ",",
            vm.toString(diffWhole[s * 4 + 2]),
            ",",
            vm.toString(diffWhole[s * 4 + 3]),
            "]"
        );
        out = string.concat(
            '{"season":',
            vm.toString(s),
            ',"openTime":',
            vm.toString(uint256(OPEN)),
            ',"maxDurationSeconds":',
            vm.toString(uint256(maxDur[s])),
            ',"lpWeightPerToken":"2500000000000000000","difficulty":',
            diff
        );
        out = string.concat(out, ',"actions":[', actionsJson, "]");
        string memory minted = string.concat(
            "[",
            vm.toString(m.mintedFragments(0)),
            ",",
            vm.toString(m.mintedFragments(1)),
            ",",
            vm.toString(m.mintedFragments(2)),
            ",",
            vm.toString(m.mintedFragments(3)),
            "]"
        );
        string memory fin = string.concat(
            ',"final":{"t":',
            vm.toString(block.timestamp),
            ',"shift":',
            vm.toString(m.shift()),
            ',"closeX":"',
            vm.toString(m.closeX()),
            '","totalHash":"',
            vm.toString(m.totalHash())
        );
        fin = string.concat(
            fin, '","workInShift":"', vm.toString(m.workInShift()), '","minted":', minted, ',"shiftEndX":['
        );
        uint16 sh = m.shift();
        for (uint16 k; k < sh && k < SHIFTS; ++k) {
            fin = string.concat(fin, k == 0 ? "" : ",", '"', vm.toString(m.shiftEndX(k)), '"');
        }
        fin = string.concat(fin, '],"rigs":[');
        uint256 n = m.rigCount();
        for (uint256 id; id < n; ++id) {
            fin = string.concat(fin, id == 0 ? "" : ",", _rigJson(m, id));
        }
        out = string.concat(out, fin, "]}}");
    }

    function _arr4(uint256[4] memory a) internal pure returns (string memory) {
        return string.concat(
            "[",
            vm.toString(a[0]),
            ",",
            vm.toString(a[1]),
            ",",
            vm.toString(a[2]),
            ",",
            vm.toString(a[3]),
            "]"
        );
    }

    function _rigJson(SeasonMine m, uint256 id) internal view returns (string memory out) {
        ISeasonMine.Rig memory r = m.rigs(id);
        uint256[4] memory pend;
        for (uint8 b; b < 4; ++b) {
            pend[b] = m.pending(id, b);
        }
        out = string.concat(
            '{"owner":"',
            _actorOf(r.owner),
            '","inactive":',
            r.inactive ? "true" : "false",
            ',"gpuTier":',
            vm.toString(r.gpuTier),
            ',"coolingTier":',
            vm.toString(r.coolingTier)
        );
        out = string.concat(
            out,
            ',"heat":',
            vm.toString(r.heat),
            ',"activeOc":',
            vm.toString(r.activeOc),
            ',"rigHash":"',
            vm.toString(m.rigHash(id)),
            '","pending":',
            _arr4(pend)
        );
        out = string.concat(out, ',"claimed":', _arr4(claimedByRig[id]), "}");
    }

    function _actor(uint256 i) internal pure returns (string memory) {
        return string.concat("a", vm.toString(i));
    }

    function _actorOf(address a) internal view returns (string memory) {
        for (uint256 i; i < 5; ++i) {
            if (actors[i] == a) return _actor(i);
        }
        return vm.toString(a);
    }

    function _errName(bytes memory err) internal pure returns (string memory) {
        if (err.length < 4) return "Empty";
        bytes4 sel;
        assembly {
            sel := mload(add(err, 32))
        }
        if (sel == ISeasonMine.WrongPhase.selector) return "WrongPhase";
        if (sel == ISeasonMine.NotOwner.selector) return "NotOwner";
        if (sel == ISeasonMine.RigInactive.selector) return "RigInactive";
        if (sel == ISeasonMine.BelowMinStake.selector) return "BelowMinStake";
        if (sel == ISeasonMine.LpDisabled.selector) return "LpDisabled";
        if (sel == ISeasonMine.MaxTier.selector) return "MaxTier";
        if (sel == ISeasonMine.HeatTooHigh.selector) return "HeatTooHigh";
        if (sel == ISeasonMine.MaxOverclocks.selector) return "MaxOverclocks";
        if (sel == ISeasonMine.NotFound.selector) return "NotFound";
        if (sel == ISeasonMine.AlreadyClaimed.selector) return "AlreadyClaimed";
        if (sel == ISeasonMine.PoolExhausted.selector) return "PoolExhausted";
        if (sel == ISeasonMine.PauseGraceNotElapsed.selector) return "PauseGraceNotElapsed";
        return string.concat("Other:", vm.toString(abi.encodePacked(sel)));
    }
}
