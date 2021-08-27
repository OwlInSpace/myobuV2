import { ethers } from "hardhat"
import {
  Myobu,
  IUniswapV2Factory,
  IUniswapV2Pair,
  IUniswapV2Router,
  IERC20,
} from "../typechain/"
import { shouldRevert } from "./utils"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"

import chai, { expect } from "chai"
import { BigNumber } from "ethers"
import chaibn from "chai-bn"
chai.use(chaibn(BigNumber))

import {
  amountLiqETH,
  amountLiqToken,
  provider,
  MAX,
  taxReceiverAddress,
  WETH,
  USDC,
} from "./Constants"

let contract: Myobu
let contract_: Myobu

let router: IUniswapV2Router
let pair: IUniswapV2Pair

let owner: SignerWithAddress
let signer: SignerWithAddress

describe("Deployment", () => {
  // Fetch and set variables, signer = second account, owner = contract deployer
  after(async () => {
    owner = (await ethers.getSigners())[0]
    signer = (await ethers.getSigners())[1]
    router = <IUniswapV2Router>(
      await ethers.getContractAt(
        "IUniswapV2Router",
        "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
        signer
      )
    )
    contract_ = contract.connect(signer)
  })

  it("Deploy contract", async () => {
    const _Contract = await ethers.getContractFactory("Myobu")
    contract = <Myobu>await _Contract.deploy(taxReceiverAddress)
    await contract.deployed()
  })
})

describe("Correct name, symbol, decimals, fees and supply", () => {
  it("Correct name", async () => {
    expect(await contract.name()).to.be.equal("Myōbu")
  })

  it("Correct symbol", async () => {
    expect(await contract.symbol()).to.be.equal("MYOBU")
  })

  it("Correct decimals", async () => {
    expect(await contract.decimals()).to.be.equal(9)
  })

  it("Correct supply", async () => {
    expect(await contract.totalSupply()).to.be.equal(
      ethers.BigNumber.from(1000000000000).mul((1e9).toString())
    )
  })
  it("Correct fees", async () => {
    const fees = await contract.currentFees()
    expect(fees[0]).to.be.equal(1)
    expect(fees[1]).to.be.equal(0)
    expect(fees[2]).to.be.equal(10)
    expect(fees[3]).to.be.equal(10)
  })
})

describe("Add liquidity", () => {
  it("Send tokens and ETH. Tokens can be transfered", async () => {
    await contract.fallback({ value: amountLiqETH })
    await contract.transfer(contract.address, amountLiqToken)
    expect(await contract.balanceOf(contract.address)).to.be.equal(
      amountLiqToken
    )
    expect(await contract.balanceOf(owner.address)).to.be.equal(amountLiqToken)
  })

  it("Cannot open trading before add liquidity", async () => {
    await shouldRevert(async () => {
      await contract.openTrading()
    })
  })

  it("Adds liquidity and creates pair", async () => {
    await contract.addLiquidity()
    const factory = <IUniswapV2Factory>(
      await ethers.getContractAt(
        "IUniswapV2Factory",
        "0x5c69bee701ef814a2b6a3edd4b1652cb9cc5aa6f"
      )
    )
    const pairAddress = await factory.getPair(contract.address, WETH)

    // Check if pair is created
    expect(pairAddress).to.not.equal(
      "0x0000000000000000000000000000000000000000"
    )

    pair = <IUniswapV2Pair>(
      await ethers.getContractAt("IUniswapV2Pair", pairAddress)
    )

    // Check if correct amount of liq added
    const reserves = await pair.getReserves()
    expect(reserves[0]).to.be.equal(amountLiqETH)
    expect(reserves[1]).to.be.equal(amountLiqToken)
  })
})

