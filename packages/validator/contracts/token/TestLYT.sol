// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.2;

import "loyalty-tokens/contracts/BIP20/BIP20DelegatedTransfer.sol";

contract TestLYT is BIP20DelegatedTransfer {
    /*
     * Public functions
     */
    constructor(
        address owner_,
        address feeAccount_
    ) BIP20DelegatedTransfer("Loyalty Coin", "LYT", owner_, feeAccount_) {
        _mint(owner_, 1e10 * 1e18);
    }

    function multiTransfer(address[] calldata to, uint256 amount) public returns (bool) {
        for (uint256 idx = 0; idx < to.length; idx++) {
            _transfer(msg.sender, to[idx], amount);
        }
        return true;
    }
}
