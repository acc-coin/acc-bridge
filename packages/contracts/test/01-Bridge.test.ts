import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-waffle";
import "@openzeppelin/hardhat-upgrades";

import { Amount } from "../src/utils/Amount";
import { ContractUtils } from "../src/utils/ContractUtils";
import { BIP20DelegatedTransfer, Bridge } from "../typechain-types";
import { Deployments } from "./helper/Deployments";

import chai, { expect } from "chai";
import { solidity } from "ethereum-waffle";

import { Wallet } from "ethers";

// tslint:disable-next-line:no-implicit-dependencies
import { arrayify } from "@ethersproject/bytes";
import { AddressZero, HashZero } from "@ethersproject/constants";

import * as hre from "hardhat";

chai.use(solidity);

interface IShopData {
    shopId: string;
    name: string;
    currency: string;
    wallet: Wallet;
}

describe("Test for Ledger", () => {
    const deployments = new Deployments();
    let tokenContract: BIP20DelegatedTransfer;
    let bridgeContract: Bridge;

    const amount = Amount.make(100_000, 18).value;
    const fee = Amount.make(0.1, 18).value;

    const deployAllContract = async (shopData: IShopData[]) => {
        await deployments.doDeployAll();
        tokenContract = deployments.getContract("TestLYT") as BIP20DelegatedTransfer;
        bridgeContract = deployments.getContract("Bridge") as Bridge;
    };

    let tokenId0: string;
    let tokenId1: string;
    let depositId: string;
    it("Deploy", async () => {
        await deployAllContract([]);
    });

    it("Register token", async () => {
        // Native Token
        tokenId0 = HashZero;
        await bridgeContract.connect(deployments.accounts.deployer).registerToken(HashZero, AddressZero);
        // BIP20 Token
        tokenId1 = ContractUtils.getTokenId(await tokenContract.name(), await tokenContract.symbol());
        await bridgeContract.connect(deployments.accounts.deployer).registerToken(tokenId1, tokenContract.address);
    });

    it("Deposit Native Liquidity", async () => {
        const liquidityAmount = Amount.make(1_000_000_000, 18).value;
        const signature = await ContractUtils.signMessage(deployments.accounts.deployer, arrayify(HashZero));
        const tx1 = await bridgeContract
            .connect(deployments.accounts.deployer)
            .depositLiquidity(tokenId0, liquidityAmount, 0, signature, { value: liquidityAmount });
        console.log(`Deposit liquidity native token (tx: ${tx1.hash})...`);
        await tx1.wait();

        expect(await bridgeContract.getTotalLiquidity(HashZero)).to.deep.equal(liquidityAmount);
    });

    it("Deposit BIP20 Liquidity", async () => {
        const liquidityAmount = Amount.make(1_000_000_000, 18).value;
        const token = deployments.getContract("TestLYT") as BIP20DelegatedTransfer;
        const nonce = await token.nonceOf(deployments.accounts.deployer.address);
        const expiry = ContractUtils.getTimeStamp() + 12 * 5;
        const message = ContractUtils.getTransferMessage(
            hre.ethers.provider.network.chainId,
            token.address,
            deployments.accounts.deployer.address,
            bridgeContract.address,
            liquidityAmount,
            nonce,
            expiry
        );
        const signature = await ContractUtils.signMessage(deployments.accounts.deployer, message);
        const tx1 = await bridgeContract
            .connect(deployments.accounts.deployer)
            .depositLiquidity(tokenId1, liquidityAmount, expiry, signature);
        console.log(`Deposit liquidity token (tx: ${tx1.hash})...`);
        await tx1.wait();

        expect(await bridgeContract.getTotalLiquidity(tokenId1)).to.deep.equal(liquidityAmount);
    });

    it("Deposit native token to Main Bridge", async () => {
        const oldLiquidity = await hre.ethers.provider.getBalance(bridgeContract.address);
        depositId = ContractUtils.getRandomId(deployments.accounts.users[0].address);
        const signature = await ContractUtils.signMessage(deployments.accounts.users[0], arrayify(HashZero));
        await expect(
            bridgeContract
                .connect(deployments.accounts.users[0])
                .depositToBridge(tokenId0, depositId, AddressZero, 0, 0, signature, {
                    value: amount,
                })
        )
            .to.emit(bridgeContract, "BridgeDeposited")
            .withNamedArgs({
                tokenId: tokenId0,
                depositId,
                account: deployments.accounts.users[0].address,
                amount,
            });
        expect(await hre.ethers.provider.getBalance(bridgeContract.address)).to.deep.equal(oldLiquidity.add(amount));
    });

    it("Withdraw native token from Main Bridge", async () => {
        const oldLiquidity = await hre.ethers.provider.getBalance(bridgeContract.address);
        const oldTokenBalance = await hre.ethers.provider.getBalance(deployments.accounts.users[0].address);
        const oldFeeBalance = await hre.ethers.provider.getBalance(deployments.accounts.protocolFee.address);

        await bridgeContract
            .connect(deployments.accounts.bridgeValidators[0])
            .withdrawFromBridge(tokenId0, depositId, deployments.accounts.users[0].address, amount);
        await expect(
            bridgeContract
                .connect(deployments.accounts.bridgeValidators[1])
                .withdrawFromBridge(tokenId0, depositId, deployments.accounts.users[0].address, amount)
        )
            .to.emit(bridgeContract, "BridgeWithdrawn")
            .withNamedArgs({
                tokenId: tokenId0,
                withdrawId: depositId,
                account: deployments.accounts.users[0].address,
                amount: amount.sub(fee),
            });

        expect(await hre.ethers.provider.getBalance(bridgeContract.address)).to.deep.equal(oldLiquidity.sub(amount));
        expect(await hre.ethers.provider.getBalance(deployments.accounts.users[0].address)).to.deep.equal(
            oldTokenBalance.add(amount.sub(fee))
        );
        expect(await hre.ethers.provider.getBalance(deployments.accounts.protocolFee.address)).to.deep.equal(
            oldFeeBalance.add(fee)
        );
    });

    it("Deposit BIB20 token to Main Bridge", async () => {
        const oldLiquidity = await tokenContract.balanceOf(bridgeContract.address);
        const oldTokenBalance = await tokenContract.balanceOf(deployments.accounts.users[0].address);
        const nonce = await tokenContract.nonceOf(deployments.accounts.users[0].address);
        const expiry = ContractUtils.getTimeStamp() + 12 * 5;
        const message = ContractUtils.getTransferMessage(
            hre.ethers.provider.network.chainId,
            tokenContract.address,
            deployments.accounts.users[0].address,
            bridgeContract.address,
            amount,
            nonce,
            expiry
        );
        depositId = ContractUtils.getRandomId(deployments.accounts.users[0].address);
        const signature = await ContractUtils.signMessage(deployments.accounts.users[0], message);
        await expect(
            bridgeContract
                .connect(deployments.accounts.deployer)
                .depositToBridge(tokenId1, depositId, deployments.accounts.users[0].address, amount, expiry, signature)
        )
            .to.emit(bridgeContract, "BridgeDeposited")
            .withNamedArgs({
                depositId,
                account: deployments.accounts.users[0].address,
                amount,
            });
        expect(await tokenContract.balanceOf(deployments.accounts.users[0].address)).to.deep.equal(
            oldTokenBalance.sub(amount)
        );
        expect(await tokenContract.balanceOf(bridgeContract.address)).to.deep.equal(oldLiquidity.add(amount));
    });

    it("Withdraw BIB20 token from Main Bridge", async () => {
        const oldLiquidity = await tokenContract.balanceOf(bridgeContract.address);
        const oldTokenBalance = await tokenContract.balanceOf(deployments.accounts.users[0].address);
        const oldFeeBalance = await tokenContract.balanceOf(deployments.accounts.protocolFee.address);

        await bridgeContract
            .connect(deployments.accounts.bridgeValidators[0])
            .withdrawFromBridge(tokenId1, depositId, deployments.accounts.users[0].address, amount);
        await expect(
            bridgeContract
                .connect(deployments.accounts.bridgeValidators[1])
                .withdrawFromBridge(tokenId1, depositId, deployments.accounts.users[0].address, amount)
        )
            .to.emit(bridgeContract, "BridgeWithdrawn")
            .withNamedArgs({
                withdrawId: depositId,
                account: deployments.accounts.users[0].address,
                amount: amount.sub(fee),
            });

        expect(await tokenContract.balanceOf(bridgeContract.address)).to.deep.equal(oldLiquidity.sub(amount));
        expect(await tokenContract.balanceOf(deployments.accounts.users[0].address)).to.deep.equal(
            oldTokenBalance.add(amount.sub(fee))
        );
        expect(await tokenContract.balanceOf(deployments.accounts.protocolFee.address)).to.deep.equal(
            oldFeeBalance.add(fee)
        );
    });
});
