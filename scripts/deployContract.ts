import { HardhatRuntimeEnvironment } from "hardhat/types"
import { Contract } from "ethers"
import chalk from "chalk"

const deployContract = async (
  hre: HardhatRuntimeEnvironment,
  name: string,
  ...args: any[] // eslint-disable-line @typescript-eslint/no-explicit-any
): Promise<Contract> => {
  console.log(chalk.white.bold`\n ${name} deployment`)
  const _contract = await hre.ethers.getContractFactory(name)
  const contract = await _contract.deploy(...args)
  console.log(
    chalk.blackBright`   {white {bold ◌} Deploy transaction hash:} ${contract.deployTransaction.hash}`
  )
  await contract.deployed()
  console.log(
    chalk.blackBright`      {green ✓} {white Contract deployed at:} ${contract.address}`
  )
  return contract
}

export default deployContract
