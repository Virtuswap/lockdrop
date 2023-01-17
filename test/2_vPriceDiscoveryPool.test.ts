import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { assert, expect } from 'chai';
import { deployments, ethers } from 'hardhat';
import {
    VPriceDiscoveryPool,
    VPriceDiscoveryPoolFactory,
    MockVPairFactory,
    MockVPair,
    MockVrswToken,
    Token0,
    Token1,
} from '../typechain-types';
import { time } from '@nomicfoundation/hardhat-network-helpers';

describe('vPriceDiscoveryPool: Prerequisites', function () {
    let priceDiscoveryPoolFactory: VPriceDiscoveryPoolFactory;
    let priceDiscoveryPool: VPriceDiscoveryPool;
    let mockVPairFactory: MockVPairFactory;
    let token0: Token0;
    let token1: Token1;
    const totalVrswAllocated = '1000000000000000000000';

    beforeEach(async () => {
        await deployments.fixture(['all']);
        priceDiscoveryPoolFactory = await ethers.getContract(
            'priceDiscoveryPoolFactory'
        );
        mockVPairFactory = await ethers.getContract('MockVPairFactory');
        token0 = await ethers.getContract('Token0');
        token1 = await ethers.getContract('Token1');
        await mockVPairFactory.createPair(token0.address, token1.address);
    });

    it('Trigger deposit phase works', async () => {
        await priceDiscoveryPoolFactory.createPriceDiscoveryPool(
            token0.address,
            token1.address,
            (await time.latest()) + 1,
            totalVrswAllocated
        );
        const priceDiscoveryPoolAddress =
            await priceDiscoveryPoolFactory.getPriceDiscoveryPool(
                token0.address,
                token1.address
            );
        const factory = await ethers.getContractFactory('vPriceDiscoveryPool');
        priceDiscoveryPool = factory.attach(
            priceDiscoveryPoolAddress
        ) as VPriceDiscoveryPool;

        let phaseBefore = await priceDiscoveryPool.currentPhase();
        await priceDiscoveryPool.triggerDepositPhase();
        let phaseAfter = await priceDiscoveryPool.currentPhase();
        expect(phaseBefore).to.equal(0);
        expect(phaseAfter).to.equal(1);
    });

    it('Trigger deposit phase fails when called from wrong phase', async () => {
        await priceDiscoveryPoolFactory.createPriceDiscoveryPool(
            token0.address,
            token1.address,
            await time.latest(),
            totalVrswAllocated
        );
        const priceDiscoveryPoolAddress =
            await priceDiscoveryPoolFactory.getPriceDiscoveryPool(
                token0.address,
                token1.address
            );
        const factory = await ethers.getContractFactory('vPriceDiscoveryPool');
        priceDiscoveryPool = factory.attach(
            priceDiscoveryPoolAddress
        ) as VPriceDiscoveryPool;

        await priceDiscoveryPool.triggerDepositPhase();
        await expect(priceDiscoveryPool.triggerDepositPhase()).to.revertedWith(
            'Wrong phase'
        );
    });

    it('Trigger deposit phase fails when called too early', async () => {
        await priceDiscoveryPoolFactory.createPriceDiscoveryPool(
            token0.address,
            token1.address,
            (await time.latest()) + 3,
            totalVrswAllocated
        );
        const priceDiscoveryPoolAddress =
            await priceDiscoveryPoolFactory.getPriceDiscoveryPool(
                token0.address,
                token1.address
            );
        const factory = await ethers.getContractFactory('vPriceDiscoveryPool');
        priceDiscoveryPool = factory.attach(
            priceDiscoveryPoolAddress
        ) as VPriceDiscoveryPool;

        await expect(priceDiscoveryPool.triggerDepositPhase()).to.revertedWith(
            'Too early'
        );
    });
});

