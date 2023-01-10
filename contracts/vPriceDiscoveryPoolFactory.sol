// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import './vPriceDiscoveryPool.sol';
import './interfaces/IvPriceDiscoveryPoolFactory.sol';
import './interfaces/virtuswap/IvPairFactory.sol';

contract vPriceDiscoveryPoolFactory is IvPriceDiscoveryPoolFactory {
    mapping(address => mapping(address => address)) public priceDiscoveryPools;
    address[] public allPriceDiscoveryPools;

    address public override admin;

    address public immutable vsRouter;

    modifier onlyAdmin() {
        require(msg.sender == admin, 'OA');
        _;
    }

    constructor(address _vsRouter) {
        vsRouter = _vsRouter;
        admin = msg.sender;
    }

    function getPriceDiscoveryPool(
        address _token0,
        address _token1
    ) external view override returns (address) {
        return priceDiscoveryPools[_token0][_token1];
    }

    function createPriceDiscoveryPool(
        address _token0,
        address _token1,
        uint256 _startTimestamp
    ) external override returns (address pool) {
        require(_token0 != _token1, 'Identical addresses');
        require(_token0 != address(0), 'Zero address');
        require(
            priceDiscoveryPools[_token0][_token1] == address(0),
            'Pool exists'
        );

        pool = address(
            new vPriceDiscoveryPool(
                address(this),
                _token0,
                _token1,
                vsRouter,
                _startTimestamp
            )
        );

        priceDiscoveryPools[_token0][_token1] = pool;
        priceDiscoveryPools[_token1][_token0] = pool;
        allPriceDiscoveryPools.push(pool);
    }

    function changeAdmin(address _newAdmin) external override onlyAdmin {
        require(
            _newAdmin > address(0) && _newAdmin != admin,
            'Invalid new admin address'
        );

        admin = _newAdmin;
    }
}
