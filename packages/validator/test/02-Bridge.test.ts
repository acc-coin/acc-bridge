import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-web3";
import "@openzeppelin/hardhat-upgrades";

import { Amount } from "../src/common/Amount";
import { Config } from "../src/common/Config";
import { Scheduler } from "../src/scheduler/Scheduler";
import { ValidatorStorage } from "../src/storage/ValidatorStorage";
import { ContractUtils } from "../src/utils/ContractUtils";
import { BIP20DelegatedTransfer, Bridge } from "../typechain-types";
import { Deployments } from "./helper/Deployments";
import { TestServer } from "./helper/Utility";

import chai, { expect } from "chai";
import { solidity } from "ethereum-waffle";

// tslint:disable-next-line:no-implicit-dependencies
import { arrayify } from "@ethersproject/bytes";
import { AddressZero, HashZero } from "@ethersproject/constants";

import * as assert from "assert";
import { Wallet } from "ethers";
import * as hre from "hardhat";
import path from "path";

import { URL } from "url";
import { BridgeScheduler } from "../src/scheduler/BridgeScheduler";

chai.use(solidity);

interface IShopData {
    shopId: string;
    name: string;
    currency: string;
    wallet: Wallet;
}

describe("Test for Bridge", () => {
    const deployments = new Deployments();
    let tokenContract: BIP20DelegatedTransfer;
    let bridgeAContract: Bridge;
    let bridgeBContract: Bridge;
    let config: Config;
    let storage: ValidatorStorage;
    let server: TestServer;
    let serverURL: URL;

    const amount = Amount.make(100_000, 18).value;

    let tokenId0: string;
    let tokenId1: string;
    let depositId: string;

    before("Deploy", async () => {
        await deployments.doDeployAll();
        tokenContract = deployments.getContract("TestKIOS") as BIP20DelegatedTransfer;
        bridgeAContract = deployments.getContract("BridgeA") as Bridge;
        bridgeBContract = deployments.getContract("BridgeB") as Bridge;
    });

    before("Create Config", async () => {
        config = new Config();
        config.readFromFile(path.resolve(process.cwd(), "config", "config_test.yaml"));
        config.bridge.networkAContractAddress = bridgeAContract.address;
        config.bridge.networkBContractAddress = bridgeBContract.address;
    });

    before("Create TestServer", async () => {
        serverURL = new URL(`http://127.0.0.1:${config.server.port}`);
        storage = await ValidatorStorage.make(config.database);
        await storage.clearTestDB();

        const schedulers: Scheduler[] = [];
        schedulers.push(new BridgeScheduler("*/1 * * * * *"));
        server = new TestServer(config, storage, schedulers);
    });

    before("Register token", async () => {
        // Native Token
        tokenId0 = HashZero;
        await bridgeAContract.connect(deployments.accounts.deployer).registerToken(HashZero, AddressZero);
        await bridgeBContract.connect(deployments.accounts.deployer).registerToken(HashZero, AddressZero);
        // BIP20 Token
        tokenId1 = ContractUtils.getTokenId(await tokenContract.name(), await tokenContract.symbol());
        await bridgeAContract.connect(deployments.accounts.deployer).registerToken(tokenId1, tokenContract.address);
        await bridgeBContract.connect(deployments.accounts.deployer).registerToken(tokenId1, tokenContract.address);
    });

    before("Deposit Native Liquidity at Bridge A", async () => {
        const liquidityAmount = Amount.make(1_000_000_000, 18).value;
        const signature = await ContractUtils.signMessage(deployments.accounts.deployer, arrayify(HashZero));
        const tx1 = await bridgeAContract
            .connect(deployments.accounts.deployer)
            .depositLiquidity(tokenId0, liquidityAmount, signature, { value: liquidityAmount });
        await tx1.wait();
    });

    before("Deposit Native Liquidity at Bridge B", async () => {
        const liquidityAmount = Amount.make(1_000_000_000, 18).value;
        const signature = await ContractUtils.signMessage(deployments.accounts.deployer, arrayify(HashZero));
        const tx1 = await bridgeBContract
            .connect(deployments.accounts.deployer)
            .depositLiquidity(tokenId0, liquidityAmount, signature, { value: liquidityAmount });
        await tx1.wait();
    });

    before("Deposit BIP20 Liquidity at Bridge A", async () => {
        const liquidityAmount = Amount.make(1_000_000_000, 18).value;
        const nonce = await (deployments.getContract("TestKIOS") as BIP20DelegatedTransfer).nonceOf(
            deployments.accounts.deployer.address
        );
        const message = ContractUtils.getTransferMessage(
            deployments.accounts.deployer.address,
            bridgeAContract.address,
            liquidityAmount,
            nonce
        );
        const signature = await ContractUtils.signMessage(deployments.accounts.deployer, message);
        const tx1 = await bridgeAContract
            .connect(deployments.accounts.deployer)
            .depositLiquidity(tokenId1, liquidityAmount, signature);
        await tx1.wait();
    });

    before("Deposit BIP20 Liquidity at Bridge B", async () => {
        const liquidityAmount = Amount.make(1_000_000_000, 18).value;
        const nonce = await (deployments.getContract("TestKIOS") as BIP20DelegatedTransfer).nonceOf(
            deployments.accounts.deployer.address
        );
        const message = ContractUtils.getTransferMessage(
            deployments.accounts.deployer.address,
            bridgeBContract.address,
            liquidityAmount,
            nonce
        );
        const signature = await ContractUtils.signMessage(deployments.accounts.deployer, message);
        const tx1 = await bridgeBContract
            .connect(deployments.accounts.deployer)
            .depositLiquidity(tokenId1, liquidityAmount, signature);
        await tx1.wait();
    });

    before("Start TestServer", async () => {
        await server.start();
    });

    after("Stop TestServer", async () => {
        await server.stop();
        await storage.dropTestDB();
    });

    it("Deposit native token to Main Bridge", async () => {
        const oldLiquidity = await hre.ethers.provider.getBalance(bridgeAContract.address);
        depositId = ContractUtils.getRandomId(deployments.accounts.users[0].address);
        const signature = await ContractUtils.signMessage(deployments.accounts.users[0], arrayify(HashZero));
        await expect(
            bridgeAContract
                .connect(deployments.accounts.users[0])
                .depositToBridge(tokenId0, depositId, AddressZero, 0, signature, {
                    value: amount,
                })
        )
            .to.emit(bridgeAContract, "BridgeDeposited")
            .withNamedArgs({
                tokenId: tokenId0,
                depositId,
                account: deployments.accounts.users[0].address,
                amount,
            });
        expect(await hre.ethers.provider.getBalance(bridgeAContract.address)).to.deep.equal(oldLiquidity.add(amount));
    });

    it("Waiting", async () => {
        const t1 = ContractUtils.getTimeStamp();
        while (true) {
            const info = await bridgeBContract.getWithdrawInfo(depositId);
            if (info.executed) break;
            else if (ContractUtils.getTimeStamp() - t1 > 60) break;
            await ContractUtils.delay(1000);
        }
    });

    it("Deposit BIB20 token to Main Bridge", async () => {
        const oldLiquidity = await tokenContract.balanceOf(bridgeBContract.address);
        const oldTokenBalance = await tokenContract.balanceOf(deployments.accounts.users[0].address);
        const nonce = await tokenContract.nonceOf(deployments.accounts.users[0].address);
        const message = ContractUtils.getTransferMessage(
            deployments.accounts.users[0].address,
            bridgeBContract.address,
            amount,
            nonce
        );
        depositId = ContractUtils.getRandomId(deployments.accounts.users[0].address);
        const signature = await ContractUtils.signMessage(deployments.accounts.users[0], message);
        await expect(
            bridgeBContract
                .connect(deployments.accounts.deployer)
                .depositToBridge(tokenId1, depositId, deployments.accounts.users[0].address, amount, signature)
        )
            .to.emit(bridgeBContract, "BridgeDeposited")
            .withNamedArgs({
                depositId,
                account: deployments.accounts.users[0].address,
                amount,
            });
        expect(await tokenContract.balanceOf(deployments.accounts.users[0].address)).to.deep.equal(
            oldTokenBalance.sub(amount)
        );
        expect(await tokenContract.balanceOf(bridgeBContract.address)).to.deep.equal(oldLiquidity.add(amount));
    });

    it("Waiting", async () => {
        const t1 = ContractUtils.getTimeStamp();
        while (true) {
            const info = await bridgeAContract.getWithdrawInfo(depositId);
            if (info.executed) break;
            else if (ContractUtils.getTimeStamp() - t1 > 60) break;
            await ContractUtils.delay(1000);
        }
    });
});
