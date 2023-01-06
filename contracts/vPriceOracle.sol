// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import '@mean-finance/uniswap-v3-oracle/solidity/interfaces/IStaticOracle.sol';
import './vUniswapPriceOracle.sol';
import './vChainlinkPriceOracle.sol';

abstract contract vPriceOracle is vChainlinkPriceOracle, vUniswapPriceOracle {
    bool public isUniswapOracle;

    constructor(
        address _token0,
        address _token1,
        address _uniswapOracle,
        address _priceFeed0,
        address _priceFeed1
    )
        vUniswapPriceOracle(_token0, _token1, _uniswapOracle)
        vChainlinkPriceOracle(_priceFeed0, _priceFeed1)
    {
        if (IStaticOracle(_uniswapOracle).isPairSupported(_token0, _token1)) {
            isUniswapOracle = true;
        } else if (_priceFeed0 != address(0) && _priceFeed1 != address(0)) {
            isUniswapOracle = false;
        } else {
            revert('No oracle is available');
        }
    }

    function getCurrentPriceRatioShifted() public view returns (uint256) {
        return
            isUniswapOracle
                ? getUniswapCurrentPriceRatioShifted()
                : getChainlinkCurrentPriceRatioShifted();
    }
}
