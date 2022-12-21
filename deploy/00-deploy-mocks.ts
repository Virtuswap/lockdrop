import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const DECIMALS = '8';
const INITIAL_PRICE_0 = '200000000';
const INITIAL_PRICE_1 = '100000000';
const INITIAL_TOKEN_AMOUNT = '2000000000000000000000';
const deployMocks: DeployFunction = async function (
    hre: HardhatRuntimeEnvironment
) {
    const { deployments, getNamedAccounts, network } = hre;
    const { deploy, log } = deployments;
    const { deployer } = await getNamedAccounts();
    const chainId = network.config.chainId;

    if (chainId == 31337) {
        await deploy('MockV3Aggregator0', {
            contract: 'MockV3Aggregator',
            from: deployer,
            log: true,
            args: [DECIMALS, INITIAL_PRICE_0],
        });
        await deploy('MockV3Aggregator1', {
            contract: 'MockV3Aggregator',
            from: deployer,
            log: true,
            args: [DECIMALS, INITIAL_PRICE_1],
        });
        await deploy('Token0', {
            contract: 'Token0',
            from: deployer,
            log: true,
            args: [deployer, INITIAL_TOKEN_AMOUNT],
        });
        await deploy('Token1', {
            contract: 'Token1',
            from: deployer,
            log: true,
            args: [deployer, INITIAL_TOKEN_AMOUNT],
        });
    }
};
export default deployMocks;
deployMocks.tags = ['all', 'mocks'];