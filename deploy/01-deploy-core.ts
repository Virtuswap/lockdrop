import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const deployCore: DeployFunction = async function (
    hre: HardhatRuntimeEnvironment
) {
    const { deployer } = await getNamedAccounts();
    const { deploy, log } = deployments;

    const intermediatePoolFactory = await deploy('intermediatePoolFactory', {
        from: deployer,
        contract: 'vIntermediatePoolFactory',
        log: true,
    });
};
export default deployCore;
deployCore.tags = ['all', 'core'];