describe("Using uniswap", () => {
  it("Cannot buy before trading is open", async () => {
    await shouldRevert(async () => {
      await router.swapETHForExactTokens(
        amountLiqToken.div(50),
        [WETH, contract.address],
        signer.address,
        MAX,
        { value: amountLiqETH.div(25) }
      )
    })
  })

  it("Open trading", async () => {
    await contract.openTrading()
  })

  it("Buy works correctly", async () => {
    const beforePairBalance = await contract.balanceOf(pair.address)
    const toBuy = amountLiqToken.div(50)
    await router.swapETHForExactTokens(
      toBuy,
      [WETH, contract.address],
      signer.address,
      MAX,
      { value: amountLiqETH.div(25) }
    )
    // check if 10% fee is taken and all is deducted from pair
    expect(await contract.balanceOf(signer.address)).to.be.equal(
      amountLiqToken.div(50).div(100).mul(90)
    )
    expect(await contract.balanceOf(pair.address)).to.be.equal(
      beforePairBalance.sub(toBuy)
    )
  })

  it("Approve tokens to uniswap, approve works correctly", async () => {
    // contract connected with the second account
    contract_.approve(router.address, MAX)
    expect(
      await contract_.allowance(signer.address, router.address)
    ).to.be.equal(MAX)
  })

  it("Sell works correctly, sends ETH and fee taken", async () => {
    const toSell = amountLiqToken.div(200)
    const toBeDistributed = await contract.balanceOf(contract.address)

    const oldTaxAmount = await provider.getBalance(taxReceiverAddress)
    const oldPairBalance = await contract.balanceOf(pair.address)

    const oldBalance = await contract.balanceOf(signer.address)

    await router.swapExactTokensForETHSupportingFeeOnTransferTokens(
      toSell,
      0,
      [contract.address, WETH],
      signer.address,
      MAX
    )

    const newPairBalance = await contract.balanceOf(pair.address)
    const newTaxAmount = await provider.getBalance(taxReceiverAddress)

    // expect fees taken and tokens sold
    expect(newPairBalance).to.be.equal(
      oldPairBalance.add(toSell.div(10).mul(9)).add(toBeDistributed)
    )

    // expect team wallet recieved ETH, and all eth and tokens were sold and sent to tax wallet and
    // sell fee is in contract
    expect(newTaxAmount).to.be.bignumber.greaterThan(oldTaxAmount)
    expect(await provider.getBalance(contract.address)).to.be.equal(0)
    expect(await contract.balanceOf(contract.address)).to.be.equal(
      toSell.div(10)
    )

    // did take tokens
    expect(await contract.balanceOf(signer.address)).to.be.equal(
      oldBalance.sub(toSell)
    )
  })

  it("Reverts on sell over 1% impact", async () => {
    await shouldRevert(async () => {
      // total / 99 is a bit higher than 1%
      await router.swapExactTokensForETHSupportingFeeOnTransferTokens(
        (await contract.balanceOf(pair.address)).div(99),
        0,
        [contract.address, WETH],
        signer.address,
        MAX
      )
    })
  })

  describe("No fee liquidity adds / removals", () => {
    const amountTokensToAdd = amountLiqToken.div(500)
    let amountETHAdded: BigNumber

    it("Add liquidity reverts on deadline below current time", async () => {
      await shouldRevert(async () => {
        await contract_.noFeeAddLiquidityETH({
          pair: pair.address,
          to: signer.address,
          amountTokenOrLP: amountTokensToAdd,
          amountTokenMin: 0,
          amountETHMin: 0,
          deadline: 0,
        })
      })
    })

    it("Add liquidity refunds, takes tokens, and does not take fee", async () => {
      const oldPairBalance = await contract_.balanceOf(pair.address)
      const oldBalance = await contract_.balanceOf(signer.address)
      const oldContractBalance = await provider.getBalance(contract_.address)
      const params = {
        pair: pair.address,
        to: signer.address,
        amountTokenOrLP: amountTokensToAdd,
        amountTokenMin: amountTokensToAdd,
        amountETHMin: 0,
        deadline: MAX,
      }

      amountETHAdded = (
        await contract_.callStatic.noFeeAddLiquidityETH(params, {
          value: ethers.utils.parseEther("0.1"),
        })
      ).amountETH
      await contract_.noFeeAddLiquidityETH(params, {
        value: ethers.utils.parseEther("0.1"),
      })

      // Did refund + didn't send any amount over balance
      expect(await provider.getBalance(contract_.address)).to.be.equal(
        oldContractBalance
      )

      // Did take tokens
      expect(await contract_.balanceOf(signer.address)).to.be.equal(
        oldBalance.sub(amountTokensToAdd)
      )

      // Did not take fee on tokens
      expect(await contract_.balanceOf(pair.address)).to.be.equal(
        oldPairBalance.add(amountTokensToAdd)
      )
    })

    it("Remove liquidity reverts on deadline below current time", async () => {
      await shouldRevert(async () => {
        await contract_.noFeeRemoveLiquidityETH({
          pair: pair.address,
          to: signer.address,
          amountTokenOrLP: await pair.balanceOf(signer.address),
          amountTokenMin: 0,
          amountETHMin: 0,
          deadline: 0,
        })
      })
    })

    it("Remove liquidity takes LP tokens, does not take fee and sends right amounts", async () => {
      // Approve LP tokens before continuing
      await pair.connect(signer).approve(contract_.address, MAX)

      const oldBalance = await contract_.balanceOf(signer.address)
      const oldETHBalance = await provider.getBalance(signer.address)
      const params = {
        pair: pair.address,
        to: signer.address,
        amountTokenOrLP: await pair.balanceOf(signer.address),
        amountTokenMin: 0,
        amountETHMin: 0,
        deadline: MAX,
      }
      const returned = await contract_.callStatic.noFeeRemoveLiquidityETH(
        params
      )
      const amountETHToBeRemoved = returned.amountETH
      const amountTokenToBeRemoved = returned.amountToken
      const allowedLossOfPercision = 100
      expect(amountETHToBeRemoved).to.be.bignumber.greaterThan(
        amountETHAdded.sub(allowedLossOfPercision)
      )
      expect(amountTokenToBeRemoved).to.be.bignumber.greaterThan(
        amountTokensToAdd.sub(allowedLossOfPercision)
      )
      const tx = await contract_.noFeeRemoveLiquidityETH(params)
      const res = await tx.wait()
      // Did take all LP tokens
      expect(await pair.balanceOf(signer.address)).to.be.equal(0)

      // Did get expected amount of tokens and did not take fee (allow some loss of precision and count gas)
      expect(
        await provider.getBalance(signer.address)
      ).to.be.bignumber.greaterThan(
        oldETHBalance
          .add(amountETHAdded)
          .sub(res.gasUsed.mul(tx.gasPrice || 1))
          .sub(allowedLossOfPercision)
      )

      expect(
        await contract_.balanceOf(signer.address)
      ).to.be.bignumber.greaterThan(
        oldBalance.add(amountTokensToAdd).sub(allowedLossOfPercision)
      )
    })
  })
})

