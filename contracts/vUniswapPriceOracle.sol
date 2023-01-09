// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import '@mean-finance/uniswap-v3-oracle/solidity/interfaces/IStaticOracle.sol';
import './vPriceOracleBase.sol';

abstract contract vUniswapPriceOracle is vPriceOracleBase {
    IStaticOracle public immutable uniswapV3Oracle;
    address private immutable token0;
    address private immutable token1;

    constructor(address _token0, address _token1, address _uniswapV3Oracle) {
        token0 = _token0;
        token1 = _token1;
        uniswapV3Oracle = IStaticOracle(_uniswapV3Oracle);
        IStaticOracle(_uniswapV3Oracle).prepareAllAvailablePoolsWithTimePeriod(
            _token0,
            _token1,
            UNISWAP_ORACLE_TIME_PERIOD
        );
    }

    function getUniswapCurrentPriceRatioShifted()
        public
        view
        returns (uint256 quoteAmount)
    {
        (quoteAmount, ) = uniswapV3Oracle.quoteAllAvailablePoolsWithTimePeriod(
            uint128(1 << PRICE_RATIO_SHIFT_SIZE),
            token0,
            token1,
            UNISWAP_ORACLE_TIME_PERIOD
        );
    }
}
