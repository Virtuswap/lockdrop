// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import './interfaces/IvIntermediatePool.sol';
import './interfaces/IvIntermediatePoolFactory.sol';
import './interfaces/virtuswap/IvRouter.sol';
import './interfaces/virtuswap/IvPairFactory.sol';
import './vPriceOracle.sol';

contract vIntermediatePool is vPriceOracle, IvIntermediatePool {
    struct LockingPeriod {
        uint128 durationWeeks;
        uint128 multiplierX10;
    }

    uint256 public constant LOCKING_PERIODS_NUMBER = 4;
    uint256 public constant DEPOSIT_PHASE_DAYS_NUMBER = 7;

    LockingPeriod[LOCKING_PERIODS_NUMBER] public availableLockingPeriods;

    Phase public currentPhase;

    AmountPair public penalties;
    uint256 public totalDeposits;
    uint256 public totalLpTokens;
    uint256 public totalTransferred0;
    uint256 public totalTransferredWithBonusX10000;
    mapping(address => mapping(uint256 => bool)) public areLpTokensWithdrawn;
    mapping(address => bool) public areLeftoversClaimed;
    mapping(address => uint256) public depositIndexes;
    mapping(uint256 => address) public indexToAddress;
    mapping(uint256 => mapping(uint256 => mapping(uint256 => AmountPair)))
        public deposits;
    mapping(uint256 => mapping(uint256 => mapping(uint256 => uint256)))
        public tokensTransferred0;

    uint256 public priceRatioShifted;

    uint256 public immutable startTimestamp;
    uint256 public immutable totalVrswAllocated;
    address public immutable token0;
    address public immutable token1;
    address public immutable vrswToken;
    address public immutable factory;
    address public immutable vsRouter;
    address public immutable vsPair;

    constructor(
        address _factory,
        address _token0,
        address _token1,
        address _vsRouter,
        address _uniswapOracle,
        address _priceFeed0,
        address _priceFeed1,
        address _vrswToken,
        uint256 _startTimestamp,
        uint256 _totalVrswAllocated
    ) vPriceOracle(_token0, _token1, _uniswapOracle, _priceFeed0, _priceFeed1) {
        factory = _factory;
        vrswToken = _vrswToken;
        totalVrswAllocated = _totalVrswAllocated;
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
        require(_vsPair != address(0), 'VSPair not found');
        vsPair = _vsPair;
        availableLockingPeriods[0] = LockingPeriod(1, 5);
        availableLockingPeriods[1] = LockingPeriod(2, 10);
        availableLockingPeriods[2] = LockingPeriod(4, 22);
        availableLockingPeriods[3] = LockingPeriod(8, 44);
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
        priceRatioShifted = getCurrentPriceRatioShifted();
    }

    function deposit(
        uint256 _amount0,
        uint256 _amount1,
        uint256 _lockingPeriodIndex
    ) external override {
        require(currentPhase == Phase.DEPOSIT, 'Wrong phase');
        require(
            _lockingPeriodIndex < LOCKING_PERIODS_NUMBER,
            'Invalid locking period'
        );
        require(
            block.timestamp <
                startTimestamp + DEPOSIT_PHASE_DAYS_NUMBER * 1 days,
            'Deposits closed'
        );

        priceRatioShifted = getCurrentPriceRatioShifted();

        AmountPair memory optimalAmounts = _calculateOptimalAmounts(
            _amount0,
            _amount1
        );

        require(
            optimalAmounts.amount0 > 0 && optimalAmounts.amount1 > 0,
            'Insufficient amounts'
        );

        uint256 currentDay = (block.timestamp - startTimestamp) / 1 days;
        uint256 index = depositIndexes[msg.sender];
        if (index != 0) {
            AmountPair memory prevDeposit = deposits[index][
                _lockingPeriodIndex
            ][currentDay];
            deposits[index][_lockingPeriodIndex][currentDay] = AmountPair(
                prevDeposit.amount0 + optimalAmounts.amount0,
                prevDeposit.amount1 + optimalAmounts.amount1
            );
        } else {
            index = ++totalDeposits;
            depositIndexes[msg.sender] = index;
            indexToAddress[index] = msg.sender;
            deposits[index][_lockingPeriodIndex][currentDay] = AmountPair(
                optimalAmounts.amount0,
                optimalAmounts.amount1
            );
        }
        SafeERC20.safeTransferFrom(
            IERC20(token0),
            msg.sender,
            address(this),
            optimalAmounts.amount0
        );
        SafeERC20.safeTransferFrom(
            IERC20(token1),
            msg.sender,
            address(this),
            optimalAmounts.amount1
        );
    }

    function withdrawWithPenalty(
        uint256 _lockingPeriodIndex,
        uint256 _depositDay
    ) external override {
        require(currentPhase == Phase.DEPOSIT, 'Wrong phase');
        require(
            _lockingPeriodIndex < LOCKING_PERIODS_NUMBER,
            'Invalid locking period'
        );
        uint256 _currentDay = (block.timestamp - startTimestamp) / 1 days;
        require(_depositDay <= _currentDay, 'Invalid deposit day');

        uint256 index = depositIndexes[msg.sender];
        AmountPair memory _deposit = deposits[index][_lockingPeriodIndex][
            _depositDay
        ];
        AmountPair memory _penalty = _calculatePenalty(_deposit, _currentDay);
        AmountPair memory _withdrawAmounts = AmountPair(
            _deposit.amount0 - _penalty.amount0,
            _deposit.amount1 - _penalty.amount1
        );

        deposits[index][_lockingPeriodIndex][_depositDay] = AmountPair(0, 0);
        penalties.amount0 += _penalty.amount0;
        penalties.amount1 += _penalty.amount1;

        if (_withdrawAmounts.amount0 > 0) {
            SafeERC20.safeTransfer(
                IERC20(token0),
                msg.sender,
                _withdrawAmounts.amount0
            );
        }
        if (_withdrawAmounts.amount1 > 0) {
            SafeERC20.safeTransfer(
                IERC20(token1),
                msg.sender,
                _withdrawAmounts.amount1
            );
        }
    }

    function transferToRealPool(uint256 _transfersNumber) external override {
        require(currentPhase == Phase.TRANSFER, 'Wrong phase');
        require(
            _transfersNumber > 0 && _transfersNumber <= totalDeposits,
            'Invalid transfers number'
        );

        uint256 lowerBound = totalDeposits - _transfersNumber;
        uint256 _totalTransferredWithBonusX10000;
        AmountPair memory optimalAmounts;
        AmountPair memory amounts;
        AmountPair memory optimalTotal;
        for (uint256 i = totalDeposits; i > lowerBound; --i) {
            for (uint256 j = 0; j < LOCKING_PERIODS_NUMBER; ++j) {
                for (uint256 k = 0; k < DEPOSIT_PHASE_DAYS_NUMBER; ++k) {
                    amounts = deposits[i][j][k];
                    optimalAmounts = _calculateOptimalAmounts(
                        amounts.amount0,
                        amounts.amount1
                    );
                    optimalTotal.amount0 += optimalAmounts.amount0;
                    optimalTotal.amount1 += optimalAmounts.amount1;

                    tokensTransferred0[i][j][k] = optimalAmounts.amount0;
                    _totalTransferredWithBonusX10000 +=
                        availableLockingPeriods[j].multiplierX10 *
                        _calculateBonusX1000(k) *
                        optimalAmounts.amount0;

                    // leftovers
                    deposits[i][j][k] = AmountPair(
                        amounts.amount0 - optimalAmounts.amount0,
                        amounts.amount1 - optimalAmounts.amount1
                    );
                }
            }
        }

        AmountPair memory toTransfer = AmountPair(
            optimalTotal.amount0 + penalties.amount0,
            optimalTotal.amount1 + penalties.amount1
        );
        IERC20(token0).approve(vsRouter, toTransfer.amount0);
        IERC20(token1).approve(vsRouter, toTransfer.amount1);
        penalties = AmountPair(0, 0);
        IvRouter(vsRouter).addLiquidity(
            token0,
            token1,
            toTransfer.amount0,
            toTransfer.amount1,
            toTransfer.amount0,
            toTransfer.amount1,
            address(this),
            block.timestamp + 1 minutes
        );
        totalTransferred0 += optimalTotal.amount0;
        totalTransferredWithBonusX10000 += _totalTransferredWithBonusX10000;
        totalDeposits -= _transfersNumber;
        if (totalDeposits == 0) {
            totalLpTokens = IERC20(vsPair).balanceOf(address(this));
            currentPhase = Phase.WITHDRAW;
        }
    }

    function claimLeftovers(address _to) external override {
        require(currentPhase == Phase.WITHDRAW, 'Wrong phase');
        require(!areLeftoversClaimed[_to], 'Already claimed');

        AmountPair memory amounts = _calculateLeftovers(_to);
        uint256 vrswAmount = _calculateVrsw(_to);

        areLeftoversClaimed[_to] = true;

        if (vrswAmount > 0) {
            SafeERC20.safeTransfer(IERC20(vrswToken), _to, vrswAmount);
        }
        if (amounts.amount0 > 0) {
            SafeERC20.safeTransfer(IERC20(token0), _to, amounts.amount0);
        }
        if (amounts.amount1 > 0) {
            SafeERC20.safeTransfer(IERC20(token1), _to, amounts.amount1);
        }
    }

    function withdrawLpTokens(
        address _to,
        uint256 _lockingPeriodIndex
    ) external override {
        require(currentPhase == Phase.WITHDRAW, 'Wrong phase');
        require(
            _lockingPeriodIndex < LOCKING_PERIODS_NUMBER,
            'Invalid locking period'
        );
        require(
            block.timestamp >
                startTimestamp +
                    availableLockingPeriods[_lockingPeriodIndex].durationWeeks *
                    1 weeks,
            'Too early'
        );
        require(
            !areLpTokensWithdrawn[_to][_lockingPeriodIndex],
            'Already withdrawn'
        );

        uint256 lpAmount = _calculateLpTokens(_to, _lockingPeriodIndex);

        areLpTokensWithdrawn[_to][_lockingPeriodIndex] = true;

        if (lpAmount > 0) {
            SafeERC20.safeTransfer(IERC20(vsPair), _to, lpAmount);
        }
    }

    function viewLeftovers(
        address _who
    ) external view override returns (AmountPair memory amounts) {
        require(currentPhase == Phase.WITHDRAW, 'Wrong phase');
        amounts = areLeftoversClaimed[_who]
            ? AmountPair(0, 0)
            : _calculateLeftovers(_who);
    }

    function viewLpTokens(
        address _who
    )
        external
        view
        override
        returns (uint256[LOCKING_PERIODS_NUMBER] memory amounts)
    {
        require(currentPhase == Phase.WITHDRAW, 'Wrong phase');
        for (uint256 i = 0; i < LOCKING_PERIODS_NUMBER; ++i) {
            amounts[i] = areLpTokensWithdrawn[_who][i]
                ? 0
                : _calculateLpTokens(_who, i);
        }
    }

    function viewVrswTokens(
        address _who
    ) external view override returns (uint256 amount) {
        require(currentPhase == Phase.WITHDRAW, 'Wrong phase');
        amount = areLeftoversClaimed[_who] ? 0 : _calculateVrsw(_who);
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
            IERC20(vrswToken),
            msg.sender,
            IERC20(vrswToken).balanceOf(address(this))
        );
        SafeERC20.safeTransfer(
            IERC20(vsPair),
            msg.sender,
            IERC20(vsPair).balanceOf(address(this))
        );
    }

    function _calculateOptimalAmounts(
        uint256 _amount0,
        uint256 _amount1
    ) private view returns (AmountPair memory optimalAmounts) {
        optimalAmounts.amount1 =
            (_amount0 * priceRatioShifted) >>
            PRICE_RATIO_SHIFT_SIZE;
        if (optimalAmounts.amount1 <= _amount1) {
            optimalAmounts.amount0 = _amount0;
        } else {
            optimalAmounts.amount0 =
                (_amount1 << PRICE_RATIO_SHIFT_SIZE) /
                priceRatioShifted;
            optimalAmounts.amount1 = _amount1;
        }
    }

    function _calculateLpTokens(
        address _who,
        uint256 _lockingPeriodIndex
    ) private view returns (uint256 amount) {
        uint256 index = depositIndexes[_who];
        for (uint256 j = 0; j < DEPOSIT_PHASE_DAYS_NUMBER; ++j) {
            amount += tokensTransferred0[index][_lockingPeriodIndex][j];
        }
        amount = (amount * totalLpTokens) / totalTransferred0;
    }

    function _calculateLeftovers(
        address _who
    ) private view returns (AmountPair memory amounts) {
        uint256 index = depositIndexes[_who];
        for (uint256 i = 0; i < LOCKING_PERIODS_NUMBER; ++i) {
            for (uint256 j = 0; j < DEPOSIT_PHASE_DAYS_NUMBER; ++j) {
                amounts.amount0 += deposits[index][i][j].amount0;
                amounts.amount1 += deposits[index][i][j].amount1;
            }
        }
    }

    function _calculateVrsw(address _who) private view returns (uint256) {
        uint256 index = depositIndexes[_who];
        uint256 transferredWithBonusX10000;
        for (uint256 i = 0; i < LOCKING_PERIODS_NUMBER; ++i) {
            for (uint256 j = 0; j < DEPOSIT_PHASE_DAYS_NUMBER; ++j) {
                transferredWithBonusX10000 +=
                    availableLockingPeriods[i].multiplierX10 *
                    tokensTransferred0[index][i][j] *
                    _calculateBonusX1000(j);
            }
        }
        return
            (transferredWithBonusX10000 * totalVrswAllocated) /
            totalTransferredWithBonusX10000;
    }

    function _calculateBonusX1000(uint256 day) private pure returns (uint256) {
        // starting from 15% bonus will decrease by 2.5% every day
        return 1150 - day * 25;
    }

    function _calculatePenalty(
        AmountPair memory _deposit,
        uint256 _currentDay
    ) private view returns (AmountPair memory) {
        uint256 numerator;
        uint256 denominator;
        if (_currentDay < 4) {
            numerator = 0;
            denominator = 1;
        } else if (_currentDay < 6) {
            numerator = block.timestamp - startTimestamp - 4 days;
            denominator = 4 days;
        } else {
            numerator = block.timestamp - startTimestamp - 5 days;
            denominator = 2 days;
        }
        return
            AmountPair(
                (numerator * _deposit.amount0) / denominator,
                (numerator * _deposit.amount1) / denominator
            );
    }
}