describe("Others", () => {
  it("Fee is not taken on a normal transfer", async () => {
    const beforeFromBalance = await contract.balanceOf(owner.address)
    const beforeToBalance = await contract.balanceOf(taxReceiverAddress)
    const testTransferAmount = amountLiqToken.div(1000)
    await contract.transfer(taxReceiverAddress, testTransferAmount)

    // Did take tokens and did not take any fee
    expect(await contract.balanceOf(owner.address)).to.be.equal(
      beforeFromBalance.sub(testTransferAmount)
    )
    expect(await contract.balanceOf(taxReceiverAddress)).to.be.equal(
      beforeToBalance.add(testTransferAmount)
    )
  })

  it("Cannot approve to the 0 address", async () => {
    await shouldRevert(async () => {
      await contract.approve("0x0000000000000000000000000000000000000000", "0")
    })
  })

  it("Cannot transfer 0 tokens", async () => {
    await shouldRevert(async () => {
      await contract.transfer(taxReceiverAddress, "0")
    })
  })

  it("Manually swap and send all. Manual swap swaps all ETH and Manual send sends all ETH, Set tax address changes tax address", async () => {
    await contract.setTaxAddress(signer.address)

    await contract.manualswap()
    const toBeSent = await provider.getBalance(contract.address)
    const oldBalance = await provider.getBalance(signer.address)

    // Swapped all tokens and has some ETH balance
    expect(await contract.balanceOf(contract.address)).to.be.equal(0)
    expect(toBeSent).to.be.not.bignumber.zero
    await contract.manualsend()

    // Has no more eth left and all sent to tax
    expect(await provider.getBalance(contract.address)).to.be.equal(0)
    expect(await provider.getBalance(signer.address)).to.be.equal(
      oldBalance.add(toBeSent)
    )
  })

  it("Add DEX reverts on already added DEX", async () => {
    await shouldRevert(async () =>
      contract.addDEX(pair.address, router.address)
    )
  })

  it("Remove DEX reverts on not added DEX", async () => {
    await shouldRevert(async () => contract.removeDEX(taxReceiverAddress))
  })
})

