// SPDX-License-Identifier: Apache-2.0

pragma solidity 0.8.2;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '../interfaces/virtuswap/IvPair.sol';

contract MockVPair is IvPair, ERC20 {
    constructor() ERC20('VS-Liquidity Token', 'VSLT') {}

    function fee() external view override returns (uint24) {}

    function vFee() external view override returns (uint24) {}

    function setFee(uint24 _fee, uint24 _vFee) external override {}

    function swapNative(
        uint256 amountOut,
        address tokenOut,
        address to,
        bytes calldata data
    ) external override returns (uint256 _amountIn) {}

    function swapReserveToNative(
        uint256 amountOut,
        address ikPair,
        address to,
        bytes calldata data
    ) external override returns (uint256 _amountIn) {}

    function swapNativeToReserve(
        uint256 amountOut,
        address ikPair,
        address to,
        bytes calldata data
    ) external override returns (address _token, uint256 _leftovers) {}

    function mint(address to) external override returns (uint256 liquidity) {
        _mint(to, 100);
    }

    function burn(
        address to
    ) external override returns (uint256 amount0, uint256 amount1) {}

    function setAllowList(address[] memory _allowList) external override {}

    function setMaxAllowListCount(
        uint24 _maxAllowListCount
    ) external override {}

    function calculateReserveRatio()
        external
        view
        override
        returns (uint256 rRatio)
    {}

    function setMaxReserveThreshold(uint256 threshold) external override {}

    function token0() external view override returns (address) {}

    function token1() external view override returns (address) {}

    function pairBalance0() external view override returns (uint256) {}

    function pairBalance1() external view override returns (uint256) {}

    function maxAllowListCount() external view override returns (uint24) {}

    function getBalances() external view override returns (uint256, uint256) {}

    function getLastBalances()
        external
        view
        override
        returns (
            uint256 _lastBalance0,
            uint256 _lastBalance1,
            uint256 _blockNumber
        )
    {}

    function getTokens() external view override returns (address, address) {}

    function reservesBaseValue(
        address reserveAddress
    ) external view override returns (uint256) {}

    function reserves(
        address reserveAddress
    ) external view override returns (uint256) {}
}
