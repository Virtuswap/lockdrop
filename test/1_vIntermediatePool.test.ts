import { assert, expect } from 'chai';
import { network, deployments, ethers } from 'hardhat';
import {
    vIntermediatePool,
    vIntermediatePoolFactory,
    MockUniswapOracle,
    MockVPairFactory,
    MockV3Aggregator0,
    mockV3Aggregator1,
} from '../../typechain-types';
import { time } from '@nomicfoundation/hardhat-network-helpers';

describe('vIntermediatePool: Phase 1', function () {
    let intermediatePoolFactory: vIntermediatePoolFactory;
    let intermediatePool: vIntermediatePool;
    let mockUniswapOracle: MockUniswapOracle;
    let mockV3Aggregator0: MockV3Aggregator0;
    let mockV3Aggregator1: MockV3Aggregator1;
    let mockVPairFactory: MockVPairFactory;
    let token0: Token0;
    let token1: Token1;
    let deployer: SignerWithAddress;

    beforeEach(async () => {
        const accounts = await ethers.getSigners();
        deployer = accounts[0];
        await deployments.fixture(['all']);
        intermediatePoolFactory = await ethers.getContract(
            'intermediatePoolFactory'
        );
        mockVPairFactory = await ethers.getContract('MockVPairFactory');
        mockUniswapOracle = await ethers.getContract('MockUniswapOracle');
        mockV3Aggregator0 = await ethers.getContract('MockV3Aggregator0');
        mockV3Aggregator1 = await ethers.getContract('MockV3Aggregator1');
        token0 = await ethers.getContract('Token0');
        token1 = await ethers.getContract('Token1');
        await mockVPairFactory.createPair(token0.address, token1.address);
        await intermediatePoolFactory.createPool(
            token0.address,
            token1.address,
            mockUniswapOracle.address,
            mockV3Aggregator0.address,
            mockV3Aggregator1.address,
            await time.latest()
        );
        const intermediatePoolAddress = await intermediatePoolFactory.getPool(
            token0.address,
            token1.address
        );
        const factory = await ethers.getContractFactory('vIntermediatePool');
        intermediatePool = await factory.attach(intermediatePoolAddress);
        await intermediatePool.triggerDepositPhase();
        await token0.approve(
            intermediatePool.address,
            ethers.utils.parseEther('1000')
        );
        await token1.approve(
            intermediatePool.address,
            ethers.utils.parseEther('1000')
        );
    });

    it('Price ratio must be updated once a day', async () => {
        const amount0 = ethers.utils.parseEther('2');
        const amount1 = ethers.utils.parseEther('1');
        const priceBefore = (
            await intermediatePool.priceRatioShifted()
        ).toString();
        const tsBefore = (
            await intermediatePool.lastPriceFeedTimestamp()
        ).toString();
        assert(priceBefore == 0 && tsBefore == 0);

        await intermediatePool.deposit(amount0, amount1, 2);
        const priceAfter = (
            await intermediatePool.priceRatioShifted()
        ).toString();
        const tsAfter = (
            await intermediatePool.lastPriceFeedTimestamp()
        ).toString();
        assert(priceAfter > priceBefore && tsAfter > tsBefore);

        await time.setNextBlockTimestamp(
            (await time.latest()) + 24 * 60 * 60 - 1
        );
        await intermediatePool.deposit(amount0, amount1, 2);
        const priceAfter2 = (
            await intermediatePool.priceRatioShifted()
        ).toString();
        const tsAfter2 = (
            await intermediatePool.lastPriceFeedTimestamp()
        ).toString();
        expect(tsAfter2 == tsAfter);

        await time.setNextBlockTimestamp((await time.latest()) + 1);
        await intermediatePool.deposit(amount0, amount1, 2);
        const tsAfter3 = (
            await intermediatePool.lastPriceFeedTimestamp()
        ).toString();
        expect(tsAfter3 > tsAfter2);
    });

    it('Must revert if locking period is invalid', async () => {
        const amount0 = ethers.utils.parseEther('2');
        const amount1 = ethers.utils.parseEther('1');
        await expect(
            intermediatePool.deposit(amount0, amount1, 1)
        ).to.revertedWith('Invalid locking period');
    });

    it('First time deposit', async () => {
        const amount0 = ethers.utils.parseEther('10');
        const amount1 = ethers.utils.parseEther('10');
        const token0BalanceBefore = await token0.balanceOf(deployer.address);
        const token1BalanceBefore = await token1.balanceOf(deployer.address);
        await intermediatePool.deposit(amount0, amount1, 2);
        const token0BalanceAfter = await token0.balanceOf(deployer.address);
        const token1BalanceAfter = await token1.balanceOf(deployer.address);
        const amount0Expected = ethers.utils.parseEther('10');
        const amount1Expected = ethers.utils.parseEther('5');
        expect(token0BalanceBefore.sub(token0BalanceAfter)).equals(
            amount0Expected
        );
        expect(token1BalanceBefore.sub(token1BalanceAfter)).equals(
            amount1Expected
        );
        expect(await intermediatePool.totalDeposits()).equals(1);
    });

    it('Two deposits with the same locking period', async () => {
        let amount0 = ethers.utils.parseEther('10');
        let amount1 = ethers.utils.parseEther('1');
        const token0BalanceBefore = await token0.balanceOf(deployer.address);
        const token1BalanceBefore = await token1.balanceOf(deployer.address);
        await intermediatePool.deposit(amount0, amount1, 4);
        amount0 = ethers.utils.parseEther('1');
        amount1 = ethers.utils.parseEther('10');
        await intermediatePool.deposit(amount0, amount1, 4);
        const token0BalanceAfter = await token0.balanceOf(deployer.address);
        const token1BalanceAfter = await token1.balanceOf(deployer.address);
        const amount0Expected = ethers.utils.parseEther('3');
        const amount1Expected = ethers.utils.parseEther('1.5');
        expect(token0BalanceBefore.sub(token0BalanceAfter)).equals(
            amount0Expected
        );
        expect(token1BalanceBefore.sub(token1BalanceAfter)).equals(
            amount1Expected
        );
        expect(await intermediatePool.totalDeposits()).equals(1);
    });

    it('Two deposits with different locking periods', async () => {
        let amount0 = ethers.utils.parseEther('10');
        let amount1 = ethers.utils.parseEther('10');
        const token0BalanceBefore = await token0.balanceOf(deployer.address);
        const token1BalanceBefore = await token1.balanceOf(deployer.address);
        await intermediatePool.deposit(amount0, amount1, 4);
        amount0 = ethers.utils.parseEther('1');
        amount1 = ethers.utils.parseEther('10');
        await intermediatePool.deposit(amount0, amount1, 8);
        const token0BalanceAfter = await token0.balanceOf(deployer.address);
        const token1BalanceAfter = await token1.balanceOf(deployer.address);
        const amount0Expected = ethers.utils.parseEther('11');
        const amount1Expected = ethers.utils.parseEther('5.5');
        expect(token0BalanceBefore.sub(token0BalanceAfter)).equals(
            amount0Expected
        );
        expect(token1BalanceBefore.sub(token1BalanceAfter)).equals(
            amount1Expected
        );
        expect(await intermediatePool.totalDeposits()).equals(1);
    });

    it('Must revert if amount is zero', async () => {
        let amount0 = ethers.utils.parseEther('0');
        let amount1 = ethers.utils.parseEther('10');
        await expect(
            intermediatePool.deposit(amount0, amount1, 4)
        ).to.revertedWith('Insufficient amounts');
    });
});

