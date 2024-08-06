// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity ^0.8.2;

interface IBridge {
    event BridgeDeposited(bytes32 tokenId, bytes32 depositId, address account, uint256 amount, uint256 balance);
    event BridgeWithdrawn(bytes32 tokenId, bytes32 withdrawId, address account, uint256 amount, uint256 balance);

    struct DepositData {
        bytes32 tokenId;
        address account;
        uint256 amount;
    }

    struct WithdrawData {
        bytes32 tokenId;
        address account;
        uint256 amount;
        bool executed;
    }

    function isAvailableDepositId(bytes32 _depositId) external view returns (bool);

    function isAvailableWithdrawId(bytes32 _withdrawId) external view returns (bool);

    function depositToBridge(
        bytes32 _tokenId,
        bytes32 _depositId,
        address _account,
        uint256 _amount,
        uint256 _expiry,
        bytes calldata _signature
    ) external payable;

    function withdrawFromBridge(bytes32 _tokenId, bytes32 _withdrawId, address _account, uint256 _amount) external;

    function executeWithdraw(bytes32 _withdrawId) external;

    function isConfirmed(bytes32 _withdrawId) external view returns (bool);

    function isConfirmedOf(bytes32 _withdrawId, address validator) external view returns (bool);

    function getDepositInfo(bytes32 _depositId) external view returns (DepositData memory);

    function getWithdrawInfo(bytes32 _withdrawId) external view returns (WithdrawData memory);

    function getProtocolFee(bytes32 _tokenId) external view returns (uint256);

    function changeProtocolFee(bytes32 _tokenId, uint256 _fee) external;

    function getTotalLiquidity(bytes32 _tokenId) external view returns (uint256);
}
