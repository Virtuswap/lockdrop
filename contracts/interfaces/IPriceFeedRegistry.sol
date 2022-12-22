// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IPriceFeedRegistry {
    function isPairSupported(
        address _token0,
        address _token1
    ) external returns (bool);

    function getPriceFeed(address _token0) external returns (address);
}