describe("Change fees / different fees", () => {
  it("Making fees none, does not take a fee and does not revert", async () => {
    await contract.setFees({
      impact: 1,
      taxFee: 0,
      buyFee: 0,
      sellFee: 0,
      transferFee: 0,
    })
    const beforeFromBalance = await contract.balanceOf(signer.address)
    const beforeToBalance = await contract.balanceOf(pair.address)
    const testBuyAmount = amountLiqToken.div(1000)

    await router.swapETHForExactTokens(
      testBuyAmount,
      [WETH, contract.address],
      signer.address,
      MAX,
      { value: amountLiqETH }
    )

    // Did receive tokens and did not take any fee, correct amount deducted from pair
    expect(await contract.balanceOf(signer.address)).to.be.equal(
      beforeFromBalance.add(testBuyAmount)
    )
    expect(await contract.balanceOf(pair.address)).to.be.equal(
      beforeToBalance.sub(testBuyAmount)
    )
  })

  it("Reflections + TeamFee works and takes correct amounts", async () => {
    const feesToSetTo = {
      impact: 1,
      taxFee: 1,
      buyFee: 1,
      sellFee: 1,
      transferFee: 1,
    }
    await contract.setFees(feesToSetTo)
    const beforeFromBalance = await contract.balanceOf(signer.address)
    const beforeToBalance = await contract.balanceOf(pair.address)
    const taxBalanceBeforeReflection = await contract.balanceOf(
      taxReceiverAddress
    )
    const testBuyAmount = amountLiqToken.div(1000)

    await router.swapETHForExactTokens(
      testBuyAmount,
      [WETH, contract.address],
      signer.address,
      MAX,
      { value: amountLiqETH }
    )

    // Using greater than because of reflections

    // Expect that tokens taken and received counts both fees
    expect(
      await contract.balanceOf(signer.address)
    ).to.be.bignumber.greaterThan(
      beforeFromBalance.add(testBuyAmount.mul(98).div(100))
    )

    expect(await contract.balanceOf(pair.address)).to.be.bignumber.greaterThan(
      beforeToBalance.sub(testBuyAmount)
    )

    // Did receive reflections
    const taxBalanceAfterReflection = await contract.balanceOf(
      taxReceiverAddress
    )

    expect(taxBalanceAfterReflection).to.be.bignumber.greaterThan(
      taxBalanceBeforeReflection
    )

    // Did get correct amount of team tokens
    expect(
      await contract.balanceOf(contract.address)
    ).to.be.bignumber.greaterThan(testBuyAmount.div(100))

    // Set back to normal
    await contract.setFees({
      impact: 1,
      taxFee: 0,
      buyFee: 10,
      sellFee: 10,
      transferFee: 10,
    })
  })

  it("Reverts on impact higher than 100 or 0", async () => {
    await shouldRevert(async () => {
      await contract.setFees({
        impact: 101,
        taxFee: 0,
        buyFee: 10,
        sellFee: 10,
        transferFee: 10,
      })
      await contract.setFees({
        impact: 0,
        taxFee: 0,
        buyFee: 10,
        sellFee: 10,
        transferFee: 10,
      })
    })
  })

  it("Reverts on fees higher than or equal to 50%", async () => {
    await shouldRevert(async () => {
      await contract.setFees({
        impact: 1,
        taxFee: 30,
        buyFee: 20,
        sellFee: 10,
        transferFee: 10,
      })
      await contract.setFees({
        impact: 1,
        taxFee: 30,
        buyFee: 10,
        sellFee: 20,
        transferFee: 20,
      })
    })
  })
})

