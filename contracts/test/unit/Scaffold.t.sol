// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ISeasonMine} from "../../src/interfaces/ISeasonMine.sol";

/// @dev Phase 0 smoke test: the toolchain compiles the spec interfaces and forge-std works.
contract ScaffoldTest is Test {
    function test_interfacesCompile() public pure {
        // Referencing the interface's enum proves it compiled and is importable.
        assertEq(uint8(ISeasonMine.Phase.Open), 2);
        assertEq(uint8(ISeasonMine.Asset.LP), 1);
    }

    function test_paramsFileParses() public view {
        string memory json = vm.readFile("../specs/params/season-default.json");
        assertEq(vm.parseJsonUint(json, ".blocks"), 4);
        assertEq(vm.parseJsonUint(json, ".shiftsPerBlock"), 8);
        assertEq(vm.parseJsonUint(json, ".fragPerToken"), 1_000_000);
    }
}
