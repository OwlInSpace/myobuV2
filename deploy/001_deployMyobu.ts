import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import deployContract from "../scripts/deployContract"
//import { Contract } from "../typechain/Contract"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  await deployContract(
    hre,
    "Myobu",
    "0x0dB5570f3Bc313E99CDfa7fe77a6Cb87E1f3E85E"
  )
}

export default func
