// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity ^0.8.2;

import "loyalty-tokens/contracts/BIP20/BIP20DelegatedTransfer.sol";

import "../interfaces/IBridge.sol";
import "../interfaces/IBridgeValidator.sol";

contract BridgeStorage {
    enum TokenStatus {
        NotRegistered,
        Registered
    }

    struct TokenInfo {
        BIP20DelegatedTransfer token;
        address tokenAddress;
        TokenStatus status;
        bool native;
        uint256 fee;
    }

    mapping(bytes32 => TokenInfo) internal tokenInfos;

    mapping(bytes32 => IBridge.DepositData) internal deposits;
    mapping(bytes32 => IBridge.WithdrawData) internal withdraws;
    mapping(bytes32 => mapping(address => bool)) internal confirmations;
    mapping(bytes32 => mapping(address => uint256)) internal liquidity;
    address internal protocolFeeAccount;

    IBridgeValidator internal validatorContract;
}