describe("Use sushiswap", () => {
  let sushiRouter: IUniswapV2Router
  let sushiPair: IUniswapV2Pair
  let usdc: IERC20
  let totalBalance: BigNumber

  before(async () => {
    // Get usdc to test with
    router.swapExactETHForTokens(0, [WETH, USDC], owner.address, MAX, {
      value: ethers.utils.parseEther("1"),
    })
    usdc = <IERC20>await ethers.getContractAt("IERC20", USDC, owner)
    sushiRouter = <IUniswapV2Router>(
      await ethers.getContractAt(
        "IUniswapV2Router",
        "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F",
        owner
      )
    )
    totalBalance = await usdc.balanceOf(owner.address)

    // Approve tokens
    await usdc.approve(sushiRouter.address, MAX)
    await usdc.connect(signer).approve(sushiRouter.address, MAX)
    await usdc.connect(signer).approve(contract.address, MAX)
    await contract.approve(sushiRouter.address, MAX)
    await contract_.approve(sushiRouter.address, MAX)
  })

  it("Create pair and add liquidity", async () => {
    await sushiRouter.addLiquidity(
      USDC,
      contract.address,
      totalBalance.div(100),
      amountLiqToken.div(3),
      0,
      0,
      owner.address,
      MAX
    )
    const factory = <IUniswapV2Factory>(
      await ethers.getContractAt(
        "IUniswapV2Factory",
        "0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac"
      )
    )
    const pairAddress = await factory.getPair(USDC, contract.address)
    sushiPair = <IUniswapV2Pair>(
      await ethers.getContractAt("IUniswapV2Pair", pairAddress, signer)
    )

    // Transfer all usdc to second account
    await usdc.transfer(signer.address, await usdc.balanceOf(owner.address))
    await sushiPair.approve(contract.address, MAX)
    sushiRouter = sushiRouter.connect(signer)
  })

  it("Reverts on liquidity add on unsupported pair", async () => {
    // prettier-ignore
    await shouldRevert(async () => {
      await contract.noFeeAddLiquidityETH({pair: sushiPair.address, to: signer.address, amountTokenOrLP: 100, amountTokenMin: 0, amountETHMin: 0, deadline: MAX })
    })
  })

  it("Add DEX", async () => {
    await contract.addDEX(sushiPair.address, sushiRouter.address)
    expect(await contract.taxedPair(sushiPair.address)).to.be.true
  })

  it("Buy works correctly", async () => {
    const beforePairBalance = await contract.balanceOf(sushiPair.address)
    const toBuy = amountLiqToken.div(50)
    const beforeBalance = await contract.balanceOf(signer.address)
    await sushiRouter.swapTokensForExactTokens(
      toBuy,
      totalBalance.div(100),
      [USDC, contract.address],
      signer.address,
      MAX
    )
    // Check if 10% fee is taken and all is deducted from pair
    expect(await contract.balanceOf(signer.address)).to.be.equal(
      beforeBalance.add(toBuy.div(100).mul(90))
    )
    expect(await contract.balanceOf(sushiPair.address)).to.be.equal(
      beforePairBalance.sub(toBuy)
    )
  })

  it("RemoveDex() removes fees (Remove sushiswap)", async () => {
    await contract.removeDEX(sushiPair.address)
    const toBuy = amountLiqToken.div(50)
    const beforeBalance = await contract.balanceOf(signer.address)
    await sushiRouter.swapTokensForExactTokens(
      toBuy,
      totalBalance.div(100),
      [USDC, contract.address],
      signer.address,
      MAX
    )
    // Check if no fee is taken
    expect(await contract.balanceOf(signer.address)).to.be.equal(
      beforeBalance.add(toBuy)
    )

    // Return to normal
    await contract.addDEX(sushiPair.address, sushiRouter.address)
  })

  it("Reverts on sell over 1% impact", async () => {
    await shouldRevert(async () => {
      await sushiRouter.swapExactTokensForTokensSupportingFeeOnTransferTokens(
        (await contract.balanceOf(sushiPair.address)).div(99),
        0,
        [contract.address, USDC],
        signer.address,
        MAX
      )
    })
  })

  it("Sell works correctly, sends ETH and fee taken", async () => {
    const toSell = amountLiqToken.div(500)

    const oldPairBalance = await contract.balanceOf(sushiPair.address)
    const oldBalance = await contract.balanceOf(signer.address)

    await sushiRouter.swapExactTokensForTokensSupportingFeeOnTransferTokens(
      toSell,
      0,
      [contract_.address, USDC],
      signer.address,
      MAX
    )

    const newPairBalance = await contract.balanceOf(sushiPair.address)

    // Fees taken
    expect(newPairBalance).to.be.equal(
      oldPairBalance.add(toSell.div(10).mul(9))
    )

    // Expect sell fee is in contract
    expect(await contract.balanceOf(contract.address)).to.be.equal(
      toSell.div(10)
    )

    // Did take tokens
    expect(await contract.balanceOf(signer.address)).to.be.equal(
      oldBalance.sub(toSell)
    )
  })

  describe("No fee liquidity adds / removals", () => {
    const amountTokensToAdd = amountLiqToken.div(200)
    let amountUSDCAdded: BigNumber

    it("Add liquidity refunds, takes tokens, and does not take fee", async () => {
      const oldPairBalance = await contract_.balanceOf(sushiPair.address)
      const oldBalance = await contract_.balanceOf(signer.address)
      const params = {
        pair: sushiPair.address,
        to: signer.address,
        amountToken: amountTokensToAdd,
        amountTokenB: totalBalance.div(5),
        amountTokenMin: amountTokensToAdd,
        amountTokenBMin: 0,
        deadline: MAX,
      }

      amountUSDCAdded = (await contract_.callStatic.noFeeAddLiquidity(params))
        .amountToken
      await contract_.noFeeAddLiquidity(params)

      // Did take tokens
      expect(await contract_.balanceOf(signer.address)).to.be.equal(
        oldBalance.sub(amountTokensToAdd)
      )

      // Did not take fee on tokens
      expect(await contract_.balanceOf(sushiPair.address)).to.be.equal(
        oldPairBalance.add(amountTokensToAdd)
      )
    })

    it("Remove liquidity takes LP tokens, does not take fee and sends right amounts", async () => {
      const oldBalance = await contract_.balanceOf(signer.address)
      const oldUSDCBalance = await usdc.balanceOf(signer.address)
      const params = {
        pair: sushiPair.address,
        to: signer.address,
        amountLP: await sushiPair.balanceOf(signer.address),
        amountTokenMin: 0,
        amountTokenBMin: 0,
        deadline: MAX,
      }
      const returned = await contract_.callStatic.noFeeRemoveLiquidity(params)
      const amountUSDCToBeRemoved = returned.amountToken
      const amountTokenToBeRemoved = returned.amountMyobu
      const allowedLossOfPercision = "10000000000000"
      expect(amountUSDCToBeRemoved).to.be.bignumber.greaterThan(
        amountUSDCAdded.sub(allowedLossOfPercision)
      )
      expect(amountTokenToBeRemoved).to.be.bignumber.greaterThan(
        amountTokensToAdd.sub(allowedLossOfPercision)
      )

      await contract_.noFeeRemoveLiquidity(params)

      // Did take all LP tokens
      expect(await sushiPair.balanceOf(signer.address)).to.be.equal(0)

      // Did get expected amount of tokens and did not take fee
      expect(await usdc.balanceOf(signer.address)).to.be.bignumber.greaterThan(
        oldUSDCBalance.add(amountUSDCAdded).sub(allowedLossOfPercision)
      )

      expect(
        await contract_.balanceOf(signer.address)
      ).to.be.bignumber.greaterThan(
        oldBalance.add(amountTokensToAdd).sub(allowedLossOfPercision)
      )
    })
  })
})

