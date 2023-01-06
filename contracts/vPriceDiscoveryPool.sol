// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/utils/math/Math.sol';
import './interfaces/IvPriceDiscoveryPool.sol';
import './interfaces/IvIntermediatePoolFactory.sol';
import './interfaces/virtuswap/IvRouter.sol';
import './interfaces/virtuswap/IvPairFactory.sol';

contract vPriceDiscoveryPool is IvPriceDiscoveryPool {
    uint256 public constant DEPOSIT_PHASE_DURATION = 5 days;

    Phase public currentPhase;

    uint256 public totalTransferred0;
    uint256 public totalTransferred1;
    uint256 public totalLpTokens;
    mapping(address => bool) public lpTokensWithdrawn;
    mapping(address => uint256) public deposits0;
    mapping(address => uint256) public deposits1;

    uint256 public immutable startTimestamp;
    address public immutable token0;
    address public immutable token1;
    address public immutable factory;
    address public immutable vsRouter;
    address public immutable vsPair;

    constructor(
        address _factory,
        address _token0,
        address _token1,
        address _vsRouter,
        uint256 _startTimestamp
    ) {
        factory = _factory;
        token0 = _token0;
        token1 = _token1;
        startTimestamp = _startTimestamp;
        currentPhase = Phase.CLOSED;
        vsRouter = _vsRouter;
        address _vsPair = address(
            IvPairFactory(IvRouter(_vsRouter).factory()).getPair(
                _token0,
                _token1
            )
        );
        require(
            _vsPair != address(0),
            "VSPair with these tokens doesn't exist"
        );
        vsPair = _vsPair;
    }

    function triggerDepositPhase() external override {
        require(block.timestamp >= startTimestamp, 'Too early');
        require(
            currentPhase == Phase.CLOSED,
            "Couldn't trigger from the current phase"
        );
        currentPhase = Phase.DEPOSIT;
    }

    function triggerTransferPhase() external override {
        require(
            block.timestamp >= startTimestamp + DEPOSIT_PHASE_DURATION,
            'Too early'
        );
        require(
            currentPhase == Phase.DEPOSIT,
            "Couldn't trigger from the current phase"
        );
        currentPhase = Phase.TRANSFER;
    }

    function deposit(address _token, uint256 _amount) external override {
        require(
            currentPhase == Phase.DEPOSIT,
            'Unable to deposit during current phase'
        );
        require(_token == token0 || _token == token1, 'Invalid token');
        require(_amount > 0, 'Insufficient amount');

        _token == token0
            ? deposits0[msg.sender] += _amount
            : deposits1[msg.sender] += _amount;

        SafeERC20.safeTransferFrom(
            IERC20(_token),
            msg.sender,
            address(this),
            _amount
        );
    }

    function transferToRealPool() external override {
        require(
            currentPhase == Phase.TRANSFER,
            'Unable to transfer during current phase'
        );

        totalTransferred0 = IERC20(token0).balanceOf(address(this));
        totalTransferred1 = IERC20(token1).balanceOf(address(this));
        IERC20(token0).approve(vsRouter, totalTransferred0);
        IERC20(token1).approve(vsRouter, totalTransferred1);
        IvRouter(vsRouter).addLiquidity(
            token0,
            token1,
            totalTransferred0,
            totalTransferred1,
            totalTransferred0,
            totalTransferred1,
            address(this),
            block.timestamp + 1 minutes
        );
        totalLpTokens = IERC20(vsPair).balanceOf(address(this));
        currentPhase = Phase.WITHDRAW;
    }

    function withdrawLpTokens(address _to) external override {
        require(
            currentPhase == Phase.WITHDRAW,
            'Unable to withdraw during current phase'
        );
        uint256 lpTokensAmount = lpTokensWithdrawn[_to]
            ? 0
            : _calculateLpTokens(_to);
        lpTokensWithdrawn[_to] = true;
        if (lpTokensAmount > 0) {
            SafeERC20.safeTransfer(IERC20(vsPair), msg.sender, lpTokensAmount);
        }
    }

    function viewLpTokens(
        address _who
    ) external view override returns (uint256) {
        require(
            currentPhase == Phase.WITHDRAW,
            'Unable to view leftovers during current phase'
        );
        return _calculateLpTokens(_who);
    }

    function emergencyStop() external override {
        require(
            msg.sender == IvIntermediatePoolFactory(factory).admin(),
            'Admin only'
        );
        currentPhase = Phase.STOPPED;
    }

    function emergencyResume(Phase phase) external override {
        require(
            msg.sender == IvIntermediatePoolFactory(factory).admin(),
            'Admin only'
        );
        require(currentPhase == Phase.STOPPED, 'The contract is not stopped');
        currentPhase = phase;
    }

    function emergencyRescueFunds() external override {
        require(
            msg.sender == IvIntermediatePoolFactory(factory).admin(),
            'Admin only'
        );
        require(currentPhase == Phase.STOPPED, 'The contract is not stopped');
        SafeERC20.safeTransfer(
            IERC20(token0),
            msg.sender,
            IERC20(token0).balanceOf(address(this))
        );
        SafeERC20.safeTransfer(
            IERC20(token1),
            msg.sender,
            IERC20(token1).balanceOf(address(this))
        );
        SafeERC20.safeTransfer(
            IERC20(vsPair),
            msg.sender,
            IERC20(vsPair).balanceOf(address(this))
        );
    }

    function _calculateLpTokens(
        address _who
    ) private view returns (uint256 lpTokensAmount) {
        uint256 _totalTransferred0 = totalTransferred0;
        uint256 _totalTransferred1 = totalTransferred1;
        lpTokensAmount =
            ((deposits0[_who] *
                _totalTransferred1 +
                deposits1[_who] *
                _totalTransferred0) * totalLpTokens) /
            (2 * _totalTransferred0 * _totalTransferred1);
    }
}
