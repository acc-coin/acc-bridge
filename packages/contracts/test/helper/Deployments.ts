import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-waffle";
import "@openzeppelin/hardhat-upgrades";
import { ethers, upgrades } from "hardhat";

import { BaseContract, Wallet } from "ethers";

import { HardhatAccount } from "../../src/HardhatAccount";
import { Amount, BOACoin } from "../../src/utils/Amount";

import { Bridge, BridgeValidator, TestLYT } from "../../typechain-types";

interface IDeployedContract {
    name: string;
    address: string;
    contract: BaseContract;
}

export interface IAccount {
    deployer: Wallet;
    protocolFee: Wallet;
    bridgeValidators: Wallet[];
    users: Wallet[];
    shops: Wallet[];
}

type FnDeployer = (accounts: IAccount, deployment: Deployments) => void;

export class Deployments {
    public deployments: Map<string, IDeployedContract>;
    public accounts: IAccount;

    constructor() {
        this.deployments = new Map<string, IDeployedContract>();

        const raws = HardhatAccount.keys.map((m) => new Wallet(m, ethers.provider));
        const [
            deployer,
            protocolFee,
            bridgeValidator1,
            bridgeValidator2,
            bridgeValidator3,
            user01,
            user02,
            user03,
            user04,
            user05,
            user06,
            user07,
            user08,
            user09,
            user10,
            shop01,
            shop02,
            shop03,
            shop04,
            shop05,
            shop06,
            shop07,
            shop08,
            shop09,
            shop10,
        ] = raws;

        this.accounts = {
            deployer,
            protocolFee,
            bridgeValidators: [bridgeValidator1, bridgeValidator2, bridgeValidator3],
            users: [user01, user02, user03, user04, user05, user06, user07, user08, user09, user10],
            shops: [shop01, shop02, shop03, shop04, shop05, shop06, shop07, shop08, shop09, shop10],
        };
    }

    public addContract(name: string, address: string, contract: BaseContract) {
        this.deployments.set(name, {
            name,
            address,
            contract,
        });
    }

    public getContract(name: string): BaseContract | undefined {
        const info = this.deployments.get(name);
        if (info !== undefined) {
            return info.contract;
        } else {
            return undefined;
        }
    }

    public getContractAddress(name: string): string | undefined {
        const info = this.deployments.get(name);
        if (info !== undefined) {
            return info.address;
        } else {
            return undefined;
        }
    }

    public async doDeployAll() {
        const deployers: FnDeployer[] = [deployToken, deployBridgeValidator, deployBridge];
        for (const elem of deployers) {
            try {
                await elem(this.accounts, this);
            } catch (error) {
                console.log(error);
            }
        }
    }
}

async function deployToken(accounts: IAccount, deployment: Deployments) {
    const contractName = "TestLYT";
    console.log(`Deploy ${contractName}...`);

    const factory = await ethers.getContractFactory("TestLYT");
    const contract = (await factory
        .connect(accounts.deployer)
        .deploy(accounts.deployer.address, accounts.protocolFee.address)) as TestLYT;
    await contract.deployed();
    await contract.deployTransaction.wait();

    const balance = await contract.balanceOf(accounts.deployer.address);
    console.log(`TestLYT token's owner: ${accounts.deployer.address}`);
    console.log(`TestLYT token's balance of owner: ${new BOACoin(balance).toDisplayString(true, 2)}`);

    deployment.addContract(contractName, contract.address, contract);
    console.log(`Deployed ${contractName} to ${contract.address}`);

    {
        const userAmount = Amount.make(200_000, 18);
        const tx2 = await contract.connect(accounts.deployer).multiTransfer(
            accounts.users.map((m) => m.address),
            userAmount.value
        );
        console.log(`Transfer token to users (tx: ${tx2.hash})...`);
        await tx2.wait();

        const tx3 = await contract.connect(accounts.deployer).multiTransfer(
            accounts.shops.map((m) => m.address),
            userAmount.value
        );
        console.log(`Transfer token to shops (tx: ${tx3.hash})...`);
        await tx3.wait();
    }
}

async function deployBridgeValidator(accounts: IAccount, deployment: Deployments) {
    const contractName = "BridgeValidator";
    console.log(`Deploy ${contractName}...`);

    const factory = await ethers.getContractFactory("BridgeValidator");
    const contract = (await upgrades.deployProxy(
        factory.connect(accounts.deployer),
        [accounts.bridgeValidators.map((m) => m.address), 2],
        {
            initializer: "initialize",
            kind: "uups",
        }
    )) as BridgeValidator;
    await contract.deployed();
    await contract.deployTransaction.wait();
    deployment.addContract(contractName, contract.address, contract);
    console.log(`Deployed ${contractName} to ${contract.address}`);
}

async function deployBridge(accounts: IAccount, deployment: Deployments) {
    const contractName = "Bridge";
    console.log(`Deploy ${contractName}...`);

    if (deployment.getContract("BridgeValidator") === undefined || deployment.getContract("TestLYT") === undefined) {
        console.error("Contract is not deployed!");
        return;
    }
    const factory = await ethers.getContractFactory("Bridge");
    const contract = (await upgrades.deployProxy(
        factory.connect(accounts.deployer),
        [deployment.getContractAddress("BridgeValidator"), accounts.protocolFee.address],
        {
            initializer: "initialize",
            kind: "uups",
        }
    )) as Bridge;
    await contract.deployed();
    await contract.deployTransaction.wait();
    deployment.addContract(contractName, contract.address, contract);
    console.log(`Deployed ${contractName} to ${contract.address}`);
}
