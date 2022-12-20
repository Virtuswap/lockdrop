// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IvIntermediatePool {
    function triggerDepositPhase() external;

    function triggerTransferPhase() external;

    function deposit(
        uint256 _amount0,
        uint256 _amount1,
        uint8 _locking_period
    ) external;

    function transferToRealPool(uint256 _transfersNumber) external;

    function withdraw() external;
}
