// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IvIntermediatePool {
    struct AmountPair {
        uint256 amount0;
        uint256 amount1;
    }

    enum Phase {
        CLOSED,
        DEPOSIT,
        TRANSFER,
        WITHDRAW,
        STOPPED
    }

    function triggerDepositPhase() external;

    function triggerTransferPhase() external;

    function deposit(
        uint256 _amount0,
        uint256 _amount1,
        uint256 _lockingPeriodIndex
    ) external;

    function withdrawWithPenalty(
        uint256 _lockingPeriodIndex,
        uint256 _depositDay
    ) external;

    function transferToRealPool(uint256 _transfersNumber) external;

    function claimLeftovers(address _to) external;

    function withdrawLpTokens(
        address _to,
        uint256 _lockingPeriodIndex
    ) external;

    function viewLeftovers(
        address _who
    ) external view returns (AmountPair memory amounts);

    function viewLpTokens(
        address _who
    ) external view returns (uint256[4] memory amounts);

    function viewVrswTokens(address _who) external view returns (uint256);

    function emergencyStop() external;

    function emergencyResume(Phase phase) external;

    function emergencyRescueFunds() external;
}
