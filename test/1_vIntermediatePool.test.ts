import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { assert, expect } from 'chai';
import { deployments, ethers } from 'hardhat';
import {
    VIntermediatePool,
    VIntermediatePoolFactory,
    MockStaticOracle,
    MockVPairFactory,
    MockV3Aggregator,
    MockVPair,
    MockVrswToken,
    Token0,
    Token1,
} from '../typechain-types';
import { time } from '@nomicfoundation/hardhat-network-helpers';

describe('vIntermediatePool: Prerequisites', function () {
    const vrswAllocated = '1000000000000000000000';
    let intermediatePoolFactory: VIntermediatePoolFactory;
    let intermediatePool: VIntermediatePool;
    let mockUniswapOracle: MockStaticOracle;
    let mockV3Aggregator0: MockV3Aggregator;
    let mockV3Aggregator1: MockV3Aggregator;
    let mockVPairFactory: MockVPairFactory;
    let token0: Token0;
    let token1: Token1;

    beforeEach(async () => {
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
    });

    it('Trigger deposit phase works', async () => {
        await intermediatePoolFactory.createIntermediatePool(
            token0.address,
            token1.address,
            mockUniswapOracle.address,
            mockV3Aggregator0.address,
            mockV3Aggregator1.address,
            (await time.latest()) + 1,
            vrswAllocated
        );
        const intermediatePoolAddress =
            await intermediatePoolFactory.getIntermediatePool(
                token0.address,
                token1.address
            );
        const factory = await ethers.getContractFactory('vIntermediatePool');
        intermediatePool = factory.attach(
            intermediatePoolAddress
        ) as VIntermediatePool;

        let phaseBefore = await intermediatePool.currentPhase();
        await intermediatePool.triggerDepositPhase();
        let phaseAfter = await intermediatePool.currentPhase();
        expect(phaseBefore).to.equal(0);
        expect(phaseAfter).to.equal(1);
    });

    it('Trigger deposit phase fails when called from wrong phase', async () => {
        await intermediatePoolFactory.createIntermediatePool(
            token0.address,
            token1.address,
            mockUniswapOracle.address,
            mockV3Aggregator0.address,
            mockV3Aggregator1.address,
            await time.latest(),
            vrswAllocated
        );
        const intermediatePoolAddress =
            await intermediatePoolFactory.getIntermediatePool(
                token0.address,
                token1.address
            );
        const factory = await ethers.getContractFactory('vIntermediatePool');
        intermediatePool = factory.attach(
            intermediatePoolAddress
        ) as VIntermediatePool;

        await intermediatePool.triggerDepositPhase();
        await expect(intermediatePool.triggerDepositPhase()).to.revertedWith(
            'Wrong phase'
        );
    });

    it('Trigger deposit phase fails when called too early', async () => {
        await intermediatePoolFactory.createIntermediatePool(
            token0.address,
            token1.address,
            mockUniswapOracle.address,
            mockV3Aggregator0.address,
            mockV3Aggregator1.address,
            (await time.latest()) + 3,
            vrswAllocated
        );
        const intermediatePoolAddress =
            await intermediatePoolFactory.getIntermediatePool(
                token0.address,
                token1.address
            );
        const factory = await ethers.getContractFactory('vIntermediatePool');
        intermediatePool = factory.attach(
            intermediatePoolAddress
        ) as VIntermediatePool;

        await expect(intermediatePool.triggerDepositPhase()).to.revertedWith(
            'Too early'
        );
    });
});