describe('vPriceDiscoveryPool: Phase 1', function () {
    let priceDiscoveryPoolFactory: VPriceDiscoveryPoolFactory;
    let priceDiscoveryPool: VPriceDiscoveryPool;
    let mockVPairFactory: MockVPairFactory;
    let token0: Token0;
    let token1: Token1;
    let deployer: SignerWithAddress;
    const totalVrswAllocated = '1000000000000000000000';

    beforeEach(async () => {
        const accounts = await ethers.getSigners();
        deployer = accounts[0];
        await deployments.fixture(['all']);
        priceDiscoveryPoolFactory = await ethers.getContract(
            'priceDiscoveryPoolFactory'
        );
        mockVPairFactory = await ethers.getContract('MockVPairFactory');
        token0 = await ethers.getContract('Token0');
        token1 = await ethers.getContract('Token1');
        await mockVPairFactory.createPair(token0.address, token1.address);

        await priceDiscoveryPoolFactory.createPriceDiscoveryPool(
            token0.address,
            token1.address,
            await time.latest(),
            totalVrswAllocated
        );
        const priceDiscoveryPoolAddress =
            await priceDiscoveryPoolFactory.getPriceDiscoveryPool(
                token0.address,
                token1.address
            );
        const factory = await ethers.getContractFactory('vPriceDiscoveryPool');
        priceDiscoveryPool = factory.attach(
            priceDiscoveryPoolAddress
        ) as VPriceDiscoveryPool;
        await priceDiscoveryPool.triggerDepositPhase();
        await token0.approve(
            priceDiscoveryPool.address,
            ethers.utils.parseEther('1000')
        );
        await token1.approve(
            priceDiscoveryPool.address,
            ethers.utils.parseEther('1000')
        );
    });

    it('Deposit works', async () => {
        const amount0 = ethers.utils.parseEther('1');
        const balanceBefore0 = await token0.balanceOf(
            priceDiscoveryPool.address
        );
        const vrswDepositBefore = await priceDiscoveryPool.vrswDeposits(
            deployer.address,
            0
        );
        await priceDiscoveryPool.deposit(token0.address, amount0);
        const vrswDepositAfter = await priceDiscoveryPool.vrswDeposits(
            deployer.address,
            0
        );
        const balanceAfter0 = await token0.balanceOf(
            priceDiscoveryPool.address
        );
        const amount1 = ethers.utils.parseEther('5');
        const balanceBefore1 = await token1.balanceOf(
            priceDiscoveryPool.address
        );
        const opponentDepositBefore = await priceDiscoveryPool.opponentDeposits(
            deployer.address,
            0
        );
        await priceDiscoveryPool.deposit(token1.address, amount1);
        const opponentDepositAfter = await priceDiscoveryPool.opponentDeposits(
            deployer.address,
            0
        );
        const balanceAfter1 = await token1.balanceOf(
            priceDiscoveryPool.address
        );
        expect(opponentDepositAfter).to.be.above(opponentDepositBefore);
        expect(vrswDepositAfter).to.be.above(vrswDepositBefore);
        expect(balanceBefore0).to.be.below(balanceAfter0);
        expect(balanceBefore1).to.be.below(balanceAfter1);
    });

    it('Deposit reverts if amount is zero', async () => {
        let amount = ethers.utils.parseEther('0');
        await expect(
            priceDiscoveryPool.deposit(token0.address, amount)
        ).to.revertedWith('Insufficient amount');
    });

    it('Deposit reverts if wrong token', async () => {
        let amount = ethers.utils.parseEther('1');
        await expect(
            priceDiscoveryPool.deposit(deployer.address, amount)
        ).to.revertedWith('Invalid token');
    });

    it('Deposit VRSW reverts if time is over', async () => {
        await time.setNextBlockTimestamp(
            (await time.latest()) + 5 * 24 * 60 * 60
        );
        let amount = ethers.utils.parseEther('1');
        await expect(
            priceDiscoveryPool.deposit(token0.address, amount)
        ).to.revertedWith('VRSW deposits closed');
    });

    it('Deposit opponent token reverts if time is over', async () => {
        await time.setNextBlockTimestamp(
            (await time.latest()) + 7 * 24 * 60 * 60
        );
        let amount = ethers.utils.parseEther('1');
        await expect(
            priceDiscoveryPool.deposit(token1.address, amount)
        ).to.revertedWith('Deposits closed');
    });

    it('Withdraw with penalty reverts if wrong token', async () => {
        let amount = ethers.utils.parseEther('1');
        await expect(
            priceDiscoveryPool.withdrawWithPenalty(deployer.address, amount, 0)
        ).to.revertedWith('Invalid token');
    });

    it('Withdraw with penalty reverts if time is over', async () => {
        await time.setNextBlockTimestamp(
            (await time.latest()) + 7 * 24 * 60 * 60
        );
        let amount = ethers.utils.parseEther('1');
        await expect(
            priceDiscoveryPool.withdrawWithPenalty(token1.address, amount, 0)
        ).to.revertedWith('Deposits closed');
    });

    it('Withdraw with penalty reverts if amount is zero', async () => {
        let amount = ethers.utils.parseEther('0');
        await expect(
            priceDiscoveryPool.withdrawWithPenalty(token1.address, amount, 0)
        ).to.revertedWith('Insufficient amount');
    });

    it('Withdraw with penalty works', async () => {
        await time.setNextBlockTimestamp(
            (await time.latest()) + 4 * 24 * 60 * 60
        );
        let amount = ethers.utils.parseEther('2');
        await priceDiscoveryPool.deposit(token0.address, amount);
        await priceDiscoveryPool.deposit(token1.address, amount);
        const penaltiesBefore = await priceDiscoveryPool.penalties();
        const balance0Before = await token0.balanceOf(deployer.address);
        const balance1Before = await token1.balanceOf(deployer.address);
        const deposit0Before = await priceDiscoveryPool.vrswDeposits(
            deployer.address,
            4
        );
        const deposit1Before = await priceDiscoveryPool.opponentDeposits(
            deployer.address,
            4
        );
        await priceDiscoveryPool.withdrawWithPenalty(token0.address, amount, 4);
        await priceDiscoveryPool.withdrawWithPenalty(token1.address, amount, 4);
        const penaltiesAfter = await priceDiscoveryPool.penalties();
        const balance0After = await token0.balanceOf(deployer.address);
        const balance1After = await token1.balanceOf(deployer.address);
        const deposit0After = await priceDiscoveryPool.vrswDeposits(
            deployer.address,
            4
        );
        const deposit1After = await priceDiscoveryPool.opponentDeposits(
            deployer.address,
            4
        );
        expect(penaltiesBefore).equals(0);
        expect(penaltiesAfter).to.be.above(penaltiesBefore);
        expect(balance0Before).to.be.below(balance0After);
        expect(balance1Before).to.be.below(balance1After);
        expect(deposit0Before).to.be.above(deposit0After);
        expect(deposit1Before).to.be.above(deposit1After);
    });
});

