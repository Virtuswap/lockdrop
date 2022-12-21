// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import './vIntermediatePool.sol';
import './interfaces/IvIntermediatePoolFactory.sol';
import './interfaces/virtuswap/IvPairFactory.sol';

contract vIntermediatePoolFactory is IvIntermediatePoolFactory {
    mapping(address => mapping(address => address)) public pools;
    address[] public allPools;

    address public admin;

    address public immutable vsRouter;
    address public immutable vsPairFactory;

    modifier onlyAdmin() {
        require(msg.sender == admin, 'OA');
        _;
    }

    constructor(address _vsRouter, address _vsPairFactory) {
        vsRouter = _vsRouter;
        vsPairFactory = _vsPairFactory;
        admin = msg.sender;
    }

    function getPool(
        address _token0,
        address _token1
    ) external view override returns (address) {
        return pools[_token0][_token1];
    }

    function createPool(
        address _token0,
        address _token1,
        address _priceFeed0,
        address _priceFeed1,
        uint256 _startTimestamp
    ) external override returns (address pool) {
        require(_token0 != _token1, 'Identical addresses');
        require(_token0 != address(0), 'Zero address');
        require(pools[_token0][_token1] == address(0), 'Pool exists');

        pool = address(
            new vIntermediatePool(
                address(this),
                _token0,
                _token1,
                _priceFeed0,
                _priceFeed1,
                vsRouter,
                IvPairFactory(vsPairFactory).getPair(_token0, _token1),
                _startTimestamp
            )
        );

        pools[_token0][_token1] = pool;
        pools[_token1][_token0] = pool;
        allPools.push(pool);
    }

    function changeAdmin(address _newAdmin) external override onlyAdmin {
        require(
            _newAdmin > address(0) && _newAdmin != admin,
            'Invalid new admin address'
        );

        admin = _newAdmin;
    }
}