describe('vIntermediatePool: Phase 1', function () {
    let intermediatePoolFactory: VIntermediatePoolFactory;
    let intermediatePool: VIntermediatePool;
    let mockUniswapOracle: MockStaticOracle;
    let mockV3Aggregator0: MockV3Aggregator;
    let mockV3Aggregator1: MockV3Aggregator;
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
        await intermediatePoolFactory.createIntermediatePool(
            token0.address,
            token1.address,
            mockUniswapOracle.address,
            mockV3Aggregator0.address,
            mockV3Aggregator1.address,
            await time.latest(),
            vrswAllocated
        );
        const intermediatePoolAddress =
            await intermediatePoolFactory.getIntermediatePool(
                token0.address,
                token1.address
            );
        const factory = await ethers.getContractFactory('vIntermediatePool');
        intermediatePool = factory.attach(
            intermediatePoolAddress
        ) as VIntermediatePool;
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

    it('Trigger transfer phase works', async () => {
        await time.setNextBlockTimestamp(
            (await time.latest()) + 7 * 24 * 60 * 60
        );
        await mockV3Aggregator0.updateAnswer(200000000);

        let phaseBefore = await intermediatePool.currentPhase();
        let priceRatioBefore = await intermediatePool.priceRatioShifted();
        await intermediatePool.triggerTransferPhase();
        let phaseAfter = await intermediatePool.currentPhase();
        let priceRatioAfter = await intermediatePool.priceRatioShifted();
        expect(phaseBefore).to.equal(1);
        expect(phaseAfter).to.equal(2);
        expect(priceRatioBefore).to.equal(0);
        expect(priceRatioAfter).to.be.equal(2147483648);
    });

    it('Trigger transfer phase fails when called too early', async () => {
        await expect(intermediatePool.triggerTransferPhase()).to.revertedWith(
            'Too early'
        );
    });

    it('Trigger transfer phase fails when called from wrong phase', async () => {
        await time.setNextBlockTimestamp(
            (await time.latest()) + 7 * 24 * 60 * 60
        );
        await intermediatePool.triggerTransferPhase();
        await expect(intermediatePool.triggerTransferPhase()).to.revertedWith(
            'Wrong phase'
        );
    });

    it('Deposit price ratio is updated', async () => {
        const amount0 = ethers.utils.parseEther('2');
        const amount1 = ethers.utils.parseEther('1');
        const priceBefore = (
            await intermediatePool.priceRatioShifted()
        ).toString();
        assert(priceBefore == '0');

        await intermediatePool.deposit(amount0, amount1, 2);
        const priceAfter = (
            await intermediatePool.priceRatioShifted()
        ).toString();
        assert(priceAfter > priceBefore);

        await mockV3Aggregator0.updateAnswer(175000000);
        await intermediatePool.deposit(amount0, amount1, 2);
        const priceAfter2 = (
            await intermediatePool.priceRatioShifted()
        ).toString();
        expect(priceAfter2 < priceAfter);
    });

    it('Deposit reverts if locking period index is invalid', async () => {
        const amount0 = ethers.utils.parseEther('2');
        const amount1 = ethers.utils.parseEther('1');
        await expect(
            intermediatePool.deposit(amount0, amount1, 4)
        ).to.revertedWith('Invalid locking period');
    });

    it('Deposit reverts if deposit time is over', async () => {
        await time.setNextBlockTimestamp(
            (await time.latest()) + 7 * 24 * 60 * 60
        );
        const amount0 = ethers.utils.parseEther('2');
        const amount1 = ethers.utils.parseEther('1');
        await expect(
            intermediatePool.deposit(amount0, amount1, 3)
        ).to.revertedWith('Deposits closed');
    });

    it('First time deposit creates index', async () => {
        const amount0 = ethers.utils.parseEther('10');
        const amount1 = ethers.utils.parseEther('10');
        const token0BalanceBefore = await token0.balanceOf(deployer.address);
        const token1BalanceBefore = await token1.balanceOf(deployer.address);
        const totalDepositsBefore = await intermediatePool.totalDeposits();
        const depositIndexBefore = await intermediatePool.depositIndexes(
            deployer.address
        );
        const indexToAddrBefore = await intermediatePool.indexToAddress(
            depositIndexBefore
        );
        const depositsBefore = await intermediatePool.deposits(1, 2, 0);
        await intermediatePool.deposit(amount0, amount1, 2);
        const token0BalanceAfter = await token0.balanceOf(deployer.address);
        const token1BalanceAfter = await token1.balanceOf(deployer.address);
        const totalDepositsAfter = await intermediatePool.totalDeposits();
        const depositIndexAfter = await intermediatePool.depositIndexes(
            deployer.address
        );
        const indexToAddrAfter = await intermediatePool.indexToAddress(
            depositIndexAfter
        );
        const depositsAfter = await intermediatePool.deposits(1, 2, 0);
        const amount0Expected = ethers.utils.parseEther('10');
        const amount1Expected = ethers.utils.parseEther('5');
        expect(token0BalanceBefore.sub(token0BalanceAfter)).equals(
            amount0Expected
        );
        expect(token1BalanceBefore.sub(token1BalanceAfter)).equals(
            amount1Expected
        );
        expect(totalDepositsBefore).equals(0);
        expect(totalDepositsAfter).equals(1);
        expect(depositIndexBefore).equals(0);
        expect(depositIndexAfter).equals(1);
        expect(indexToAddrBefore).equals(ethers.constants.AddressZero);
        expect(indexToAddrAfter).equals(deployer.address);
        expect(depositsBefore.toString()).equals('0,0');
        expect(depositsAfter.toString()).equals(
            `${ethers.utils.parseEther('10')},${ethers.utils.parseEther('5')}`
        );
    });

    it('Deposit with old user updates deposits', async () => {
        const amount0 = ethers.utils.parseEther('10');
        const amount1 = ethers.utils.parseEther('10');
        await intermediatePool.deposit(amount0, amount1, 2);

        const token0BalanceBefore = await token0.balanceOf(deployer.address);
        const token1BalanceBefore = await token1.balanceOf(deployer.address);
        const totalDepositsBefore = await intermediatePool.totalDeposits();
        const depositIndexBefore = await intermediatePool.depositIndexes(
            deployer.address
        );
        const indexToAddrBefore = await intermediatePool.indexToAddress(
            depositIndexBefore
        );
        const depositsBefore = await intermediatePool.deposits(1, 2, 0);
        await intermediatePool.deposit(amount0, amount1, 1);
        const token0BalanceAfter = await token0.balanceOf(deployer.address);
        const token1BalanceAfter = await token1.balanceOf(deployer.address);
        const totalDepositsAfter = await intermediatePool.totalDeposits();
        const depositIndexAfter = await intermediatePool.depositIndexes(
            deployer.address
        );
        const indexToAddrAfter = await intermediatePool.indexToAddress(
            depositIndexAfter
        );
        const depositsAfter = await intermediatePool.deposits(1, 1, 0);
        const amount0Expected = ethers.utils.parseEther('10');
        const amount1Expected = ethers.utils.parseEther('5');
        expect(token0BalanceBefore.sub(token0BalanceAfter)).equals(
            amount0Expected
        );
        expect(token1BalanceBefore.sub(token1BalanceAfter)).equals(
            amount1Expected
        );
        expect(totalDepositsBefore).equals(totalDepositsAfter);
        expect(depositIndexBefore).equals(depositIndexAfter).equals(1);
        expect(indexToAddrBefore).equals(indexToAddrAfter);
        expect(depositsBefore.toString()).equals(
            `${ethers.utils.parseEther('10')},${ethers.utils.parseEther('5')}`
        );
        expect(depositsAfter.toString()).equals(
            `${ethers.utils.parseEther('10')},${ethers.utils.parseEther('5')}`
        );
    });

    it('Deposit reverts if amount is zero', async () => {
        let amount0 = ethers.utils.parseEther('0');
        let amount1 = ethers.utils.parseEther('10');
        await expect(
            intermediatePool.deposit(amount0, amount1, 2)
        ).to.revertedWith('Insufficient amounts');
        await expect(
            intermediatePool.deposit(amount1, amount0, 2)
        ).to.revertedWith('Insufficient amounts');
        amount1 = ethers.utils.parseEther('0');
        await expect(
            intermediatePool.deposit(amount1, amount0, 2)
        ).to.revertedWith('Insufficient amounts');
    });

    it('Withdraw with penalty reverts if deposit time is over', async () => {
        await time.setNextBlockTimestamp(
            (await time.latest()) + 7 * 24 * 60 * 60
        );
        await expect(
            intermediatePool.withdrawWithPenalty(0, 0)
        ).to.revertedWith('Deposits closed');
    });

    it('Withdraw with penalty reverts if locking period index is wrong', async () => {
        await expect(
            intermediatePool.withdrawWithPenalty(4, 0)
        ).to.revertedWith('Invalid locking period');
    });

    it('Withdraw with penalty reverts if deposit day is wrong', async () => {
        await expect(
            intermediatePool.withdrawWithPenalty(3, 7)
        ).to.revertedWith('Invalid deposit day');
    });

    it('Withdraw with penalty reverts if deposit is zero', async () => {
        await time.setNextBlockTimestamp(
            (await time.latest()) + 5 * 24 * 60 * 60
        );
        await expect(
            intermediatePool.withdrawWithPenalty(3, 0)
        ).to.revertedWith('No deposit');
    });

    it('Withdraw with penalty works', async () => {
        await time.setNextBlockTimestamp(
            (await time.latest()) + 5 * 24 * 60 * 60
        );
        const amount0 = ethers.utils.parseEther('10');
        const amount1 = ethers.utils.parseEther('5');
        await intermediatePool.deposit(amount0, amount1, 0);

        const depositBefore = await intermediatePool.deposits(1, 0, 5);
        const token0BalanceBefore = await token0.balanceOf(deployer.address);
        const token1BalanceBefore = await token1.balanceOf(deployer.address);
        const penaltiesBefore = await intermediatePool.penalties();
        await intermediatePool.withdrawWithPenalty(0, 5);
        const penaltiesAfter = await intermediatePool.penalties();
        const token0BalanceAfter = await token0.balanceOf(deployer.address);
        const token1BalanceAfter = await token1.balanceOf(deployer.address);
        const depositAfter = await intermediatePool.deposits(1, 0, 5);
        expect(depositBefore.toString()).equals(`${amount0},${amount1}`);
        expect(depositAfter.toString()).equals('0,0');
        expect(penaltiesBefore.toString()).equals('0,0');
        expect(token0BalanceAfter).to.be.above(token0BalanceBefore);
        expect(token1BalanceAfter).to.be.above(token1BalanceBefore);
        expect(
            token0BalanceAfter.sub(token0BalanceBefore).add(penaltiesAfter[0])
        ).equals(amount0);
        expect(
            token1BalanceAfter.sub(token1BalanceBefore).add(penaltiesAfter[1])
        ).equals(amount1);
    });
});

