import { ProviderNotFoundError, createConnector, normalizeChainId } from "@wagmi/core";
import type { Evaluate } from "@wagmi/core/internal";
import {
	createWalletClient,
	custom,
	getAddress,
	type Chain,
	type Transport,
	type WalletClient,
} from "viem";

import { ConnectorNotFoundError } from "wagmi";
import { type SmartAccountProvider, type SmartAccountSigner } from "@alchemy/aa-core";
import { PasskeyAccount as LargeBlobPasskeyAccount } from "./large-blob-passkey-account";
import { SmartAccount } from "./smart-account";
import { Base64URLString } from "./utils/webauthn-zod";

const SHIM_DISCONNECT_KEY = "passkey.disconnect" as const;

export type PasskeyWalletClient = WalletClient<
	Transport,
	Chain,
	LargeBlobPasskeyAccount | SmartAccount
>;

type LargeBlobSmartAccountConnector = {
	type: "large-blob-sca-signer-passkey";
	account: SmartAccount;
	chainId: number;
};

type R1SmartAccountConnector = {
	type: "r1-sca-signer-passkey";
	account: SmartAccount;
	chainId: number;
};

type Provider = SmartAccountProvider | undefined;

type PasskeyConnectorParameters = Evaluate<
	{
		getProvider: (params: { signer: SmartAccountSigner; chain: Chain }) => Provider;
		/**
		 * Connector automatically connects when used as Safe App.
		 *
		 * This flag simulates the disconnect behavior by keeping track of connection status in storage
		 * and only autoconnecting when previously connected by user action (e.g. explicitly choosing to connect).
		 *
		 * @default false
		 */
		shimDisconnect?: boolean | undefined;
	} & (LargeBlobSmartAccountConnector | R1SmartAccountConnector)
>;

type Properties = Omit<PasskeyConnectorParameters, "shimDisconnect">;
type StorageItem = { [SHIM_DISCONNECT_KEY]: true };

/**
 * Connector for Passkey Wallets
 */

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
export function passkeyConnector(parameters: PasskeyConnectorParameters = {} as any) {
	const { shimDisconnect = true } = parameters;

	let provider_: Provider | undefined = undefined;
	let walletClient: PasskeyWalletClient | undefined = undefined;

	return createConnector<Provider, Properties, StorageItem>((config) => ({
		id: "4337-passkey",
		name: "4337 Passkey",

		...parameters,

		async connect() {
			const provider = await this.getProvider();
			if (!provider) throw new ConnectorNotFoundError();

			const accounts = await this.getAccounts();
			const chainId = await this.getChainId();

			provider.on("disconnect", this.onDisconnect.bind(this));

			// Add shim to storage signalling wallet is connected
			if (shimDisconnect) config.storage?.setItem(SHIM_DISCONNECT_KEY, true);

			return { accounts, chainId };
		},

		async disconnect() {
			const provider = await this.getProvider();
			if (!provider) throw new ProviderNotFoundError();

			provider.removeListener("disconnect", this.onDisconnect);

			// Remove shim signalling wallet is disconnected
			if (shimDisconnect) config.storage?.removeItem(SHIM_DISCONNECT_KEY);
		},

		async getAccounts() {
			const provider = await this.getProvider();
			if (!provider) throw new ProviderNotFoundError();
			const accounts = (await provider.request({ method: "eth_accounts" })) as [
				string,
				...string[],
			];
			return accounts.map(getAddress);
		},

		async getChainId() {
			const provider = await this.getProvider();
			if (!provider) throw new ConnectorNotFoundError();
			return normalizeChainId(provider.chainId);
		},

		async getProvider() {
			if (!provider_) {
				const chain = config.chains.find((x) => x.id === parameters?.chainId);
				if (!chain) throw new Error("Unsupported chain");

				provider_ = parameters.getProvider({ signer: parameters.account, chain });
			}
			return provider_;
		},

		async getWalletClient({ chainId }: { chainId?: number } = {}): Promise<PasskeyWalletClient> {
			if (!walletClient) {
				const provider = await this.getProvider();
				const chain = config.chains.find((x) => x.id === chainId);
				if (!provider) throw new Error("provider is required.");
				if (!chain) throw new Error("chain is required.");
				walletClient = createWalletClient({
					account: parameters.account,
					chain,
					transport: custom(provider),
				});
			}
			return walletClient;
		},

		async isAuthorized() {
			try {
				const isDisconnected =
					shimDisconnect &&
					// If shim does not exist in storage, wallet is disconnected
					!config.storage?.getItem(SHIM_DISCONNECT_KEY);

				if (isDisconnected) return false;

				const accounts = await this.getAccounts();

				return !!accounts.length;
			} catch {
				return false;
			}
		},

		async onDisconnect(_error) {
			config.emitter.emit("disconnect");

			const provider = await this.getProvider();
			provider?.removeListener("accountsChanged", this.onAccountsChanged);
			provider?.removeListener("chainChanged", this.onChainChanged);
			provider?.removeListener("disconnect", this.onDisconnect.bind(this));
		},

		onAccountsChanged(accounts) {
			if (accounts.length === 0) config.emitter.emit("disconnect");
			else config.emitter.emit("change", { accounts: accounts.map(getAddress) });
		},

		onChainChanged(chain) {
			const chainId = normalizeChainId(chain);
			config.emitter.emit("change", { chainId });
		},
	}));
}
