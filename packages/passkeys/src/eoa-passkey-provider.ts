import { default as EventEmitter } from "eventemitter3";
import {
	Chain,
	TransactionRequest,
	Transport,
	WatchAssetParams,
	getAddress,
	WalletClient,
} from "viem";
import type { PasskeyAccount } from "./large-blob-passkey-account";

export type PasskeyProviderOptions = {
	shimDisconnect?: boolean;
	chainId: number;
	walletClient: WalletClient<Transport, Chain, PasskeyAccount>;
};

type Events = {
	accountsChanged(accounts: string[]): void;
	chainChanged(chainId: number | string): void;
	disconnect(): void;
};

type Event = keyof Events;
export type PasskeyWalletClient = WalletClient<Transport, Chain, PasskeyAccount>;

export class EoaPasskeyProvider {
	events = new EventEmitter<Events>();

	chainId: number;
	#walletClient?: PasskeyWalletClient;
	#options: PasskeyProviderOptions;

	constructor(options: PasskeyProviderOptions) {
		this.chainId = options.chainId;
		this.#options = options;
		this.#walletClient = options.walletClient;
	}

	async enable() {
		if (!this.#walletClient) this.#walletClient = this.#options.walletClient;
		const address = this.#walletClient.account.address;
		this.events.emit("accountsChanged", [address]);
		return [address];
	}

	async disconnect() {
		this.events.emit("disconnect");
		this.#walletClient = undefined;
	}

	async getAccounts() {
		const address = this.#walletClient?.account.address;
		if (!address) return [];
		return [getAddress(address)];
	}

	getWalletClient(): PasskeyWalletClient {
		const walletClient = this.#walletClient;
		if (!walletClient) throw new Error("walletClient not found");
		return walletClient;
	}

	async switchChain(chainId: number) {
		this.#options.chainId = chainId;
		this.chainId = chainId;
		this.events.emit("chainChanged", chainId);
	}

	async switchWalletClient(walletClient: PasskeyWalletClient) {
		const address = walletClient.account.address;
		this.#walletClient = walletClient;
		this.events.emit("accountsChanged", [address]);
	}

	async watchAsset(options: WatchAssetParams) {
		return await this.#walletClient?.watchAsset(options);
	}

	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	async request(request: { method: string; params?: any[] }): Promise<any> {
		const { method, params = [] } = request;

		switch (method) {
			case "personal_sign":
			case "eth_sign": {
				const [address, messageHash] = params;

				if (
					this.#walletClient?.account.address.toLowerCase() !== address.toLowerCase() ||
					!messageHash.startsWith("0x")
				) {
					throw new Error("The address or message hash is invalid");
				}

				return (await this.#walletClient?.signMessage(messageHash)) || "0x";
			}

			case "eth_signTypedData":
			case "eth_signTypedData_v4": {
				const [address, typedData] = params;
				const parsedTypedData = typeof typedData === "string" ? JSON.parse(typedData) : typedData;

				if (this.#walletClient?.account.address.toLowerCase() !== address.toLowerCase()) {
					throw new Error("The address is invalid");
				}

				return (await this.#walletClient?.signTypedData(parsedTypedData)) || "0x";
			}

			case "eth_sendTransaction": {
				const [passedRequest] = params as [TransactionRequest];

				if (!this.#walletClient) throw new Error("No wallet client found");

				const request = await this.#walletClient.prepareTransactionRequest(passedRequest);
				const serializedTransaction = await this.#walletClient.signTransaction(request);

				if (!serializedTransaction) throw new Error("Failed to sign transaction");

				return await this.#walletClient?.sendRawTransaction({ serializedTransaction });
			}

			case "eth_accounts":
				return [this.#walletClient?.account.address];

			case "net_version":
			case "eth_chainId":
				return this.#walletClient?.chain.id;

			default:
				this.#walletClient?.transport.request({ method, params });
		}
	}

	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	on(event: Event, listener: (...args: any[]) => void) {
		this.events.on(event, listener);
		return this;
	}

	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	removeListener(event: Event, listener: (...args: any[]) => void) {
		this.events.removeListener(event, listener);
		return this;
	}
}
