// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IvPriceOracle {
    function getCurrentPriceRatioShifted() external view returns (uint256);
}