describe('vPriceDiscoveryPool: Phase 2', function () {
    let priceDiscoveryPoolFactory: VPriceDiscoveryPoolFactory;
    let priceDiscoveryPool: VPriceDiscoveryPool;
    let mockVPairFactory: MockVPairFactory;
    let token0: Token0;
    let token1: Token1;
    let accounts;
    const totalVrswAllocated = '1000000000000000000000';

    beforeEach(async () => {
        accounts = await ethers.getSigners();
        await deployments.fixture(['all']);
        priceDiscoveryPoolFactory = await ethers.getContract(
            'priceDiscoveryPoolFactory'
        );
        mockVPairFactory = await ethers.getContract('MockVPairFactory');
        token0 = await ethers.getContract('Token0');
        token1 = await ethers.getContract('Token1');
        await mockVPairFactory.createPair(token0.address, token1.address);
        await priceDiscoveryPoolFactory.createPriceDiscoveryPool(
            token0.address,
            token1.address,
            await time.latest(),
            totalVrswAllocated
        );
        const priceDiscoveryPoolAddress =
            await priceDiscoveryPoolFactory.getPriceDiscoveryPool(
                token0.address,
                token1.address
            );
        const factory = await ethers.getContractFactory('vPriceDiscoveryPool');
        priceDiscoveryPool = factory.attach(
            priceDiscoveryPoolAddress
        ) as VPriceDiscoveryPool;

        await priceDiscoveryPool.triggerDepositPhase();
        await token0.approve(
            priceDiscoveryPool.address,
            ethers.utils.parseEther('1000')
        );
        await token1.approve(
            priceDiscoveryPool.address,
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
                    priceDiscoveryPool.address,
                    ethers.utils.parseEther('1000')
                );
            await token1
                .connect(account)
                .approve(
                    priceDiscoveryPool.address,
                    ethers.utils.parseEther('1000')
                );
            amount0 = amount0.add(ethers.utils.parseEther('10'));
            amount1 = amount1.add(ethers.utils.parseEther('10'));
            await priceDiscoveryPool
                .connect(account)
                .deposit(token0.address, amount0);
            await priceDiscoveryPool
                .connect(account)
                .deposit(token1.address, amount1);
        }
        await time.setNextBlockTimestamp(
            (await time.latest()) + 7 * 24 * 60 * 60
        );
        await priceDiscoveryPool.triggerTransferPhase();
    });

    it('Transfer to real pool works', async () => {
        assert(!(await token0.balanceOf(priceDiscoveryPool.address)).isZero());
        assert(!(await token1.balanceOf(priceDiscoveryPool.address)).isZero());
        await priceDiscoveryPool.transferToRealPool();
        // all tokens were transferred
        expect(await token0.balanceOf(priceDiscoveryPool.address)).to.equal(0);
        expect(await token1.balanceOf(priceDiscoveryPool.address)).to.equal(0);
        // phase transition happened
        expect(await priceDiscoveryPool.currentPhase()).to.equal(3);
        // lp tokens were received
        expect(await priceDiscoveryPool.totalLpTokens()).to.equal(100);
    });
});

