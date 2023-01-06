// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import '@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/utils/math/Math.sol';
import './interfaces/IvIntermediatePool.sol';
import './interfaces/IvIntermediatePoolFactory.sol';
import './interfaces/virtuswap/IvRouter.sol';
import './interfaces/virtuswap/IvPairFactory.sol';
import './vPriceOracle.sol';

contract vIntermediatePool is vPriceOracle, IvIntermediatePool {
    uint256 public constant AVAILABLE_LOCKING_WEEKS_MASK = 0xe;
    uint256 public constant LOCKING_WEEKS_NUMBER = 3;
    uint256 public constant DEPOSIT_PHASE_DURATION = 7 days;
    uint256 public constant LOCKDROP_DURATION_DAYS = 7;
    uint256 public constant PRICE_UPDATE_FREQ = 1 days;
    uint256 public constant WITHDRAW_PENALTY = 2;

    Phase public currentPhase;

    AmountPair public penalties;
    uint256 public totalDeposits;
    uint256 public depositsProcessed;
    uint256 public totalLpTokens;
    uint256 public totalTransferred0;
    uint256 public totalTransferredWeightedX10;
    uint256 public totalTransferredWithBonusX10000;
    mapping(address => mapping(uint256 => bool)) public lpTokensWithdrawn;
    mapping(address => bool) public leftoversClaimed;
    mapping(address => bool) public vrswClaimed;
    mapping(address => uint256) public depositIndexes;
    mapping(uint256 => address) public indexToAddress;
    mapping(uint256 => mapping(uint256 => mapping(uint256 => AmountPair)))
        public deposits;
    mapping(uint256 => mapping(uint256 => mapping(uint256 => uint256)))
        public tokensTransferred0;
    mapping(uint256 => uint256) public lockMultiplierX10;

    uint256 public lastPriceFeedTimestamp;
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
        require(
            _vsPair != address(0),
            "VSPair with these tokens doesn't exist"
        );
        vsPair = _vsPair;
        lockMultiplierX10[2] = 10;
        lockMultiplierX10[4] = 22;
        lockMultiplierX10[8] = 44;
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
        lastPriceFeedTimestamp = block.timestamp;
        priceRatioShifted = getCurrentPriceRatioShifted();
    }

    function deposit(
        uint256 _amount0,
        uint256 _amount1,
        uint256 _locking_weeks
    ) external override {
        require(
            currentPhase == Phase.DEPOSIT,
            'Unable to deposit during current phase'
        );
        require(
            _locking_weeks & AVAILABLE_LOCKING_WEEKS_MASK != 0,
            'Invalid locking period'
        );
        require(_amount0 > 0 && _amount1 > 0, 'Insufficient amounts');

        if (block.timestamp - lastPriceFeedTimestamp >= PRICE_UPDATE_FREQ) {
            lastPriceFeedTimestamp = block.timestamp;
            priceRatioShifted = getCurrentPriceRatioShifted();
        }

        (
            uint256 optimalAmount0,
            uint256 optimalAmount1
        ) = _calculateOptimalAmounts(_amount0, _amount1);

        require(
            optimalAmount0 > 0 && optimalAmount1 > 0,
            'Insufficient amounts'
        );

        uint256 currentLockdropDay = (block.timestamp - startTimestamp) /
            1 days;
        uint256 index = depositIndexes[msg.sender];
        if (index != 0) {
            AmountPair memory prevDeposit = deposits[index][_locking_weeks][
                currentLockdropDay
            ];
            deposits[index][_locking_weeks][currentLockdropDay] = AmountPair(
                prevDeposit.amount0 + optimalAmount0,
                prevDeposit.amount1 + optimalAmount1
            );
        } else {
            index = ++totalDeposits;
            depositIndexes[msg.sender] = index;
            indexToAddress[index] = msg.sender;
            deposits[index][_locking_weeks][currentLockdropDay] = AmountPair(
                optimalAmount0,
                optimalAmount1
            );
        }
        SafeERC20.safeTransferFrom(
            IERC20(token0),
            msg.sender,
            address(this),
            optimalAmount0
        );
        SafeERC20.safeTransferFrom(
            IERC20(token1),
            msg.sender,
            address(this),
            optimalAmount1
        );
    }

    function withdrawWithPenalty(
        uint256 _lockingWeeks,
        uint256 _depositDay
    ) external override {
        require(
            currentPhase == Phase.DEPOSIT,
            'Unable to withdraw with penalty during current phase'
        );
        require(
            _lockingWeeks & AVAILABLE_LOCKING_WEEKS_MASK != 0,
            'Invalid locking period'
        );
        uint256 currentLockdropDay = (block.timestamp - startTimestamp) /
            1 days;
        require(
            _depositDay > 0 && _depositDay <= currentLockdropDay + 1,
            'Invalid deposit day'
        );

        uint256 index = depositIndexes[msg.sender];
        AmountPair memory amounts = deposits[index][_lockingWeeks][_depositDay];
        AmountPair memory _penalty = AmountPair(
            (amounts.amount0 * WITHDRAW_PENALTY) / 100,
            (amounts.amount1 * WITHDRAW_PENALTY) / 100
        );
        AmountPair memory prevPenalties = penalties;
        AmountPair memory withdrawAmounts = AmountPair(
            amounts.amount0 - _penalty.amount0,
            amounts.amount1 - _penalty.amount1
        );

        deposits[index][_lockingWeeks][_depositDay] = AmountPair(0, 0);
        penalties = AmountPair(
            prevPenalties.amount0 + _penalty.amount0,
            prevPenalties.amount1 + _penalty.amount1
        );

        if (withdrawAmounts.amount0 > 0) {
            SafeERC20.safeTransfer(
                IERC20(token0),
                msg.sender,
                withdrawAmounts.amount0
            );
        }
        if (withdrawAmounts.amount1 > 0) {
            SafeERC20.safeTransfer(
                IERC20(token1),
                msg.sender,
                withdrawAmounts.amount1
            );
        }
    }

    function transferToRealPool(uint256 _transfersNumber) external override {
        require(
            currentPhase == Phase.TRANSFER,
            'Unable to transfer during current phase'
        );
        require(_transfersNumber > 0, 'Transfers number must be positive');

        uint256 upperBound = Math.min(
            depositsProcessed + _transfersNumber,
            totalDeposits
        );
        uint256 optimalAmount0;
        uint256 optimalAmount1;
        uint256 _totalTransferredWeightedX10;
        uint256 _totalTransferredWithBonusX10000;
        AmountPair memory amounts;
        AmountPair memory optimalTotal;
        for (uint256 i = depositsProcessed + 1; i <= upperBound; ++i) {
            for (uint256 j = 1; j < 256; j <<= 1) {
                for (uint256 k = 0; k < LOCKDROP_DURATION_DAYS; ++k) {
                    if (AVAILABLE_LOCKING_WEEKS_MASK & j != 0) {
                        amounts = deposits[i][j][k];
                        (
                            optimalAmount0,
                            optimalAmount1
                        ) = _calculateOptimalAmounts(
                            amounts.amount0,
                            amounts.amount1
                        );
                        optimalTotal.amount0 += optimalAmount0;
                        optimalTotal.amount1 += optimalAmount1;

                        tokensTransferred0[i][j][k] = optimalAmount0;
                        _totalTransferredWeightedX10 +=
                            lockMultiplierX10[j] *
                            optimalAmount0;
                        _totalTransferredWithBonusX10000 +=
                            lockMultiplierX10[j] *
                            _calculateBonusX1000(k) *
                            optimalAmount0;

                        // leftovers
                        deposits[i][j][k] = AmountPair(
                            amounts.amount0 - optimalAmount0,
                            amounts.amount1 - optimalAmount1
                        );
                    }
                }
            }
        }

        IERC20(token0).approve(
            vsRouter,
            IERC20(token0).balanceOf(address(this))
        );
        IERC20(token1).approve(
            vsRouter,
            IERC20(token1).balanceOf(address(this))
        );
        uint256 amount0 = optimalTotal.amount0 + penalties.amount0;
        uint256 amount1 = optimalTotal.amount1 + penalties.amount1;
        penalties = AmountPair(0, 0);
        IvRouter(vsRouter).addLiquidity(
            token0,
            token1,
            amount0,
            amount1,
            amount0,
            amount1,
            address(this),
            block.timestamp + 1 minutes
        );
        totalTransferred0 += optimalTotal.amount0;
        totalTransferredWeightedX10 += _totalTransferredWeightedX10;
        totalTransferredWithBonusX10000 += _totalTransferredWithBonusX10000;
        depositsProcessed = upperBound;
        if (upperBound == totalDeposits) {
            totalLpTokens = IERC20(vsPair).balanceOf(address(this));
            currentPhase = Phase.WITHDRAW;
        }
    }

    function claimLeftovers(address _to) external override {
        require(
            currentPhase == Phase.WITHDRAW,
            'Unable to withdraw during current phase'
        );

        AmountPair memory amounts = leftoversClaimed[_to]
            ? AmountPair(0, 0)
            : _calculateLeftovers(_to);
        uint256 vrswAmount = vrswClaimed[_to] ? 0 : _calculateVrsw(_to);

        leftoversClaimed[_to] = true;
        vrswClaimed[_to] = true;

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
        uint256 _locking_weeks
    ) external override {
        require(
            currentPhase == Phase.WITHDRAW,
            'Unable to withdraw during current phase'
        );
        require(
            _locking_weeks & AVAILABLE_LOCKING_WEEKS_MASK != 0,
            'Invalid locking period'
        );
        require(
            block.timestamp > startTimestamp + _locking_weeks * 1 weeks,
            'Too early'
        );
        uint256 lpAmount = lpTokensWithdrawn[_to][_locking_weeks]
            ? 0
            : _calculateLpTokens(_to, _locking_weeks);
        lpTokensWithdrawn[_to][_locking_weeks] = true;
        if (lpAmount > 0) {
            SafeERC20.safeTransfer(IERC20(vsPair), _to, lpAmount);
        }
    }

    function viewLeftovers(
        address _who
    ) external view override returns (AmountPair memory amounts) {
        require(
            currentPhase == Phase.WITHDRAW,
            'Unable to view leftovers during current phase'
        );
        amounts = leftoversClaimed[_who]
            ? AmountPair(0, 0)
            : _calculateLeftovers(_who);
    }

    function viewLpTokens(
        address _who
    )
        external
        view
        override
        returns (
            uint256[LOCKING_WEEKS_NUMBER] memory amounts,
            uint256[LOCKING_WEEKS_NUMBER] memory locking_weeks
        )
    {
        require(
            currentPhase == Phase.WITHDRAW,
            'Unable to view leftovers during current phase'
        );
        uint256 outIndex;
        for (uint256 i = 1; i < 256; i <<= 1) {
            if (AVAILABLE_LOCKING_WEEKS_MASK & i != 0) {
                amounts[outIndex] = lpTokensWithdrawn[_who][i]
                    ? 0
                    : _calculateLpTokens(_who, i);
                locking_weeks[outIndex++] = i;
            }
        }
    }

    function viewVrswTokens(
        address _who
    ) external view override returns (uint256 amount) {
        require(
            currentPhase == Phase.WITHDRAW,
            'Unable to view leftovers during current phase'
        );
        amount = vrswClaimed[_who] ? 0 : _calculateVrsw(_who);
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
    ) private view returns (uint256 optimalAmount0, uint256 optimalAmount1) {
        optimalAmount1 =
            (_amount0 * priceRatioShifted) >>
            PRICE_RATIO_SHIFT_SIZE;
        if (optimalAmount1 <= _amount1) {
            optimalAmount0 = _amount0;
        } else {
            optimalAmount0 =
                (_amount1 << PRICE_RATIO_SHIFT_SIZE) /
                priceRatioShifted;
            optimalAmount1 = _amount1;
        }
    }

    function _calculateLpTokens(
        address _who,
        uint256 _locking_weeks
    ) private view returns (uint256 amount) {
        uint256 index = depositIndexes[_who];
        for (uint256 j = 0; j < LOCKDROP_DURATION_DAYS; ++j) {
            amount += tokensTransferred0[index][_locking_weeks][j];
        }
        amount = (amount * totalLpTokens) / totalTransferred0;
    }

    function _calculateLeftovers(
        address _who
    ) private view returns (AmountPair memory amounts) {
        uint256 index = depositIndexes[_who];
        for (uint256 i = 1; i < 256; i <<= 1) {
            if (AVAILABLE_LOCKING_WEEKS_MASK & i != 0) {
                for (uint256 j = 0; j < LOCKDROP_DURATION_DAYS; ++j) {
                    amounts.amount0 += deposits[index][i][j].amount0;
                    amounts.amount1 += deposits[index][i][j].amount1;
                }
            }
        }
    }

    function _calculateVrsw(address _who) private view returns (uint256) {
        uint256 index = depositIndexes[_who];
        uint256 transferredWithBonusX10000;
        for (uint256 i = 1; i < 256; i <<= 1) {
            if (AVAILABLE_LOCKING_WEEKS_MASK & i != 0) {
                for (uint256 j = 0; j < LOCKDROP_DURATION_DAYS; ++j) {
                    transferredWithBonusX10000 +=
                        lockMultiplierX10[i] *
                        tokensTransferred0[index][i][j] *
                        _calculateBonusX1000(j);
                }
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
}
