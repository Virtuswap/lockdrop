import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const deployCore: DeployFunction = async function(
    hre: HardhatRuntimeEnvironment
) {
    const { network, ethers } = hre;
    const { deployer } = await getNamedAccounts();
    const { deploy, log } = deployments;
    let token0UsdAggregatorAddress: string;
    let token1UsdAggregatorAddress: string;
    let token0Address: string;
    let token1Address: string;
    if (network.config.chainId == 31337) {
        const token0 = await deployments.get('Token0');
        const token1 = await deployments.get('Token1');
        const token0Aggregator = await deployments.get('MockV3Aggregator0');
        const token1Aggregator = await deployments.get('MockV3Aggregator1');
        token0Address = token0.address;
        token1Address = token1.address;
        token0UsdAggregatorAddress = token0Aggregator.address;
        token1UsdAggregatorAddress = token1Aggregator.address;
    }

    const blockNumBefore = await ethers.provider.getBlockNumber();
    const blockBefore = await ethers.provider.getBlock(blockNumBefore);
    const timestampBefore = blockBefore.timestamp;

    const intermediatePool = await deploy('intermediatePool', {
        from: deployer,
        contract: 'vIntermediatePool',
        args: [token0Address, token1Address, token0UsdAggregatorAddress, token1UsdAggregatorAddress, timestampBefore],
        log: true,
    });
};
export default deployCore;
deployCore.tags = ['all', 'core'];
