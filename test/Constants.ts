import { ethers } from "hardhat"

export const amountLiqToken = ethers.BigNumber.from((500000000000e9).toString())
export const amountLiqETH = ethers.utils.parseEther("1")
export const provider = ethers.provider

export const MAX =
  "115792089237316195423570985008687907853269984665640564039457584007913129639935"

export const taxReceiverAddress = "0x000000000000000000000000000000000000dEaD"

export const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"
export const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
