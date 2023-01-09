// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

abstract contract vPriceOracleBase {
    uint8 public constant PRICE_RATIO_SHIFT_SIZE = 32;
    uint32 public constant UNISWAP_ORACLE_TIME_PERIOD = 3600;
}
