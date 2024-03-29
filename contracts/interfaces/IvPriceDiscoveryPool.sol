// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IvPriceDiscoveryPool {
    enum Phase {
        CLOSED,
        DEPOSIT,
        TRANSFER,
        WITHDRAW,
        STOPPED
    }

    function triggerDepositPhase() external;

    function triggerTransferPhase() external;

    function deposit(address _token, uint256 _amount) external;

    function withdrawWithPenalty(
        address _token,
        uint256 _amount,
        uint256 _depositDay
    ) external;

    function transferToRealPool() external;

    function withdrawLpTokens(address _to) external;

    function viewLpTokens(address _who) external view returns (uint256);

    function viewRewards(address _who) external view returns (uint256);

    function claimRewards(address _who) external;

    function emergencyStop() external;

    function emergencyResume(Phase phase) external;

    function emergencyRescueFunds() external;
}
