// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Predicts the address of the next contract created with CREATE by `deployer` at `nonce`.
/// @dev keccak256(rlp([deployer, nonce]))[12:]. Nonces up to 2^32-1 supported (a deployer never
///      gets near that). Needed because the season contracts reference each other in constructors.
library CreateAddress {
    function predict(address deployer, uint64 nonce) internal pure returns (address) {
        bytes memory rlp;
        if (nonce == 0) {
            rlp = abi.encodePacked(bytes1(0xd6), bytes1(0x94), deployer, bytes1(0x80));
        } else if (nonce <= 0x7f) {
            rlp = abi.encodePacked(bytes1(0xd6), bytes1(0x94), deployer, uint8(nonce));
        } else if (nonce <= 0xff) {
            rlp = abi.encodePacked(bytes1(0xd7), bytes1(0x94), deployer, bytes1(0x81), uint8(nonce));
        } else if (nonce <= 0xffff) {
            rlp = abi.encodePacked(bytes1(0xd8), bytes1(0x94), deployer, bytes1(0x82), uint16(nonce));
        } else if (nonce <= 0xffffff) {
            rlp = abi.encodePacked(bytes1(0xd9), bytes1(0x94), deployer, bytes1(0x83), uint24(nonce));
        } else {
            rlp = abi.encodePacked(bytes1(0xda), bytes1(0x94), deployer, bytes1(0x84), uint32(nonce));
        }
        return address(uint160(uint256(keccak256(rlp))));
    }
}
