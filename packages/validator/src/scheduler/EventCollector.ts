import { IBridge__factory } from "../../typechain-types";
// @ts-ignore
import { IBridgeInterface } from "../../typechain-types/dms-bridge-contracts/contracts/interfaces/IBridge";
import { ValidatorStorage } from "../storage/ValidatorStorage";

import { BigNumber, Wallet } from "ethers";
import * as hre from "hardhat";
import { logger } from "../common/Logger";
import { ValidatorType, WithdrawStatus } from "../types";

import { Provider } from "@ethersproject/providers";

export class EventCollector {
    private wallet: Wallet;
    private readonly type: ValidatorType;
    private readonly network: string;
    private readonly contractAddress: string;
    private readonly startNumber: bigint;
    private storage: ValidatorStorage;
    private provider: Provider;
    private interfaceOfBridge: IBridgeInterface | undefined;

    constructor(
        storage: ValidatorStorage,
        type: ValidatorType,
        network: string,
        contractAddress: string,
        startBlockNumber: bigint,
        wallet: Wallet,
        provider: Provider
    ) {
        this.storage = storage;
        this.type = type;
        this.network = network;
        this.contractAddress = contractAddress;
        this.startNumber = startBlockNumber;
        this.wallet = wallet;
        this.provider = provider;
    }

    public async work() {
        if (this.interfaceOfBridge === undefined) {
            this.interfaceOfBridge = IBridge__factory.createInterface();
        }

        try {
            const block = await this.provider.getBlock("latest");
            const latestBlockNumber = BigInt(block.number);

            let from: BigInt;
            const latestCollectedNumber = await this.storage.getLatestNumber(
                this.wallet.address,
                this.type,
                this.network
            );
            if (latestCollectedNumber === undefined) {
                from = this.startNumber;
            } else if (latestCollectedNumber === latestBlockNumber) {
                return;
            } else {
                from = latestCollectedNumber + 1n;
                if (from > latestBlockNumber) {
                    from = this.startNumber;
                    logger.warn(`Reset to collect from the beginning ${Number(from)}`);
                }
            }

            logger.info(`Collect Logs - ${Number(from)} - ${Number(latestBlockNumber)}`);
            const filters = [this.interfaceOfBridge.getEventTopic("BridgeDeposited")];
            const logs = await this.provider.getLogs({
                fromBlock: Number(from),
                toBlock: Number(latestBlockNumber),
                address: this.contractAddress,
                topics: filters,
            });
            logger.info(`Collected ${logs.length} Logs`);

            const iface = this.interfaceOfBridge;
            const depositEvents = logs.map((m: any) => {
                const event = iface.parseLog(m);
                return {
                    network: this.network,
                    tokenId: event.args.tokenId,
                    depositId: event.args.depositId,
                    account: event.args.account,
                    amount: BigNumber.from(event.args.amount),
                    blockNumber: BigInt(m.blockNumber),
                    transactionHash: m.transactionHash,
                    withdrawStatus: WithdrawStatus.None,
                    withdrawTimestamp: 0n,
                };
            });

            if (depositEvents.length > 0) await this.storage.postEvents(depositEvents, this.wallet.address, this.type);

            await this.storage.setLatestNumber(this.wallet.address, this.type, this.network, latestBlockNumber);
        } catch (error) {
            logger.error(`Failed Collector: ${error}`);
        }
    }
}
