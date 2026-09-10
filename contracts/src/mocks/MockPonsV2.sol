// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Models what the FeeFunder needs from `PonsV2FeeEscrow` (verified on chain 4663, 2026-09-10):
///      the curve and the hook credit ETH to a recipient; the recipient claims it; a claim with nothing
///      credited reverts.
contract MockFeeEscrow {
    error NothingToClaim();
    error TransferFailed();

    mapping(address => uint256) public balanceOf;

    function credit(address recipient) external payable {
        balanceOf[recipient] += msg.value;
    }

    function claim() external returns (uint256 amount) {
        amount = balanceOf[msg.sender];
        if (amount == 0) revert NothingToClaim();
        balanceOf[msg.sender] = 0;
        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}

/// @dev Models the fee-holding side of Pons V2 (the bonding curve's `sweepFees` and the meme hook's
///      `sweepPoolFees`): pending creator fees sit here until a sweep credits them to the creator in
///      the escrow. Only the Pons sweep operator or the creator may sweep; sweeping nothing reverts.
///      A test or the Anvil demo "accrues" fees by sending ETH with `accrue`.
contract MockPonsSweeper {
    error NotFeeSweepOperator();
    error NothingToSweep();

    MockFeeEscrow public immutable escrow;
    address public immutable operator;
    address public creator;
    uint256 public pending;

    constructor(MockFeeEscrow escrow_, address operator_, address creator_) {
        escrow = escrow_;
        operator = operator_;
        creator = creator_;
    }

    function accrue() external payable {
        pending += msg.value;
    }

    /// @dev The hook's signature; the curve's `sweepFees(uint256)` is the same shape with one bound.
    function sweepPoolFees(bytes32, uint256, uint256) external {
        _sweep();
    }

    function sweepFees(uint256) external {
        _sweep();
    }

    function _sweep() internal {
        if (msg.sender != operator && msg.sender != creator) revert NotFeeSweepOperator();
        uint256 amount = pending;
        if (amount == 0) revert NothingToSweep();
        pending = 0;
        escrow.credit{value: amount}(creator);
    }
}
