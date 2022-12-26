// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import '@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/utils/math/Math.sol';
import './interfaces/IvIntermediatePool.sol';
import './interfaces/virtuswap/IvRouter.sol';
import './interfaces/virtuswap/IvPairFactory.sol';
import './vPriceOracle.sol';

contract vIntermediatePool is vPriceOracle, IvIntermediatePool {
    enum Phase {
        CLOSED,
        DEPOSIT,
        TRANSFER,
        WITHDRAW
    }

    uint8 public constant AVAILABLE_LOCKING_WEEKS_MASK = 0xe;
    uint256 public constant DEPOSIT_PHASE_DURATION = 7 days;
    uint256 public constant PRICE_UPDATE_FREQ = 1 days;

    Phase public currentPhase;

    uint256 public totalDeposits;
    uint256 public depositsProcessed;
    uint256 public totalLpTokens;
    uint256 public totalTransferred0;
    mapping(address => uint256) public depositIndexes;
    mapping(uint256 => address) public indexToAddress;
    mapping(uint256 => mapping(uint8 => AmountPair)) public deposits;
    mapping(uint256 => mapping(uint8 => uint256)) public tokensTransferred0;

    uint256 public lastPriceFeedTimestamp;
    uint256 public priceRatioShifted;

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
        address _uniswapOracle,
        address _priceFeed0,
        address _priceFeed1,
        uint256 _startTimestamp
    ) vPriceOracle(_token0, _token1, _uniswapOracle, _priceFeed0, _priceFeed1) {
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
        lastPriceFeedTimestamp = block.timestamp;
        priceRatioShifted = getCurrentPriceRatioShifted();
    }

    function deposit(
        uint256 _amount0,
        uint256 _amount1,
        uint8 _locking_weeks
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

        if (
            block.timestamp - lastPriceFeedTimestamp >= PRICE_UPDATE_FREQ ||
            lastPriceFeedTimestamp == 0
        ) {
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

        uint256 index = depositIndexes[msg.sender];
        if (index != 0) {
            AmountPair memory prevDeposit = deposits[index][_locking_weeks];
            deposits[index][_locking_weeks] = AmountPair(
                prevDeposit.amount0 + optimalAmount0,
                prevDeposit.amount1 + optimalAmount1
            );
        } else {
            index = ++totalDeposits;
            depositIndexes[msg.sender] = index;
            indexToAddress[index] = msg.sender;
            deposits[index][_locking_weeks] = AmountPair(
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

    // TODO: add migration logic

    function transferToRealPool(uint256 _transfersNumber) external override {
        require(
            currentPhase == Phase.TRANSFER,
            'Unable to transfer during current phase'
        );

        uint256 upperBound = Math.min(
            depositsProcessed + _transfersNumber,
            totalDeposits
        );
        uint256 optimalAmount0;
        uint256 optimalAmount1;
        AmountPair memory amounts;
        AmountPair memory optimalTotal;
        for (uint256 i = depositsProcessed; i < upperBound; ++i) {
            for (uint256 j = 1; j < 256; j <<= 1) {
                if (AVAILABLE_LOCKING_WEEKS_MASK & j != 0) {
                    amounts = deposits[i][uint8(j)];
                    (optimalAmount0, optimalAmount1) = _calculateOptimalAmounts(
                        amounts.amount0,
                        amounts.amount1
                    );
                    optimalTotal.amount0 += optimalAmount0;
                    optimalTotal.amount1 += optimalAmount1;

                    tokensTransferred0[i][uint8(j)] = optimalAmount0;

                    // leftovers
                    deposits[i][uint8(j)] = AmountPair(
                        amounts.amount0 - optimalAmount0,
                        amounts.amount1 - optimalAmount1
                    );
                }
            }
        }

        IvRouter(vsRouter).addLiquidity(
            token0,
            token1,
            optimalTotal.amount0,
            optimalTotal.amount1,
            optimalTotal.amount0,
            optimalTotal.amount1,
            address(this),
            block.timestamp + 1 minutes
        );
        // TODO: mint VRSW tokens
        totalTransferred0 += optimalTotal.amount0;
        depositsProcessed = upperBound;
        if (upperBound == totalDeposits) {
            totalLpTokens = IERC20(vsPair).balanceOf(address(this));
            currentPhase = Phase.WITHDRAW;
        }
    }

    function withdrawLeftovers(address _to) external override {
        require(
            currentPhase == Phase.WITHDRAW,
            'Unable to withdraw during current phase'
        );
        uint256 index = depositIndexes[_to];
        require(index != 0, 'Nothing to withdraw');
        (
            AmountPair[3] memory amounts,
            uint8[3] memory locking_weeks
        ) = _calculateLeftovers(_to);
        for (uint256 i = 0; i < 3; ++i) {
            deposits[index][locking_weeks[i]] = AmountPair(0, 0);
            if (amounts[i].amount0 > 0) {
                SafeERC20.safeTransfer(IERC20(token0), _to, amounts[i].amount0);
            }
            if (amounts[i].amount1 > 0) {
                SafeERC20.safeTransfer(IERC20(token1), _to, amounts[i].amount1);
            }
        }
    }

    function claimLpTokens(address _to) external override {
        require(
            currentPhase == Phase.WITHDRAW,
            'Unable to withdraw during current phase'
        );
        uint256 index = depositIndexes[_to];
        require(index != 0, 'Nothing to claim');
        uint256 _startTimestamp = startTimestamp;
        (
            uint256[3] memory amounts,
            uint8[3] memory locking_weeks
        ) = _calculateLpTokens(_to);
        for (uint256 i = 0; i < 3; ++i) {
            if (block.timestamp < _startTimestamp + locking_weeks[i] * 1 weeks)
                break;
            tokensTransferred0[index][locking_weeks[i]] = 0;
            if (amounts[i] > 0) {
                SafeERC20.safeTransfer(IERC20(vsPair), _to, amounts[i]);
            }
        }
    }

    function viewLeftovers(
        address _who
    )
        external
        view
        override
        returns (AmountPair[3] memory amounts, uint8[3] memory locking_weeks)
    {
        require(
            currentPhase == Phase.WITHDRAW,
            'Unable to view leftovers during current phase'
        );
        return _calculateLeftovers(_who);
    }

    function viewLpTokens(
        address _who
    )
        external
        view
        override
        returns (uint256[3] memory amounts, uint8[3] memory locking_weeks)
    {
        require(
            currentPhase == Phase.WITHDRAW,
            'Unable to view leftovers during current phase'
        );
        return _calculateLpTokens(_who);
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
        address _who
    )
        private
        view
        returns (uint256[3] memory amounts, uint8[3] memory locking_weeks)
    {
        uint256 index = depositIndexes[_who];
        uint256 _totalLpTokens = totalLpTokens;
        uint256 outIndex;
        for (uint256 i = 1; i < 256; i <<= 1) {
            if (AVAILABLE_LOCKING_WEEKS_MASK & i != 0) {
                assert(outIndex < 3);
                amounts[outIndex] =
                    (tokensTransferred0[index][uint8(i)] * _totalLpTokens) /
                    totalTransferred0;
                locking_weeks[outIndex++] = uint8(i);
            }
        }
    }

    function _calculateLeftovers(
        address _who
    )
        private
        view
        returns (AmountPair[3] memory amounts, uint8[3] memory locking_weeks)
    {
        uint256 index = depositIndexes[_who];
        uint256 outIndex;
        for (uint256 i = 1; i < 256; i <<= 1) {
            if (AVAILABLE_LOCKING_WEEKS_MASK & i != 0) {
                assert(outIndex < 3);
                amounts[outIndex] = deposits[index][uint8(i)];
                locking_weeks[outIndex++] = uint8(i);
            }
        }
    }
}
