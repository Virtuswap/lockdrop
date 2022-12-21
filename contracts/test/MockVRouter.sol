// SPDX-License-Identifier: Apache-2.0

pragma solidity 0.8.2;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';

import '../interfaces/virtuswap/IvRouter.sol';
import '../interfaces/virtuswap/IvPairFactory.sol';
import '../interfaces/virtuswap/IvPair.sol';

contract MockVRouter is IvRouter {
    address public override factory;
    address public immutable override WETH9;

    modifier notAfter(uint256 deadline) {
        require(deadline >= block.timestamp, 'VSWAP:EXPIRED');
        _;
    }

    function vFlashSwapCallback(
        address tokenIn,
        address tokenOut,
        uint256 requiredBackAmount,
        bytes calldata data
    ) external override {}

    function changeFactory(address _factory) external override {}

    function swapExactOutput(
        address tokenIn,
        address tokenOut,
        uint256 amountOut,
        uint256 maxAmountIn,
        address to,
        uint256 deadline
    ) external payable override {}

    function swapExactInput(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        address to,
        uint256 deadline
    ) external payable override {}

    function swapReserveExactOutput(
        address tokenOut,
        address commonToken,
        address ikPair,
        uint256 amountOut,
        uint256 maxAmountIn,
        address to,
        uint256 deadline
    ) external payable override {}

    function swapReserveExactInput(
        address tokenOut,
        address commonToken,
        address ikPair,
        uint256 amountIn,
        uint256 minAmountOut,
        address to,
        uint256 deadline
    ) external payable override {}

    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external override returns (uint256 amountA, uint256 amountB) {}

    function getAmountOut(
        address tokenA,
        address tokenB,
        uint256 amountIn
    ) external view override returns (uint256 amountOut) {}

    function getAmountIn(
        address tokenA,
        address tokenB,
        uint256 amountOut
    ) external view override returns (uint256 amountIn) {}

    function quote(
        address inputToken,
        address outputToken,
        uint256 amountIn
    ) external view override returns (uint256 amountOut) {}

    function getVirtualAmountIn(
        address jkPair,
        address ikPair,
        uint256 amountOut
    ) external view override returns (uint256 amountIn) {}

    function getVirtualAmountOut(
        address jkPair,
        address ikPair,
        uint256 amountIn
    ) external view override returns (uint256 amountOut) {}

    function getVirtualPool(
        address jkPair,
        address ikPair
    ) external view override returns (VirtualPoolModel memory vPool) {}

    constructor(address _factory, address _WETH9) {
        WETH9 = _WETH9;
        factory = _factory;
    }

    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    )
        external
        override
        notAfter(deadline)
        returns (uint256, uint256, address, uint256)
    {
        address pairAddress = IvPairFactory(factory).getPair(tokenA, tokenB);
        SafeERC20.safeTransferFrom(
            IERC20(tokenA),
            msg.sender,
            pairAddress,
            amountADesired
        );
        SafeERC20.safeTransferFrom(
            IERC20(tokenB),
            msg.sender,
            pairAddress,
            amountBDesired
        );

        IvPair(pairAddress).mint(to);
    }
}
