// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import './interfaces/IvPriceDiscoveryPool.sol';
import './interfaces/IvPriceDiscoveryPoolFactory.sol';
import './interfaces/virtuswap/IvRouter.sol';
import './interfaces/virtuswap/IvPairFactory.sol';

contract vPriceDiscoveryPool is IvPriceDiscoveryPool {
    uint256 public constant DEPOSIT_PHASE_DAYS_NUMBER = 7;
    uint256 public constant VRSW_DEPOSIT_DURATION = 5 days;
    uint256 public constant LP_TOKENS_LOCKING_PERIOD = 12 weeks;
    uint256 public constant OPPONENT_DEPOSIT_WEIGHT = 70;
    uint256 public constant VRSW_DEPOSIT_WEIGHT = 100 - OPPONENT_DEPOSIT_WEIGHT;

    Phase public currentPhase;

    uint256 public totalVrswTransferred;
    uint256 public totalOpponentTransferred;
    uint256 public totalVrswDepositWithBonusX1000;
    uint256 public totalOpponentDepositWithBonusX1000;
    uint256 public totalLpTokens;
    uint256 public penalties;
    mapping(address => uint256) public lpTokensWithdrawn;
    mapping(address => bool) public rewardsWithdrawn;
    mapping(address => mapping(uint256 => uint256)) public vrswDeposits;
    mapping(address => mapping(uint256 => uint256)) public opponentDeposits;

    uint256 public immutable startTimestamp;
    address public immutable vrswToken;
    uint256 public immutable totalVrswAllocated;
    address public immutable opponentToken;
    address public immutable factory;
    address public immutable vsRouter;
    address public immutable vsPair;

    constructor(
        address _factory,
        address _vrswToken,
        address _opponentToken,
        address _vsRouter,
        uint256 _startTimestamp,
        uint256 _totalVrswAllocated
    ) {
        factory = _factory;
        vrswToken = _vrswToken;
        totalVrswAllocated = _totalVrswAllocated;
        opponentToken = _opponentToken;
        startTimestamp = _startTimestamp;
        currentPhase = Phase.CLOSED;
        vsRouter = _vsRouter;
        address _vsPair = address(
            IvPairFactory(IvRouter(_vsRouter).factory()).getPair(
                _vrswToken,
                _opponentToken
            )
        );
        require(_vsPair != address(0), 'VSPair not found');
        vsPair = _vsPair;
    }

    function triggerDepositPhase() external override {
        require(block.timestamp >= startTimestamp, 'Too early');
        require(currentPhase == Phase.CLOSED, 'Wrong phase');
        currentPhase = Phase.DEPOSIT;
    }

    function triggerTransferPhase() external override {
        require(
            block.timestamp >=
                startTimestamp + DEPOSIT_PHASE_DAYS_NUMBER * 1 days,
            'Too early'
        );
        require(currentPhase == Phase.DEPOSIT, 'Wrong phase');
        currentPhase = Phase.TRANSFER;
    }

    function deposit(address _token, uint256 _amount) external override {
        require(_amount > 0, 'Insufficient amount');
        uint256 currentDay = (block.timestamp - startTimestamp) / 1 days;
        if (_token == vrswToken) {
            require(
                block.timestamp < startTimestamp + VRSW_DEPOSIT_DURATION,
                'VRSW deposits closed'
            );
            vrswDeposits[msg.sender][currentDay] += _amount;
            totalVrswDepositWithBonusX1000 +=
                _amount *
                _calculateBonusX1000(currentDay);
        } else {
            require(_token == opponentToken, 'Invalid token');
            require(
                block.timestamp <
                    startTimestamp + DEPOSIT_PHASE_DAYS_NUMBER * 1 days,
                'Deposits closed'
            );
            opponentDeposits[msg.sender][currentDay] += _amount;
            totalOpponentDepositWithBonusX1000 +=
                _amount *
                _calculateBonusX1000(currentDay);
        }

        SafeERC20.safeTransferFrom(
            IERC20(_token),
            msg.sender,
            address(this),
            _amount
        );
    }

    function withdrawWithPenalty(
        address _token,
        uint256 _amount,
        uint256 _depositDay
    ) external override {
        require(
            _token == vrswToken || _token == opponentToken,
            'Invalid token'
        );
        require(_amount > 0, 'Insufficient amount');
        require(
            block.timestamp <
                startTimestamp + DEPOSIT_PHASE_DAYS_NUMBER * 1 days,
            'Deposits closed'
        );

        uint256 penalty = _calculatePenalty(_token, _amount);
        uint256 amountOut = _amount - penalty;

        _token == vrswToken
            ? vrswDeposits[msg.sender][_depositDay] -= _amount
            : opponentDeposits[msg.sender][_depositDay] -= _amount;
        penalties += penalty;

        if (amountOut > 0) {
            SafeERC20.safeTransfer(IERC20(_token), msg.sender, amountOut);
        }
    }

    function transferToRealPool() external override {
        require(currentPhase == Phase.TRANSFER, 'Wrong phase');

        totalVrswTransferred = IERC20(vrswToken).balanceOf(address(this));
        totalOpponentTransferred = IERC20(opponentToken).balanceOf(
            address(this)
        );
        IERC20(vrswToken).approve(vsRouter, totalVrswTransferred);
        IERC20(opponentToken).approve(vsRouter, totalOpponentTransferred);
        IvRouter(vsRouter).addLiquidity(
            vrswToken,
            opponentToken,
            totalVrswTransferred,
            totalOpponentTransferred,
            totalVrswTransferred,
            totalOpponentTransferred,
            address(this),
            block.timestamp + 1 minutes
        );
        totalLpTokens = IERC20(vsPair).balanceOf(address(this));
        currentPhase = Phase.WITHDRAW;
    }

    function withdrawLpTokens(address _to) external override {
        require(currentPhase == Phase.WITHDRAW, 'Wrong phase');
        uint256 lpForAddress = _calculateLpTokens(_to);
        require(lpTokensWithdrawn[_to] < lpForAddress, 'Already withdrawn');
        uint256 lpAmount = lpForAddress;
        if (block.timestamp < startTimestamp + LP_TOKENS_LOCKING_PERIOD) {
            lpAmount *= block.timestamp - startTimestamp;
            lpAmount /= LP_TOKENS_LOCKING_PERIOD;
        }
        lpAmount -= lpTokensWithdrawn[_to];
        lpTokensWithdrawn[_to] += lpAmount;
        assert(lpTokensWithdrawn[_to] <= lpForAddress);
        if (lpAmount > 0) {
            SafeERC20.safeTransfer(IERC20(vsPair), _to, lpAmount);
        }
    }

    function viewLpTokens(
        address _who
    ) external view override returns (uint256) {
        require(currentPhase == Phase.WITHDRAW, 'Wrong phase');
        return _calculateLpTokens(_who) - lpTokensWithdrawn[_who];
    }

    function viewRewards(
        address _who
    ) external view override returns (uint256) {
        require(currentPhase == Phase.WITHDRAW, 'Wrong phase');
        return rewardsWithdrawn[_who] ? 0 : _calculateRewards(_who);
    }

    function claimRewards(address _who) external override {
        require(currentPhase == Phase.WITHDRAW, 'Wrong phase');
        uint256 rewardsAmount = rewardsWithdrawn[_who]
            ? 0
            : _calculateRewards(_who);
        if (rewardsAmount > 0) {
            SafeERC20.safeTransfer(IERC20(vrswToken), _who, rewardsAmount);
        }
    }

    function emergencyStop() external override {
        require(
            msg.sender == IvPriceDiscoveryPoolFactory(factory).admin(),
            'Admin only'
        );
        currentPhase = Phase.STOPPED;
    }

    function emergencyResume(Phase phase) external override {
        require(
            msg.sender == IvPriceDiscoveryPoolFactory(factory).admin(),
            'Admin only'
        );
        require(currentPhase == Phase.STOPPED, 'The contract is not stopped');
        currentPhase = phase;
    }

    function emergencyRescueFunds() external override {
        require(
            msg.sender == IvPriceDiscoveryPoolFactory(factory).admin(),
            'Admin only'
        );
        require(currentPhase == Phase.STOPPED, 'The contract is not stopped');
        SafeERC20.safeTransfer(
            IERC20(vrswToken),
            msg.sender,
            IERC20(vrswToken).balanceOf(address(this))
        );
        SafeERC20.safeTransfer(
            IERC20(opponentToken),
            msg.sender,
            IERC20(opponentToken).balanceOf(address(this))
        );
        SafeERC20.safeTransfer(
            IERC20(vsPair),
            msg.sender,
            IERC20(vsPair).balanceOf(address(this))
        );
    }

    function _calculateRewards(
        address _who
    ) private view returns (uint256 rewardsAmount) {
        uint256 vrswDepositWithBonusX1000;
        uint256 opponentDepositWithBonusX1000;
        for (uint256 day = 0; day < DEPOSIT_PHASE_DAYS_NUMBER; ++day) {
            vrswDepositWithBonusX1000 +=
                vrswDeposits[_who][day] *
                _calculateBonusX1000(day);
            opponentDepositWithBonusX1000 +=
                opponentDeposits[_who][day] *
                _calculateBonusX1000(day);
        }
        return
            ((VRSW_DEPOSIT_WEIGHT *
                vrswDepositWithBonusX1000 *
                totalOpponentDepositWithBonusX1000 +
                OPPONENT_DEPOSIT_WEIGHT *
                opponentDepositWithBonusX1000 *
                totalVrswDepositWithBonusX1000) * totalVrswAllocated) /
            (totalOpponentDepositWithBonusX1000 *
                totalVrswDepositWithBonusX1000);
    }

    function _calculateLpTokens(
        address _who
    ) private view returns (uint256 lpTokensAmount) {
        uint256 _totalTransferred0 = totalVrswTransferred;
        uint256 _totalTransferred1 = totalOpponentTransferred;
        uint256 _vrswDeposited;
        uint256 _opponentDeposited;
        for (uint256 day = 0; day < DEPOSIT_PHASE_DAYS_NUMBER; ++day) {
            _vrswDeposited += vrswDeposits[_who][day];
            _opponentDeposited += opponentDeposits[_who][day];
        }
        lpTokensAmount =
            ((_vrswDeposited *
                _totalTransferred1 +
                _opponentDeposited *
                _totalTransferred0) * totalLpTokens) /
            (2 * _totalTransferred0 * _totalTransferred1);
    }

    function _calculateBonusX1000(uint256 _day) private view returns (uint256) {
        // starting from 11.2% bonus will decrease by 2.5% every day
        return 1112 - _day * 2;
    }

    function _calculatePenalty(
        address _token,
        uint256 _amount
    ) private view returns (uint256) {
        uint256 currentDay = (block.timestamp - startTimestamp) / 1 days;
        return
            _token == vrswToken
                ? _calculateVrswPenalty(_amount, currentDay)
                : _calculateOpponentPenalty(_amount, currentDay);
    }

    function _calculateVrswPenalty(
        uint256 _amount,
        uint256 _currentDay
    ) private view returns (uint256) {
        uint256 numerator;
        uint256 denominator;
        if (_currentDay < 6) {
            numerator = 0;
            denominator = 1;
        } else if (_currentDay < DEPOSIT_PHASE_DAYS_NUMBER) {
            numerator = block.timestamp - startTimestamp - 6 days;
            denominator = 1 days;
        } else {
            numerator = 1;
            denominator = 1;
        }
        return (numerator * _amount) / denominator;
    }

    function _calculateOpponentPenalty(
        uint256 _amount,
        uint256 _currentDay
    ) private view returns (uint256) {
        uint256 numerator;
        uint256 denominator;
        if (_currentDay < 4) {
            numerator = 0;
            denominator = 1;
        } else if (_currentDay < 6) {
            numerator = block.timestamp - startTimestamp - 4 days;
            denominator = 2 days;
        } else {
            numerator = 1;
            denominator = 1;
        }
        return (numerator * _amount) / denominator;
    }
}