describe('vIntermediatePool: Phase 2', function () {
    let intermediatePoolFactory: VIntermediatePoolFactory;
    let intermediatePool: VIntermediatePool;
    let mockUniswapOracle: MockStaticOracle;
    let mockV3Aggregator0: MockV3Aggregator;
    let mockV3Aggregator1: MockV3Aggregator;
    let mockVPairFactory: MockVPairFactory;
    let token0: Token0;
    let token1: Token1;
    let accounts;

    beforeEach(async () => {
        accounts = await ethers.getSigners();
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
        await intermediatePoolFactory.createIntermediatePool(
            token0.address,
            token1.address,
            mockUniswapOracle.address,
            mockV3Aggregator0.address,
            mockV3Aggregator1.address,
            await time.latest(),
            vrswAllocated
        );
        const intermediatePoolAddress =
            await intermediatePoolFactory.getIntermediatePool(
                token0.address,
                token1.address
            );
        const factory = await ethers.getContractFactory('vIntermediatePool');
        intermediatePool = factory.attach(
            intermediatePoolAddress
        ) as VIntermediatePool;

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
                .deposit(amount0, amount1, 0);
        }
        await intermediatePool.deposit(amount0, amount1, 1);
        await intermediatePool.deposit(amount0, amount1, 2);
        await intermediatePool.deposit(amount0, amount1, 3);
        await intermediatePool
            .connect(accounts[2])
            .deposit(amount0, amount1, 2);
        await intermediatePool
            .connect(accounts[1])
            .deposit(amount0, amount1, 3);
        await time.setNextBlockTimestamp(
            (await time.latest()) + 7 * 24 * 60 * 60
        );
        await intermediatePool.triggerTransferPhase();
    });

    it('Transfer all deposits in 1 transaction', async () => {
        const totalDepositsBefore = await intermediatePool.totalDeposits();
        const depositBefore = await intermediatePool.deposits(1, 0, 0);
        const tokensTransferredBefore =
            await intermediatePool.tokensTransferred0(1, 0, 0);
        const totalTransferredBefore =
            await intermediatePool.totalTransferred0();
        const totalTransferredWithBonusBefore =
            await intermediatePool.totalTransferredWithBonusX10000();
        await intermediatePool.transferToRealPool(totalDepositsBefore);
        const tokensTransferredAfter =
            await intermediatePool.tokensTransferred0(1, 0, 0);
        const depositAfter = await intermediatePool.deposits(1, 0, 0);
        const totalTransferredAfter =
            await intermediatePool.totalTransferred0();
        const totalTransferredWithBonusAfter =
            await intermediatePool.totalTransferredWithBonusX10000();

        expect(totalTransferredWithBonusBefore).to.be.below(
            totalTransferredWithBonusAfter
        );
        expect(totalTransferredWithBonusBefore).equals(0);
        expect(totalTransferredBefore).to.be.below(totalTransferredAfter);
        expect(totalTransferredBefore).equals(0);
        expect(tokensTransferredBefore).to.be.below(tokensTransferredAfter);
        // leftovers
        expect(depositAfter.toString()).equals('0,0');
        expect(depositAfter.toString()).not.equals(depositBefore.toString());
        // all tokens were transferred
        expect(await token0.balanceOf(intermediatePool.address)).to.equal(0);
        expect(await token1.balanceOf(intermediatePool.address)).to.equal(0);
        // phase transition happened
        expect(await intermediatePool.currentPhase()).to.equal(3);
        // lp tokens were received
        expect(await intermediatePool.totalLpTokens()).to.equal(100);
    });

    it('Transfer all deposits in 3 transactions', async () => {
        let totalDeposits = await intermediatePool.totalDeposits();
        await intermediatePool.transferToRealPool(6);
        totalDeposits = totalDeposits.sub(ethers.BigNumber.from('6'));
        await intermediatePool.transferToRealPool(10);
        totalDeposits = totalDeposits.sub(ethers.BigNumber.from('10'));
        await intermediatePool.transferToRealPool(totalDeposits);
        // all tokens were transferred
        expect(await token0.balanceOf(intermediatePool.address)).to.equal(0);
        expect(await token1.balanceOf(intermediatePool.address)).to.equal(0);
        // phase transition happened
        expect(await intermediatePool.currentPhase()).to.equal(3);
        // lp tokens were received
        expect(await intermediatePool.totalLpTokens()).to.equal(300);
    });

    it('Transfer to real pool reverts if transfers number is zero', async () => {
        await expect(intermediatePool.transferToRealPool(0)).to.revertedWith(
            'Invalid transfers number'
        );
    });

    it('Transfer to real pool reverts if wrong phase', async () => {
        await intermediatePool.emergencyStop();
        await intermediatePool.emergencyResume('1');
        await expect(intermediatePool.transferToRealPool(0)).to.revertedWith(
            'Wrong phase'
        );
    });
});