describe('vPriceDiscoveryPool: Phase 3', function () {
    let priceDiscoveryPoolFactory: VPriceDiscoveryPoolFactory;
    let priceDiscoveryPool: VPriceDiscoveryPool;
    let mockVPairFactory: MockVPairFactory;
    let token0: Token0;
    let token1: Token1;
    let deployer: SignerWithAddress;
    let accounts: SignerWithAddress[];
    let pair: MockVPair;
    const totalVrswAllocated = '1000000000000000000000';

    beforeEach(async () => {
        accounts = await ethers.getSigners();
        deployer = accounts[0];
        await deployments.fixture(['all']);
        priceDiscoveryPoolFactory = await ethers.getContract(
            'priceDiscoveryPoolFactory'
        );
        mockVPairFactory = await ethers.getContract('MockVPairFactory');
        token0 = await ethers.getContract('Token0');
        token1 = await ethers.getContract('Token1');
        await mockVPairFactory.createPair(token0.address, token1.address);
        await priceDiscoveryPoolFactory.createPriceDiscoveryPool(
            token0.address,
            token1.address,
            await time.latest(),
            totalVrswAllocated
        );
        const priceDiscoveryPoolAddress =
            await priceDiscoveryPoolFactory.getPriceDiscoveryPool(
                token0.address,
                token1.address
            );
        const factory = await ethers.getContractFactory('vPriceDiscoveryPool');
        priceDiscoveryPool = factory.attach(
            priceDiscoveryPoolAddress
        ) as VPriceDiscoveryPool;

        pair = (await ethers.getContractFactory('MockVPair')).attach(
            await mockVPairFactory.getPair(token0.address, token1.address)
        ) as MockVPair;

        await priceDiscoveryPool.triggerDepositPhase();
        await token0.approve(
            priceDiscoveryPool.address,
            ethers.utils.parseEther('1000')
        );
        await token1.approve(
            priceDiscoveryPool.address,
            ethers.utils.parseEther('1000')
        );
        // Deposit phase

        let amount0 = ethers.utils.parseEther('10');
        let amount1 = ethers.utils.parseEther('10');
        // induce leftovers
        for (const account of accounts) {
            await token0.mint(account.address, ethers.utils.parseEther('1000'));
            await token1.mint(account.address, ethers.utils.parseEther('1000'));
            await token0
                .connect(account)
                .approve(
                    priceDiscoveryPool.address,
                    ethers.utils.parseEther('1000')
                );
            await token1
                .connect(account)
                .approve(
                    priceDiscoveryPool.address,
                    ethers.utils.parseEther('1000')
                );

            await priceDiscoveryPool
                .connect(account)
                .deposit(token0.address, amount0);
            await priceDiscoveryPool
                .connect(account)
                .deposit(token1.address, amount1);
        }

        await time.setNextBlockTimestamp(
            (await time.latest()) + 7 * 7 * 24 * 60 * 60
        );
        // final price
        await priceDiscoveryPool.triggerTransferPhase();
        // transfer phase
        await priceDiscoveryPool.transferToRealPool();
    });

    it('Withdraw lp tokens for myself', async () => {
        await time.setNextBlockTimestamp(
            (await time.latest()) + 7 * 24 * 60 * 60
        );
        const lpTokensBefore = await pair.balanceOf(deployer.address);
        await priceDiscoveryPool.withdrawLpTokens(deployer.address);
        const lpTokensAfter = await pair.balanceOf(deployer.address);

        expect(lpTokensAfter).to.above(lpTokensBefore);
    });

    it('Withdraw lp tokens twice', async () => {
        await time.setNextBlockTimestamp(
            (await time.latest()) + 8 * 7 * 24 * 60 * 60
        );
        await priceDiscoveryPool.withdrawLpTokens(deployer.address);
        await expect(
            priceDiscoveryPool.withdrawLpTokens(deployer.address)
        ).to.revertedWith('Already withdrawn');
    });

    it('Withdraw all lp tokens tokens', async () => {
        await time.setNextBlockTimestamp(
            (await time.latest()) + 8 * 7 * 24 * 60 * 60
        );
        for (const account of accounts) {
            await priceDiscoveryPool.withdrawLpTokens(account.address);
        }
        // small leftovers because of rounding
        expect(await pair.balanceOf(priceDiscoveryPool.address)).to.be.below(
            20
        );
    });
});

