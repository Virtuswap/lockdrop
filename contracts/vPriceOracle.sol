// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import '@mean-finance/uniswap-v3-oracle/solidity/interfaces/IStaticOracle.sol';
import './interfaces/IvPriceOracle.sol';
import './interfaces/IPriceFeedRegistry.sol';
import './vUniswapPriceOracle.sol';
import './vChainlinkPriceOracle.sol';

abstract contract vPriceOracle is IvPriceOracle {
    uint8 public constant PRICE_RATIO_SHIFT_SIZE = 32;

    IvPriceOracle public currentOracle;

    constructor(
        address _token0,
        address _token1,
        address _uniswapOracle,
        address _priceFeedRegistry
    ) {
        if (IStaticOracle(_uniswapOracle).isPairSupported(_token0, _token1)) {
            currentOracle = IvPriceOracle(
                new vUniswapPriceOracle(_token0, _token1, _uniswapOracle)
            );
        } else if (
            IPriceFeedRegistry(_priceFeedRegistry).isPairSupported(
                _token0,
                _token1
            )
        ) {
            currentOracle = IvPriceOracle(
                new vChainlinkPriceOracle(
                    IPriceFeedRegistry(_priceFeedRegistry).getPriceFeed(
                        _token0
                    ),
                    IPriceFeedRegistry(_priceFeedRegistry).getPriceFeed(_token1)
                )
            );
        } else {
            revert('No oracle is available for the tokens');
        }
        assert(address(currentOracle) != address(0));
    }

    function getCurrentPriceRatioShifted()
        public
        view
        override
        returns (uint256)
    {
        return currentOracle.getCurrentPriceRatioShifted();
    }
}