describe("Snapshot", async () => {
  it("Cannot be called by an address that is not owner or DAO", async () => {
    await shouldRevert(async () => {
      await contract_.snapshot()
    })
  })

  it("Can be called by owner", async () => {
    await contract.snapshot()
    expect(await contract.getCurrentSnapshotId()).to.be.equal(1)
  })

  it("Set DAO", async () => {
    await contract.setDAO(signer.address)
    expect(await contract.DAO()).to.be.equal(signer.address)
  })

  it("Can be called by DAO address", async () => {
    await contract_.snapshot()
    expect(await contract_.getCurrentSnapshotId()).to.be.equal(2)
  })
})

describe("Anti Liq Bot", () => {
  it("Liq adds / removals does not work when anti liq bot is on and work from myobu swap", async () => {
    await contract.setAntiLiqBot(true)
    const paramsAdd = {
      pair: pair.address,
      to: owner.address,
      amountTokenOrLP: amountLiqToken.div(1000),
      amountTokenMin: 0,
      amountETHMin: 0,
      deadline: MAX,
    }

    await shouldRevert(async () => {
      await contract.noFeeAddLiquidityETH(paramsAdd, { value: amountLiqETH })
    })

    await contract.setMyobuSwap(owner.address)

    await contract.noFeeAddLiquidityETH(paramsAdd, { value: amountLiqETH })
  })
})

describe("Taxed transfers", () => {
  it("Addresses added get taxed (transferFee) amount", async () => {
    await contract.manualswap()

    await contract.setFees({
      impact: 1,
      taxFee: 0,
      buyFee: 0,
      sellFee: 5,
      transferFee: 5,
    })
    await contract.setTaxedTransferFor([taxReceiverAddress])
    const amountTx = amountLiqToken.div(100)
    await contract_.transfer(taxReceiverAddress, amountTx)
    expect(await contract.balanceOf(contract.address)).to.be.equal(
      amountTx.div(20)
    )

    await contract.removeTaxedTransferFor([taxReceiverAddress])
  })
})