describe('vPriceDiscoveryPool: emergency', function () {
    let priceDiscoveryPoolFactory: VPriceDiscoveryPoolFactory;
    let priceDiscoveryPool: VPriceDiscoveryPool;
    let mockVPairFactory: MockVPairFactory;
    let token0: Token0;
    let token1: Token1;
    let vrswToken: MockVrswToken;
    let accounts: SignerWithAddress[];
    let pair: MockVPair;
    const totalVrswAllocated = '1000000000000000000000';

    before(async () => {
        accounts = await ethers.getSigners();
        await deployments.fixture(['all']);
        priceDiscoveryPoolFactory = await ethers.getContract(
            'priceDiscoveryPoolFactory'
        );
        mockVPairFactory = await ethers.getContract('MockVPairFactory');
        token0 = await ethers.getContract('Token0');
        token1 = await ethers.getContract('Token1');
        vrswToken = await ethers.getContract('MockVrswToken');
        await mockVPairFactory.createPair(token0.address, token1.address);
        await priceDiscoveryPoolFactory.createPriceDiscoveryPool(
            token0.address,
            token1.address,
            await time.latest(),
            totalVrswAllocated
        );
        const priceDiscoveryPoolAddress =
            await priceDiscoveryPoolFactory.getPriceDiscoveryPool(
                token0.address,
                token1.address
            );
        const factory = await ethers.getContractFactory('vPriceDiscoveryPool');
        priceDiscoveryPool = factory.attach(
            priceDiscoveryPoolAddress
        ) as VPriceDiscoveryPool;

        pair = (await ethers.getContractFactory('MockVPair')).attach(
            await mockVPairFactory.getPair(token0.address, token1.address)
        ) as MockVPair;

        await priceDiscoveryPool.triggerDepositPhase();
        await token0.approve(
            priceDiscoveryPool.address,
            ethers.utils.parseEther('1000')
        );
        await token1.approve(
            priceDiscoveryPool.address,
            ethers.utils.parseEther('1000')
        );
        // Deposit phase

        let amount0 = ethers.utils.parseEther('10');
        let amount1 = ethers.utils.parseEther('10');
        // induce leftovers
        for (const account of accounts) {
            await token0.mint(account.address, ethers.utils.parseEther('1000'));
            await token1.mint(account.address, ethers.utils.parseEther('1000'));
            await token0
                .connect(account)
                .approve(
                    priceDiscoveryPool.address,
                    ethers.utils.parseEther('1000')
                );
            await token1
                .connect(account)
                .approve(
                    priceDiscoveryPool.address,
                    ethers.utils.parseEther('1000')
                );

            await priceDiscoveryPool
                .connect(account)
                .deposit(token0.address, amount0);
            await priceDiscoveryPool
                .connect(account)
                .deposit(token1.address, amount1);
        }

        await time.setNextBlockTimestamp(
            (await time.latest()) + 7 * 24 * 60 * 60
        );
        // final price
        await priceDiscoveryPool.triggerTransferPhase();
        // transfer phase
        await priceDiscoveryPool.transferToRealPool();
    });

    it('Emergency stop can be called only by admin', async () => {
        expect(
            (await priceDiscoveryPool.currentPhase()).toString()
        ).to.not.equal('4');
        await expect(
            priceDiscoveryPool.connect(accounts[1]).emergencyStop()
        ).to.revertedWith('Admin only');
    });

    it('Emergency stop works', async () => {
        expect(
            (await priceDiscoveryPool.currentPhase()).toString()
        ).to.not.equal('4');
        await priceDiscoveryPool.emergencyStop();
        expect((await priceDiscoveryPool.currentPhase()).toString()).to.equal(
            '4'
        );
    });

    it('Emergency resume can be called only by admin', async () => {
        expect((await priceDiscoveryPool.currentPhase()).toString()).to.equal(
            '4'
        );
        await expect(
            priceDiscoveryPool.connect(accounts[1]).emergencyResume('2')
        ).to.revertedWith('Admin only');
    });

    it('Emergency resume works', async () => {
        await priceDiscoveryPool.emergencyResume('3');
        expect((await priceDiscoveryPool.currentPhase()).toString()).to.equal(
            '3'
        );
    });

    it('EmergencyRescueFunds can be called only by admin', async () => {
        await priceDiscoveryPool.emergencyStop();
        await expect(
            priceDiscoveryPool.connect(accounts[1]).emergencyRescueFunds()
        ).to.revertedWith('Admin only');
    });

    it('EmergencyRescueFunds works', async () => {
        await priceDiscoveryPool.emergencyRescueFunds();
        const lpTokensAfter = await pair.balanceOf(priceDiscoveryPool.address);
        const vrswTokensAfter = await vrswToken.balanceOf(
            priceDiscoveryPool.address
        );
        const token0After = await token0.balanceOf(priceDiscoveryPool.address);
        const token1After = await token1.balanceOf(priceDiscoveryPool.address);
        expect(lpTokensAfter).to.be.equal('0');
        expect(vrswTokensAfter).to.be.equal('0');
        expect(token0After).to.be.equal('0');
        expect(token1After).to.be.equal('0');
    });
});
