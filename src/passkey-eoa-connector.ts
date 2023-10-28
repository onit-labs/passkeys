import { ProviderNotFoundError, createConnector, normalizeChainId } from "@wagmi/core";
import type { Evaluate } from "@wagmi/core/internal";
import {
	http,
	PublicClient,
	createPublicClient,
	createWalletClient,
	custom,
	getAddress,
} from "viem";

import { ConnectorNotFoundError } from "wagmi";
// TODO: split this into a different file and create a sca passkey account
import { PasskeyAccount } from "./large-blob-passkey-account";
import { PasskeyProvider, PasskeyWalletClient } from "./passkey-provider";

const SHIM_DISCONNECT_KEY = "passkey.disconnect" as const;

type PasskeyConnectorParameters = Evaluate<{
	account?: PasskeyAccount;
	publicClient?: PublicClient;
	chainId?: number;
	/**
	 * Connector automatically connects when used as Safe App.
	 *
	 * This flag simulates the disconnect behavior by keeping track of connection status in storage
	 * and only autoconnecting when previously connected by user action (e.g. explicitly choosing to connect).
	 *
	 * @default false
	 */
	shimDisconnect?: boolean | undefined;
}>;

type Provider = PasskeyProvider | undefined;
type Properties = Pick<PasskeyConnectorParameters, "account" | "chainId" | "publicClient">;
type StorageItem = { [SHIM_DISCONNECT_KEY]: true };

/**
 * Connector for Passkey Wallets
 */
export function passkeyConnector(parameters: PasskeyConnectorParameters = {}) {
	const { shimDisconnect = true } = parameters;

	let provider_: Provider | undefined = undefined;
	let publicClient_ = parameters.publicClient;

	return createConnector<Provider, Properties, StorageItem>((config) => ({
		id: "passkey",
		name: "Passkey",

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

				if (!publicClient_) publicClient_ = createPublicClient({ transport: http() });

				const provider = new PasskeyProvider({
					chainId: chain.id,
					walletClient: createWalletClient({
						account: this.account ?? parameters.account,
						chain,
						transport: custom(publicClient_),
					}),
				});
				provider_ = provider;
			}
			return provider_;
		},

		async getWalletClient({ chainId }: { chainId?: number } = {}): Promise<PasskeyWalletClient> {
			const provider = await this.getProvider();
			const chain = config.chains.find((x) => x.id === chainId);
			if (!provider) throw new Error("provider is required.");
			if (!chain) throw new Error("chain is required.");
			return createWalletClient({ account: this.account, chain, transport: custom(provider) });
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
		onAccountsChanged(accounts) {
			if (accounts.length === 0) config.emitter.emit("disconnect");
			else config.emitter.emit("change", { accounts: accounts.map(getAddress) });
		},
		onChainChanged(chain) {
			const chainId = normalizeChainId(chain);
			config.emitter.emit("change", { chainId });
		},
		async onDisconnect(_error) {
			config.emitter.emit("disconnect");

			const provider = await this.getProvider();
			provider?.removeListener("accountsChanged", this.onAccountsChanged);
			provider?.removeListener("chainChanged", this.onChainChanged);
			provider?.removeListener("disconnect", this.onDisconnect.bind(this));
		},
	}));
}
