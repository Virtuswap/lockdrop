// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import '@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import './interfaces/IvIntermediatePool.sol';

contract vIntermediatePool is IvIntermediatePool {
    struct AmountPair {
        uint256 amount0;
        uint256 amount1;
    }

    enum Phase {
        CLOSED,
        DEPOSIT,
        TRANSFER,
        WITHDRAW
    }

    uint8 public constant AVAILABLE_LOCKING_WEEKS_MASK = 0xe;
    uint8 public constant PRICE_RATIO_SHIFT_SIZE = 32;
    address public constant VIRTUSWAP_POOL = address(0x0);

    Phase public currentPhase;

    uint256 public totalDeposits;
    mapping(address => uint256) public depositIndexes;
    mapping(uint256 => mapping(uint8 => AmountPair)) public deposits;

    uint256 lastPriceFeedTimestamp;
    uint256 priceRatioShifted;

    address public immutable token0;
    address public immutable token1;
    AggregatorV3Interface public immutable priceFeed0;
    AggregatorV3Interface public immutable priceFeed1;

    constructor(
        address _token0,
        address _token1,
        address _priceFeed0,
        address _priceFeed1
    ) {
        token0 = _token0;
        token1 = _token1;
        priceFeed0 = AggregatorV3Interface(_priceFeed0);
        priceFeed1 = AggregatorV3Interface(_priceFeed1);
        currentPhase = Phase.CLOSED;
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
            block.timestamp - lastPriceFeedTimestamp >= 1 days ||
            lastPriceFeedTimestamp == 0
        ) {
            lastPriceFeedTimestamp = block.timestamp;
            priceRatioShifted = _getCurrentPriceRatioShifted();
        }

        (
            uint256 optimalAmount0,
            uint256 optimalAmount1
        ) = _calculateOptimalAmounts(_amount0, _amount1);

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

    // TODO: add phase transition
    // TODO: add migration logic

    function transferToRealPool() external override {
        require(
            currentPhase == Phase.TRANSFER,
            'Unable to transfer during current phase'
        );
        // TODO: transfer to real pool
        // TODO: mint LP tokens
        // TODO: mint VRSW tokens
    }

    function withdraw() external override {
        require(
            currentPhase == Phase.WITHDRAW,
            'Unable to withdraw during current phase'
        );
        uint256 index = depositIndexes[msg.sender];
        require(index != 0, 'Nothing to withdraw');
        AmountPair memory amounts;
        for (uint256 i = 1; i < 256; i <<= 1) {
            if (AVAILABLE_LOCKING_WEEKS_MASK & i != 0) {
                amounts = deposits[index][uint8(i)];
                deposits[index][uint8(i)] = AmountPair(0, 0);
                SafeERC20.safeTransfer(
                    IERC20(token0),
                    msg.sender,
                    amounts.amount0
                );
                SafeERC20.safeTransfer(
                    IERC20(token1),
                    msg.sender,
                    amounts.amount1
                );
            }
        }
    }

    function getLatestPrice(
        AggregatorV3Interface priceFeed
    ) public view returns (int price) {
        (, price, , , ) = priceFeed.latestRoundData();
        return price;
    }

    function _getCurrentPriceRatioShifted() private view returns (uint256) {
        return
            (uint256(getLatestPrice(priceFeed1)) << PRICE_RATIO_SHIFT_SIZE) /
            uint256(getLatestPrice(priceFeed0));
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
}
