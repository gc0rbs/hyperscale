// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SeasonTestBase} from "../base/SeasonTestBase.sol";

/// @dev FR-M7: whatever the mix of rigs and upgrades, a found block never mints more than its pool,
///      and pays out the whole pool minus one fragment of dust per rig.
contract ClaimCapFuzzTest is SeasonTestBase {
    function testFuzz_FR_M7_found_block_pays_pool_never_more(uint8 nRaw, uint256 seed) public {
        uint256 n = 1 + (nRaw % 6);
        address[] memory who = new address[](n);
        uint256[] memory ids = new uint256[](n);
        for (uint256 i; i < n; ++i) {
            who[i] = address(uint160(0x1000 + i));
            uint256 stake = 100e18 + (uint256(keccak256(abi.encode(seed, i))) % 20_000_000e18);
            fundPlayer(who[i], stake, 0);
            ids[i] = activateRig(who[i], stake);
            uint8 g = uint8(uint256(keccak256(abi.encode(seed, i, "g"))) % 6);
            gpu(who[i], ids[i], g);
        }
        open();
        // Some overclocking mid-block.
        for (uint256 i; i < n; ++i) {
            if (uint256(keccak256(abi.encode(seed, i, "oc"))) % 2 == 0) overclockN(who[i], ids[i], 1);
        }
        warpToBlockFound();
        uint256 total;
        for (uint256 i; i < n; ++i) {
            vm.prank(who[i]);
            total += mine.claim(ids[i], 0);
        }
        assertEq(mine.mintedFragments(0), total);
        assertLe(total, 5_000_000);
        assertGe(total, 5_000_000 - n - 1);
    }
}
