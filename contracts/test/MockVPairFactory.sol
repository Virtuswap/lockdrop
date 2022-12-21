// SPDX-License-Identifier: Apache-2.0

pragma solidity 0.8.2;

import './MockVPair.sol';
import '../interfaces/virtuswap/IvPairFactory.sol';

contract MockVPairFactory is IvPairFactory {
    function createPair(
        address tokenA,
        address tokenB
    ) external override returns (address) {
        if (pairs[tokenA][tokenB] == address(0x0)) {
            pairs[tokenA][tokenB] = address(new MockVPair());
            pairs[tokenB][tokenA] = pairs[tokenA][tokenB];
        }
    }

    function admin() external view override returns (address) {}

    function changeAdmin(address newAdmin) external override {}

    function exchangeReserves() external view override returns (address) {}

    function setExchangeReservesAddress(
        address _exchangeReserves
    ) external override {}

    mapping(address => mapping(address => address)) public pairs;

    function getPair(
        address tokenA,
        address tokenB
    ) external view override returns (address) {
        return pairs[tokenA][tokenB];
    }
}