describe('vIntermediatePool: Phase 3', function () {
    let intermediatePoolFactory: VIntermediatePoolFactory;
    let intermediatePool: VIntermediatePool;
    let mockUniswapOracle: MockStaticOracle;
    let mockV3Aggregator0: MockV3Aggregator;
    let mockV3Aggregator1: MockV3Aggregator;
    let mockVPairFactory: MockVPairFactory;
    let token0: Token0;
    let token1: Token1;
    let vrswToken: MockVrswToken;
    let deployer: SignerWithAddress;
    let accounts: SignerWithAddress[];
    let pair: MockVPair;

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
        await intermediatePoolFactory.createIntermediatePool(
            token0.address,
            token1.address,
            mockUniswapOracle.address,
            mockV3Aggregator0.address,
            mockV3Aggregator1.address,
            await time.latest(),
            vrswAllocated
        );
        const intermediatePoolAddress =
            await intermediatePoolFactory.getIntermediatePool(
                token0.address,
                token1.address
            );
        const factory = await ethers.getContractFactory('vIntermediatePool');
        intermediatePool = factory.attach(
            intermediatePoolAddress
        ) as VIntermediatePool;

        pair = (await ethers.getContractFactory('MockVPair')).attach(
            await mockVPairFactory.getPair(token0.address, token1.address)
        ) as MockVPair;

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
                .deposit(amount0, amount1, 1);
        }

        await intermediatePool.deposit(amount0, amount1, 0);
        await intermediatePool.deposit(amount0, amount1, 1);
        await intermediatePool.deposit(amount0, amount1, 2);
        await intermediatePool.deposit(amount0, amount1, 3);
        await intermediatePool
            .connect(accounts[2])
            .deposit(amount0, amount1, 2);
        await intermediatePool
            .connect(accounts[1])
            .deposit(amount0, amount1, 1);
        await time.setNextBlockTimestamp(
            (await time.latest()) + 7 * 24 * 60 * 60
        );
        // final price
        await mockV3Aggregator0.updateAnswer(200000000);
        await intermediatePool.triggerTransferPhase();
        // transfer phase
        await intermediatePool.transferToRealPool(
            await intermediatePool.totalDeposits()
        );
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
        expect(leftoversAfter.split(',').every((item) => item == '0'));
        expect(leftoversBefore.split(',').some((item) => item != '0'));
        expect(balanceAfter).to.be.above(balanceBefore);
        expect(vrswAfter).to.be.equal('0');
        expect(vrswBefore).to.be.above('0');
    });

    it('Claim leftovers twice', async () => {
        await intermediatePool.claimLeftovers(deployer.address);
        await expect(
            intermediatePool.claimLeftovers(deployer.address)
        ).to.revertedWith('Already claimed');
    });

    it('Withdraw lp tokens for myself', async () => {
        const lpTokensBefore = await pair.balanceOf(deployer.address);
        await expect(
            intermediatePool.withdrawLpTokens(deployer.address, 1)
        ).to.revertedWith('Too early');
        const lpTokensAfter1 = await pair.balanceOf(deployer.address);

        // nothing is withdrawn because of locking
        expect(lpTokensAfter1).to.equal(lpTokensBefore);

        // 4 weeks passed
        await time.setNextBlockTimestamp(
            (await time.latest()) + 4 * 7 * 24 * 60 * 60
        );

        await intermediatePool.withdrawLpTokens(deployer.address, 1);
        await intermediatePool.withdrawLpTokens(deployer.address, 2);
        await expect(
            intermediatePool.withdrawLpTokens(deployer.address, 3)
        ).to.revertedWith('Too early');
        const lpTokensAfter2 = await pair.balanceOf(deployer.address);
        // only 4-weeks tokens are withdrawn
        expect(lpTokensAfter2).to.be.above(lpTokensAfter1);

        // another 4 weeks passed
        await time.setNextBlockTimestamp(
            (await time.latest()) + 4 * 7 * 24 * 60 * 60
        );

        await intermediatePool.withdrawLpTokens(deployer.address, 0);
        const lpTokensAfter3 = await pair.balanceOf(deployer.address);
        // all lp tokens are withdrawn
        expect(lpTokensAfter3).to.be.above(lpTokensAfter2);
        await intermediatePool.withdrawLpTokens(deployer.address, 3);
        const lpTokensAfter = await pair.balanceOf(deployer.address);
        expect(lpTokensAfter).to.be.above(lpTokensBefore);
    });

    it('Withdraw lp tokens twice', async () => {
        await time.setNextBlockTimestamp(
            (await time.latest()) + 8 * 7 * 24 * 60 * 60
        );
        await intermediatePool.withdrawLpTokens(deployer.address, 0);
        await intermediatePool.withdrawLpTokens(deployer.address, 1);
        await intermediatePool.withdrawLpTokens(deployer.address, 2);
        await intermediatePool.withdrawLpTokens(deployer.address, 3);
        await expect(
            intermediatePool.withdrawLpTokens(deployer.address, 0)
        ).to.revertedWith('Already withdrawn');
    });

    it('Withdraw all lp tokens', async () => {
        await time.setNextBlockTimestamp(
            (await time.latest()) + 8 * 7 * 24 * 60 * 60
        );
        for (const account of accounts) {
            await intermediatePool.withdrawLpTokens(account.address, 0);
            await intermediatePool.withdrawLpTokens(account.address, 1);
            await intermediatePool.withdrawLpTokens(account.address, 2);
            await intermediatePool.withdrawLpTokens(account.address, 3);
        }
        // small leftovers because of rounding
        console.log(
            `lp tokens left in the pool ${(
                await pair.balanceOf(intermediatePool.address)
            ).toString()}`
        );
        expect(await pair.balanceOf(intermediatePool.address)).to.be.below(30);
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

describe('vIntermediatePool: emergency', function () {
    let intermediatePoolFactory: VIntermediatePoolFactory;
    let intermediatePool: VIntermediatePool;
    let mockUniswapOracle: MockStaticOracle;
    let mockV3Aggregator0: MockV3Aggregator;
    let mockV3Aggregator1: MockV3Aggregator;
    let mockVPairFactory: MockVPairFactory;
    let token0: Token0;
    let token1: Token1;
    let vrswToken: MockVrswToken;
    let accounts: SignerWithAddress[];
    let pair: MockVPair;

    before(async () => {
        accounts = await ethers.getSigners();
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
        await intermediatePoolFactory.createIntermediatePool(
            token0.address,
            token1.address,
            mockUniswapOracle.address,
            mockV3Aggregator0.address,
            mockV3Aggregator1.address,
            await time.latest(),
            vrswAllocated
        );
        const intermediatePoolAddress =
            await intermediatePoolFactory.getIntermediatePool(
                token0.address,
                token1.address
            );
        const factory = await ethers.getContractFactory('vIntermediatePool');
        intermediatePool = factory.attach(
            intermediatePoolAddress
        ) as VIntermediatePool;

        pair = (await ethers.getContractFactory('MockVPair')).attach(
            await mockVPairFactory.getPair(token0.address, token1.address)
        ) as MockVPair;

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
                .deposit(amount0, amount1, 1);
        }

        await intermediatePool.deposit(amount0, amount1, 3);
        await intermediatePool
            .connect(accounts[2])
            .deposit(amount0, amount1, 2);
        await intermediatePool
            .connect(accounts[1])
            .deposit(amount0, amount1, 1);
        await time.setNextBlockTimestamp(
            (await time.latest()) + 7 * 24 * 60 * 60
        );
        // final price
        await mockV3Aggregator0.updateAnswer(200000000);
        await intermediatePool.triggerTransferPhase();
        // transfer phase
        await intermediatePool.transferToRealPool(3);
    });

    it('Emergency stop can be called only by admin', async () => {
        expect((await intermediatePool.currentPhase()).toString()).to.not.equal(
            '4'
        );
        await expect(
            intermediatePool.connect(accounts[1]).emergencyStop()
        ).to.revertedWith('Admin only');
    });

    it('Emergency stop works', async () => {
        expect((await intermediatePool.currentPhase()).toString()).to.not.equal(
            '4'
        );
        await intermediatePool.emergencyStop();
        expect((await intermediatePool.currentPhase()).toString()).to.equal(
            '4'
        );
    });

    it('Emergency resume can be called only by admin', async () => {
        expect((await intermediatePool.currentPhase()).toString()).to.equal(
            '4'
        );
        await expect(
            intermediatePool.connect(accounts[1]).emergencyResume('2')
        ).to.revertedWith('Admin only');
    });

    it('Emergency resume works', async () => {
        await intermediatePool.emergencyResume('3');
        expect((await intermediatePool.currentPhase()).toString()).to.equal(
            '3'
        );
    });

    it('EmergencyRescueFunds can be called only by admin', async () => {
        await intermediatePool.emergencyStop();
        await expect(
            intermediatePool.connect(accounts[1]).emergencyRescueFunds()
        ).to.revertedWith('Admin only');
    });

    it('EmergencyRescueFunds works', async () => {
        await intermediatePool.emergencyRescueFunds();
        const lpTokensAfter = await pair.balanceOf(intermediatePool.address);
        const vrswTokensAfter = await vrswToken.balanceOf(
            intermediatePool.address
        );
        const token0After = await token0.balanceOf(intermediatePool.address);
        const token1After = await token1.balanceOf(intermediatePool.address);
        expect(lpTokensAfter).to.be.equal('0');
        expect(vrswTokensAfter).to.be.equal('0');
        expect(token0After).to.be.equal('0');
        expect(token1After).to.be.equal('0');
    });
});
