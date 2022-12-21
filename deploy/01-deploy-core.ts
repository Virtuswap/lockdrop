import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const deployCore: DeployFunction = async function (
    hre: HardhatRuntimeEnvironment
) {
    const { deployments } = hre;
    const { deployer } = await getNamedAccounts();
    const { deploy, log } = deployments;

    const vsRouter = await deployments.get('MockVRouter');
    const vsPairFactory = await deployments.get('MockVPairFactory');

    const intermediatePoolFactory = await deploy('intermediatePoolFactory', {
        from: deployer,
        contract: 'vIntermediatePoolFactory',
        args: [vsRouter.address, vsPairFactory.address],
        log: true,
    });
};
export default deployCore;
deployCore.tags = ['all', 'core'];
