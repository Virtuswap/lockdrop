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

        const vrswAllocated = '1000000000000000000000';
        await intermediatePoolFactory.createPool(
            token0.address,
            token1.address,
            mockUniswapOracle.address,
            mockV3Aggregator0.address,
            mockV3Aggregator1.address,
            await time.latest(),
            vrswAllocated
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
        const vrswAllocated = '1000000000000000000000';
        await intermediatePoolFactory.createPool(
            token0.address,
            token1.address,
            mockUniswapOracle.address,
            mockV3Aggregator0.address,
            mockV3Aggregator1.address,
            await time.latest(),
            vrswAllocated
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

describe('vIntermediatePool: Phase 3', function () {
    let intermediatePoolFactory: vIntermediatePoolFactory;
    let intermediatePool: vIntermediatePool;
    let mockUniswapOracle: MockUniswapOracle;
    let mockV3Aggregator0: MockV3Aggregator0;
    let mockV3Aggregator1: MockV3Aggregator1;
    let mockVPairFactory: MockVPairFactory;
    let token0: Token0;
    let token1: Token1;
    let vrswToken: MockVrswToken;
    let deployer: SignerWithAddress;
    let accounts;
    let pair;

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
        vrswToken = await ethers.getContract('MockVrswToken');
        await mockVPairFactory.createPair(token0.address, token1.address);
        const vrswAllocated = '1000000000000000000000';
        await intermediatePoolFactory.createPool(
            token0.address,
            token1.address,
            mockUniswapOracle.address,
            mockV3Aggregator0.address,
            mockV3Aggregator1.address,
            await time.latest(),
            vrswAllocated
        );
        const intermediatePoolAddress = await intermediatePoolFactory.getPool(
            token0.address,
            token1.address
        );
        const factory = await ethers.getContractFactory('vIntermediatePool');
        intermediatePool = await factory.attach(intermediatePoolAddress);

        pair = (await ethers.getContractFactory('MockVPair')).attach(
            await mockVPairFactory.getPair(token0.address, token1.address)
        );

        await vrswToken.mint(intermediatePool.address, vrswAllocated);

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
        // induce leftovers
        await mockV3Aggregator0.updateAnswer(175000000);
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
        // final price
        await mockV3Aggregator0.updateAnswer(200000000);
        await intermediatePool.triggerTransferPhase();
        // transfer phase
        await intermediatePool.transferToRealPool(10000);
    });

    it('Claim leftovers for myself', async () => {
        const leftoversBefore = (
            await intermediatePool.viewLeftovers(deployer.address)
        ).toString();

        const vrswBefore = await intermediatePool.viewVrswTokens(
            deployer.address
        );
        const balanceBefore = await token1.balanceOf(deployer.address);
        await intermediatePool.claimLeftovers(deployer.address);
        const leftoversAfter = (
            await intermediatePool.viewLeftovers(deployer.address)
        ).toString();
        const vrswAfter = await intermediatePool.viewVrswTokens(
            deployer.address
        );
        const balanceAfter = await token1.balanceOf(deployer.address);
        expect(
            leftoversAfter
                .slice(0, -6)
                .split(',')
                .every((item) => item == '0')
        );
        expect(
            leftoversBefore
                .slice(0, -6)
                .split(',')
                .some((item) => item != '0')
        );
        expect(balanceAfter).to.be.above(balanceBefore);
        expect(vrswAfter).to.be.equal('0');
    });

    it('Claim leftovers twice', async () => {
        await intermediatePool.claimLeftovers(deployer.address);
        const balanceBefore = await token1.balanceOf(deployer.address);
        await intermediatePool.claimLeftovers(deployer.address);
        const balanceAfter = await token1.balanceOf(deployer.address);
        expect(balanceAfter).to.be.equal(balanceBefore);
        expect(balanceAfter).to.be.above(0);
    });

    it('Withdraw lp tokens for myself', async () => {
        const lpTokensBefore = await pair.balanceOf(deployer.address);
        await intermediatePool.withdrawLpTokens(deployer.address);
        const lpTokensAfter1 = await pair.balanceOf(deployer.address);

        // nothing is withdrawn because of locking
        expect(lpTokensAfter1).to.equal(lpTokensBefore);

        // 4 weeks passed
        await time.setNextBlockTimestamp(
            (await time.latest()) + 4 * 7 * 24 * 60 * 60
        );

        await intermediatePool.withdrawLpTokens(deployer.address);
        const lpTokensAfter2 = await pair.balanceOf(deployer.address);
        // only 4-weeks tokens are withdrawn
        expect(lpTokensAfter2).to.be.above(lpTokensAfter1);

        // another 4 weeks passed
        await time.setNextBlockTimestamp(
            (await time.latest()) + 4 * 7 * 24 * 60 * 60
        );

        await intermediatePool.withdrawLpTokens(deployer.address);
        const lpTokensAfter3 = await pair.balanceOf(deployer.address);
        // all lp tokens are withdrawn
        expect(lpTokensAfter3).to.be.above(lpTokensAfter2);
    });

    it('Withdraw lp tokens twice', async () => {
        await intermediatePool.withdrawLpTokens(deployer.address);
        const balanceBefore = await token1.balanceOf(deployer.address);
        await intermediatePool.withdrawLpTokens(deployer.address);
        const balanceAfter = await token1.balanceOf(deployer.address);
        expect(balanceAfter).to.be.equal(balanceBefore);
        expect(balanceAfter).to.be.above('0');
    });

    it('Withdraw all lp tokens tokens', async () => {
        await time.setNextBlockTimestamp(
            (await time.latest()) + 8 * 7 * 24 * 60 * 60
        );
        for (const account of accounts) {
            await intermediatePool.withdrawLpTokens(account.address);
        }
        // small leftovers because of rounding
        expect(await pair.balanceOf(intermediatePool.address)).to.be.below(20);
    });

    it('Claim all leftovers', async () => {
        expect(
            (await token0.balanceOf(intermediatePool.address)).add(
                await token1.balanceOf(intermediatePool.address)
            )
        ).to.be.above(0);
        expect(await vrswToken.balanceOf(intermediatePool.address)).to.be.above(
            0
        );
        for (const account of accounts) {
            await intermediatePool.claimLeftovers(account.address);
        }
        expect(await token0.balanceOf(intermediatePool.address)).to.be.equal(0);
        expect(await token1.balanceOf(intermediatePool.address)).to.be.equal(0);
        // small leftovers because of rounding
        expect(await vrswToken.balanceOf(intermediatePool.address)).to.be.below(
            20
        );
    });
});
