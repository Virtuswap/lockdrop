import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { assert, expect } from 'chai';
import { deployments, ethers } from 'hardhat';
import {
    VPriceDiscoveryPool,
    VIntermediatePoolFactory,
    MockVPairFactory,
    MockVPair,
    MockVrswToken,
    Token0,
    Token1,
} from '../typechain-types';
import { time } from '@nomicfoundation/hardhat-network-helpers';

describe('vPriceDiscoveryPool: Phase 1', function () {
    let intermediatePoolFactory: VIntermediatePoolFactory;
    let priceDiscoveryPool: VPriceDiscoveryPool;
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
        token0 = await ethers.getContract('Token0');
        token1 = await ethers.getContract('Token1');
        await mockVPairFactory.createPair(token0.address, token1.address);

        await intermediatePoolFactory.createPriceDiscoveryPool(
            token0.address,
            token1.address,
            await time.latest()
        );
        const priceDiscoveryPoolAddress =
            await intermediatePoolFactory.getPriceDiscoveryPool(
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
        await priceDiscoveryPool.deposit(token0.address, amount0);
        const balanceAfter0 = await token0.balanceOf(
            priceDiscoveryPool.address
        );
        const amount1 = ethers.utils.parseEther('5');
        const balanceBefore1 = await token1.balanceOf(
            priceDiscoveryPool.address
        );
        await priceDiscoveryPool.deposit(token1.address, amount1);
        const balanceAfter1 = await token1.balanceOf(
            priceDiscoveryPool.address
        );
        expect(balanceBefore0).to.be.below(balanceAfter0);
        expect(balanceBefore1).to.be.below(balanceAfter1);
    });

    it('Must revert if amount is zero', async () => {
        let amount = ethers.utils.parseEther('0');
        await expect(
            priceDiscoveryPool.deposit(token0.address, amount)
        ).to.revertedWith('Insufficient amount');
    });

    it('Must revert if wrong token', async () => {
        let amount = ethers.utils.parseEther('0');
        await expect(
            priceDiscoveryPool.deposit(deployer.address, amount)
        ).to.revertedWith('Invalid token');
    });
});

describe('vPriceDiscoveryPool: Phase 2', function () {
    let intermediatePoolFactory: VIntermediatePoolFactory;
    let priceDiscoveryPool: VPriceDiscoveryPool;
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
        token0 = await ethers.getContract('Token0');
        token1 = await ethers.getContract('Token1');
        await mockVPairFactory.createPair(token0.address, token1.address);
        await intermediatePoolFactory.createPriceDiscoveryPool(
            token0.address,
            token1.address,
            await time.latest()
        );
        const priceDiscoveryPoolAddress =
            await intermediatePoolFactory.getPriceDiscoveryPool(
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
    let intermediatePoolFactory: VIntermediatePoolFactory;
    let priceDiscoveryPool: VPriceDiscoveryPool;
    let mockVPairFactory: MockVPairFactory;
    let token0: Token0;
    let token1: Token1;
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
        token0 = await ethers.getContract('Token0');
        token1 = await ethers.getContract('Token1');
        await mockVPairFactory.createPair(token0.address, token1.address);
        await intermediatePoolFactory.createPriceDiscoveryPool(
            token0.address,
            token1.address,
            await time.latest()
        );
        const priceDiscoveryPoolAddress =
            await intermediatePoolFactory.getPriceDiscoveryPool(
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

    it('Withdraw lp tokens for myself', async () => {
        const lpTokensBefore = await pair.balanceOf(deployer.address);
        await priceDiscoveryPool.withdrawLpTokens(deployer.address);
        const lpTokensAfter = await pair.balanceOf(deployer.address);

        expect(lpTokensAfter).to.above(lpTokensBefore);
    });

    it('Withdraw lp tokens twice', async () => {
        await priceDiscoveryPool.withdrawLpTokens(deployer.address);
        const balanceBefore = await pair.balanceOf(deployer.address);
        await priceDiscoveryPool.withdrawLpTokens(deployer.address);
        const balanceAfter = await pair.balanceOf(deployer.address);
        expect(balanceAfter).to.be.equal(balanceBefore);
        expect(balanceAfter).to.be.above('0');
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
    let intermediatePoolFactory: VIntermediatePoolFactory;
    let priceDiscoveryPool: VPriceDiscoveryPool;
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
        token0 = await ethers.getContract('Token0');
        token1 = await ethers.getContract('Token1');
        vrswToken = await ethers.getContract('MockVrswToken');
        await mockVPairFactory.createPair(token0.address, token1.address);
        await intermediatePoolFactory.createPriceDiscoveryPool(
            token0.address,
            token1.address,
            await time.latest()
        );
        const priceDiscoveryPoolAddress =
            await intermediatePoolFactory.getPriceDiscoveryPool(
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
