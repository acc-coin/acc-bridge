import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-waffle";
import "@openzeppelin/hardhat-upgrades";

import { BaseContract, Wallet } from "ethers";

import { Amount, BOACoin } from "../../src/common/Amount";
import { Config } from "../../src/common/Config";
import { HardhatAccount } from "../../src/HardhatAccount";
import { Bridge, BridgeValidator, TestLYT } from "../../typechain-types";

import * as hre from "hardhat";

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
}

type FnDeployer = (accounts: IAccount, deployment: Deployments) => void;

export class Deployments {
    public deployments: Map<string, IDeployedContract>;
    public accounts: IAccount;
    public config: Config;
    public network: string;

    constructor(config: Config, network: string) {
        this.config = config;
        this.network = network;
        this.deployments = new Map<string, IDeployedContract>();

        const raws = HardhatAccount.keys.map((m) => new Wallet(m, hre.ethers.provider));
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
        ] = raws;

        this.accounts = {
            deployer,
            protocolFee,
            bridgeValidators: [bridgeValidator1, bridgeValidator2, bridgeValidator3],
            users: [user01, user02, user03, user04, user05, user06, user07, user08, user09, user10],
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
        await hre.changeNetwork(this.network);
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

    await hre.changeNetwork(deployment.network);
    const factory = await hre.ethers.getContractFactory("TestLYT");
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
    }
}

async function deployBridgeValidator(accounts: IAccount, deployment: Deployments) {
    const contractName = "BridgeValidator";
    console.log(`Deploy ${contractName}...`);

    await hre.changeNetwork(deployment.network);
    const factory = await hre.ethers.getContractFactory("BridgeValidator");
    const contract = (await hre.upgrades.deployProxy(
        factory.connect(accounts.deployer),
        [accounts.bridgeValidators.map((m) => m.address), 3],
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

    await hre.changeNetwork(deployment.network);
    const factory = await hre.ethers.getContractFactory("Bridge");
    const contract = (await hre.upgrades.deployProxy(
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
