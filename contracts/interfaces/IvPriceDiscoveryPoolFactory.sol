// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IvPriceDiscoveryPoolFactory {
    function admin() external view returns (address);

    function getPriceDiscoveryPool(
        address _token0,
        address _token1
    ) external view returns (address);

    function createPriceDiscoveryPool(
        address _token0,
        address _token1,
        uint256 _startTimestamp,
        uint256 _totalVrswAllocated
    ) external returns (address pool);

    function changeAdmin(address _newAdmin) external;
}
