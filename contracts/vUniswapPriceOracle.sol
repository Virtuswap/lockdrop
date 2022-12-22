// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import '@mean-finance/uniswap-v3-oracle/solidity/interfaces/IStaticOracle.sol';
import './interfaces/IvPriceOracle.sol';

contract vUniswapPriceOracle is IvPriceOracle {
    uint32 private constant TIME_PERIOD = 60;
    uint8 public constant PRICE_RATIO_SHIFT_SIZE = 32;

    IStaticOracle public immutable uniswapV3Oracle;
    address private immutable token0;
    address private immutable token1;

    constructor(address _token0, address _token1, address _uniswapV3Oracle) {
        token0 = _token0;
        token1 = _token1;
        uniswapV3Oracle = IStaticOracle(_uniswapV3Oracle);
    }

    function getCurrentPriceRatioShifted()
        external
        view
        override
        returns (uint256 quoteAmount)
    {
        (quoteAmount, ) = uniswapV3Oracle.quoteAllAvailablePoolsWithTimePeriod(
            PRICE_RATIO_SHIFT_SIZE,
            token0,
            token1,
            TIME_PERIOD
        );
    }
}
