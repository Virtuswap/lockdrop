// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IvIntermediatePoolFactory {
    function admin() external view returns (address);

    function getIntermediatePool(
        address _token0,
        address _token1
    ) external view returns (address);

    function getPriceDiscoveryPool(
        address _token0,
        address _token1
    ) external view returns (address);

    function createIntermediatePool(
        address _token0,
        address _token1,
        address _uniswapOracle,
        address _priceFeed0,
        address _priceFeed1,
        uint256 _startTimestamp,
        uint256 _totalVrswAllocated
    ) external returns (address pool);

    function createPriceDiscoveryPool(
        address _token0,
        address _token1,
        uint256 _startTimestamp
    ) external returns (address pool);

    function changeAdmin(address _newAdmin) external;
}
