// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import '@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol';
import './vPriceOracleBase.sol';

abstract contract vChainlinkPriceOracle is vPriceOracleBase {
    AggregatorV3Interface public immutable priceFeed0;
    AggregatorV3Interface public immutable priceFeed1;

    constructor(address _priceFeed0, address _priceFeed1) {
        priceFeed0 = AggregatorV3Interface(_priceFeed0);
        priceFeed1 = AggregatorV3Interface(_priceFeed1);
    }

    function getChainlinkCurrentPriceRatioShifted()
        public
        view
        returns (uint256)
    {
        return
            (uint256(getLatestPrice(priceFeed1)) << PRICE_RATIO_SHIFT_SIZE) /
            uint256(getLatestPrice(priceFeed0));
    }

    function getLatestPrice(
        AggregatorV3Interface priceFeed
    ) public view returns (int price) {
        (, price, , , ) = priceFeed.latestRoundData();
        return price;
    }
}