describe('vIntermediatePool: Phase 2', function () {
    let intermediatePoolFactory: vIntermediatePoolFactory;
    let intermediatePool: vIntermediatePool;
    let mockUniswapOracle: MockUniswapOracle;
    let mockV3Aggregator0: MockV3Aggregator0;
    let mockV3Aggregator1: MockV3Aggregator1;
    let mockVPairFactory: MockVPairFactory;
    let token0: Token0;
    let token1: Token1;
    let deployer: SignerWithAddress;
    let accounts;

    beforeEach(async () => {
        accounts = await ethers.getSigners();
        deployer = accounts[0];
        await deployments.fixture(['all']);
        intermediatePoolFactory = await ethers.getContract(
            'intermediatePoolFactory'
        );
        mockVPairFactory = await ethers.getContract('MockVPairFactory');
        mockUniswapOracle = await ethers.getContract('MockUniswapOracle');
        mockV3Aggregator0 = await ethers.getContract('MockV3Aggregator0');
        mockV3Aggregator1 = await ethers.getContract('MockV3Aggregator1');
        token0 = await ethers.getContract('Token0');
        token1 = await ethers.getContract('Token1');
        await mockVPairFactory.createPair(token0.address, token1.address);
        await intermediatePoolFactory.createPool(
            token0.address,
            token1.address,
            mockUniswapOracle.address,
            mockV3Aggregator0.address,
            mockV3Aggregator1.address,
            await time.latest()
        );
        const intermediatePoolAddress = await intermediatePoolFactory.getPool(
            token0.address,
            token1.address
        );
        const factory = await ethers.getContractFactory('vIntermediatePool');
        intermediatePool = await factory.attach(intermediatePoolAddress);

        const pair = (await ethers.getContractFactory('MockVPair')).attach(
            await mockVPairFactory.getPair(token0.address, token1.address)
        );

        await intermediatePool.triggerDepositPhase();
        await token0.approve(
            intermediatePool.address,
            ethers.utils.parseEther('1000')
        );
        await token1.approve(
            intermediatePool.address,
            ethers.utils.parseEther('1000')
        );
        // Deposit phase

        let amount0 = ethers.utils.parseEther('10');
        let amount1 = ethers.utils.parseEther('10');
        for (const account of accounts) {
            await token0.mint(account.address, ethers.utils.parseEther('1000'));
            await token1.mint(account.address, ethers.utils.parseEther('1000'));
            await token0
                .connect(account)
                .approve(
                    intermediatePool.address,
                    ethers.utils.parseEther('1000')
                );
            await token1
                .connect(account)
                .approve(
                    intermediatePool.address,
                    ethers.utils.parseEther('1000')
                );
            amount0 = amount0.add(ethers.utils.parseEther('10'));
            amount1 = amount1.add(ethers.utils.parseEther('10'));
            await intermediatePool
                .connect(account)
                .deposit(amount0, amount1, 4);
        }
        await intermediatePool.deposit(amount0, amount1, 8);
        await intermediatePool
            .connect(accounts[2])
            .deposit(amount0, amount1, 8);
        await intermediatePool
            .connect(accounts[1])
            .deposit(amount0, amount1, 2);
        await time.setNextBlockTimestamp(
            (await time.latest()) + 7 * 24 * 60 * 60
        );
        await intermediatePool.triggerTransferPhase();
    });

    it('Transfer all deposits in 1 transaction', async () => {
        await intermediatePool.transferToRealPool(10000);
        // all tokens were transferred
        expect(await token0.balanceOf(intermediatePool.address)).to.equal(0);
        expect(await token1.balanceOf(intermediatePool.address)).to.equal(0);
        // phase transition happened
        expect(await intermediatePool.currentPhase()).to.equal(3);
        // lp tokens were received
        expect(await intermediatePool.totalLpTokens()).to.equal(100);
    });

    it('Transfer all deposits in 3 transactions', async () => {
        await intermediatePool.transferToRealPool(6);
        await intermediatePool.transferToRealPool(10);
        await intermediatePool.transferToRealPool(10);
        // all tokens were transferred
        expect(await token0.balanceOf(intermediatePool.address)).to.equal(0);
        expect(await token1.balanceOf(intermediatePool.address)).to.equal(0);
        // phase transition happened
        expect(await intermediatePool.currentPhase()).to.equal(3);
        // lp tokens were received
        expect(await intermediatePool.totalLpTokens()).to.equal(300);
    });

    it('Must revert if transfers amount is zero', async () => {
        await expect(intermediatePool.transferToRealPool(0)).to.revertedWith(
            'Transfers number must be positive'
        );
    });
});
