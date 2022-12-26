// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import '@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol';

contract MockUniswapV3Factory is IUniswapV3Factory {
    constructor() {}

    modifier noDelegateCall() {
        _;
    }

    function createPool(
        address tokenA,
        address tokenB,
        uint24 fee
    ) external override noDelegateCall returns (address pool) {}

    function setOwner(address _owner) external override {}

    function enableFeeAmount(uint24 fee, int24 tickSpacing) external override {}

    function feeAmountTickSpacing(
        uint24 fee
    ) external view override returns (int24) {}

    function owner() external view override returns (address) {}

    function getPool(
        address tokenA,
        address tokenB,
        uint24 fee
    ) external view override returns (address pool) {}
}
