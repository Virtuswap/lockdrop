// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IvIntermediatePool {
    struct AmountPair {
        uint256 amount0;
        uint256 amount1;
    }

    function triggerDepositPhase() external;

    function triggerTransferPhase() external;

    function deposit(
        uint256 _amount0,
        uint256 _amount1,
        uint8 _locking_period
    ) external;

    function transferToRealPool(uint256 _transfersNumber) external;

    function claimLeftovers(address _to) external;

    function withdrawLpTokens(address _to) external;

    function viewLeftovers(
        address _who
    )
        external
        view
        returns (AmountPair[3] memory amounts, uint8[3] memory locking_weeks);

    function viewLpTokens(
        address _who
    )
        external
        view
        returns (uint256[3] memory amount, uint8[3] memory locking_weeks);

    function viewVrswTokens(address _who) external view returns (uint256);
}
