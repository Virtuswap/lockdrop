// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import './vPriceDiscoveryPool.sol';
import './interfaces/IvPriceDiscoveryPoolFactory.sol';
import './interfaces/virtuswap/IvPairFactory.sol';

contract vPriceDiscoveryPoolFactory is IvPriceDiscoveryPoolFactory {
    mapping(address => address) public priceDiscoveryPools;
    address[] public allPriceDiscoveryPools;

    address public override admin;

    address public immutable vsRouter;
    address public immutable vrswToken;

    modifier onlyAdmin() {
        require(msg.sender == admin, 'OA');
        _;
    }

    constructor(address _vsRouter, address _vrswToken) {
        vsRouter = _vsRouter;
        vrswToken = _vrswToken;
        admin = msg.sender;
    }

    function getPriceDiscoveryPool(
        address _opponentToken
    ) external view override returns (address) {
        return priceDiscoveryPools[_opponentToken];
    }

    function createPriceDiscoveryPool(
        address _opponentToken,
        uint256 _startTimestamp,
        uint256 _totalVrswAllocated
    ) external override returns (address pool) {
        require(_opponentToken != vrswToken, 'Identical addresses');
        require(_opponentToken != address(0), 'Zero address');
        require(
            priceDiscoveryPools[_opponentToken] == address(0),
            'Pool exists'
        );

        pool = address(
            new vPriceDiscoveryPool(
                address(this),
                vrswToken,
                _opponentToken,
                vsRouter,
                _startTimestamp,
                _totalVrswAllocated
            )
        );

        priceDiscoveryPools[_opponentToken] = pool;
        priceDiscoveryPools[_opponentToken] = pool;
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
