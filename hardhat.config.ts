import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-deploy";

const config: HardhatUserConfig = {
    defaultNetwork: 'hardhat',
    networks: {
        hardhat: {
            chainId: 31337,
        },
    },
    solidity: "0.8.2",
    namedAccounts: {
        deployer: {
            default: 0,
        }
    },
};

export default config;
