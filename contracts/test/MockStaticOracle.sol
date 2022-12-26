// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import '@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol';
import '@mean-finance/uniswap-v3-oracle/solidity/interfaces/IStaticOracle.sol';

contract MockStaticOracle is IStaticOracle {
    IUniswapV3Factory public immutable override UNISWAP_V3_FACTORY;
    uint8 public immutable override CARDINALITY_PER_MINUTE;
    uint24[] internal _knownFeeTiers;

    constructor(
        IUniswapV3Factory _UNISWAP_V3_FACTORY,
        uint8 _CARDINALITY_PER_MINUTE
    ) {
        UNISWAP_V3_FACTORY = _UNISWAP_V3_FACTORY;
        CARDINALITY_PER_MINUTE = _CARDINALITY_PER_MINUTE;

        // Assign default fee tiers
        _knownFeeTiers.push(500);
        _knownFeeTiers.push(3000);
        _knownFeeTiers.push(10000);
    }

    function supportedFeeTiers()
        external
        view
        override
        returns (uint24[] memory)
    {
        return _knownFeeTiers;
    }

    function isPairSupported(
        address _tokenA,
        address _tokenB
    ) external view override returns (bool) {
        return false;
    }

    function getAllPoolsForPair(
        address _tokenA,
        address _tokenB
    ) public view override returns (address[] memory) {}

    function quoteAllAvailablePoolsWithTimePeriod(
        uint128 _baseAmount,
        address _baseToken,
        address _quoteToken,
        uint32 _period
    )
        external
        view
        override
        returns (uint256 _quoteAmount, address[] memory _queriedPools)
    {
        uint256 r_price_ratio = 2;
        _quoteAmount = _baseAmount / r_price_ratio;
    }

    function quoteSpecificFeeTiersWithTimePeriod(
        uint128 _baseAmount,
        address _baseToken,
        address _quoteToken,
        uint24[] calldata _feeTiers,
        uint32 _period
    )
        external
        view
        override
        returns (uint256 _quoteAmount, address[] memory _queriedPools)
    {}

    function quoteSpecificPoolsWithTimePeriod(
        uint128 _baseAmount,
        address _baseToken,
        address _quoteToken,
        address[] calldata _pools,
        uint32 _period
    ) external view override returns (uint256 _quoteAmount) {}

    function prepareAllAvailablePoolsWithTimePeriod(
        address _tokenA,
        address _tokenB,
        uint32 _period
    ) external override returns (address[] memory _preparedPools) {}

    function prepareSpecificFeeTiersWithTimePeriod(
        address _tokenA,
        address _tokenB,
        uint24[] calldata _feeTiers,
        uint32 _period
    ) external override returns (address[] memory _preparedPools) {}

    function prepareSpecificPoolsWithTimePeriod(
        address[] calldata _pools,
        uint32 _period
    ) external override {}

    function prepareAllAvailablePoolsWithCardinality(
        address _tokenA,
        address _tokenB,
        uint16 _cardinality
    ) public override returns (address[] memory _preparedPools) {}

    function prepareSpecificFeeTiersWithCardinality(
        address _tokenA,
        address _tokenB,
        uint24[] calldata _feeTiers,
        uint16 _cardinality
    ) public override returns (address[] memory _preparedPools) {}

    function prepareSpecificPoolsWithCardinality(
        address[] calldata _pools,
        uint16 _cardinality
    ) public override {}

    function addNewFeeTier(uint24 _feeTier) external override {
        require(
            UNISWAP_V3_FACTORY.feeAmountTickSpacing(_feeTier) != 0,
            'Invalid fee tier'
        );
        for (uint256 i; i < _knownFeeTiers.length; i++) {
            require(_knownFeeTiers[i] != _feeTier, 'Tier already supported');
        }
        _knownFeeTiers.push(_feeTier);
    }
}
