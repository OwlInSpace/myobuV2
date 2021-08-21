// import { task } from "hardhat/config";
import config from "./config.json"
import secrets from "./secrets.json"

import "@nomiclabs/hardhat-waffle"
import "@typechain/hardhat"
import "hardhat-gas-reporter"
import "hardhat-deploy"
import "@nomiclabs/hardhat-etherscan"
import "solidity-coverage"

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

export default {
  solidity: {
    compilers: [
      {
        version: config.compilerVersion,
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  networks: {
    hardhat: {
      initialBaseFeePerGas: 0 /* Fix for: https://github.com/sc-forks/solidity-coverage/issues/652 */,
      blockGasLimit: 60000000,
      forking: {
        url: secrets.mainnetNodeURI,
        blockNumber: config.forkBlock || 13018600,
      },
    },
    localhost: {
      url: `http://localhost:8545`,
      accounts: secrets.localPrivateKeys || [],
    },
    mainnet: {
      url: secrets.mainnetNodeURI,
      chainId: 1,
      gasPrice: config.mainnetGasPrice * 1e9,
      accounts: secrets.mainnetPrivateKeys || [],
    },
    testnet: {
      url: secrets.testnetNodeURI,
      chainId: 4,
      gasPrice: config.testnetGasPrice * 1e9,
      accounts: secrets.testnetPrivateKeys || [],
    },
  },
  gasReporter: {
    currency: "USD",
    gasPrice: config.mainnetGasPrice,
    enabled: config.reportGas ? true : false,
    coinmarketcap: secrets.coinMarketCapApiKey || null,
    maxMethodDiff: 10,
  },
  typechain: {
    outdir: "typechain",
    target: "ethers-v5",
  },
  mocha: {
    timeout: 250e3,
  },
  etherscan: {
    apiKey: secrets.etherscanApiKey || null,
  },
}
