import { ProviderNotFoundError, createConnector, normalizeChainId } from "@wagmi/core";
import type { Evaluate } from "@wagmi/core/internal";
import { WalletClient, getAddress, type Chain } from "viem";

import { WalletClientSigner, type SmartAccountProvider } from "@alchemy/aa-core";
import { ConnectorNotFoundError } from "wagmi";

const SHIM_DISCONNECT_KEY = "passkey.disconnect" as const;

type PasskeyConnectorParameters = Evaluate<{
	signer: WalletClientSigner;
	chain: Chain;
	provider: SmartAccountProvider;
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

type Properties = Omit<PasskeyConnectorParameters, "shimDisconnect">;
type StorageItem = { [SHIM_DISCONNECT_KEY]: true };

/**
 * Connector for Passkey Wallets
 */

export function passkeyConnector(parameters: PasskeyConnectorParameters) {
	const { shimDisconnect = true, provider } = parameters;

	return createConnector<SmartAccountProvider, Properties, StorageItem>((config) => ({
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

		// ? if using a EOA we could also include the related addresses in the list?
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
			return normalizeChainId(this.chain.id);
			// const provider = await this.getProvider();
			// if (!provider) throw new ConnectorNotFoundError();
			// return normalizeChainId(provider.chainId);
		},

		async getProvider() {
			return provider;
		},

		async getWalletClient({ chainId: _ }: { chainId?: number } = {}): Promise<WalletClient> {
			// TODO: handle chainId
			// @ts-expect-error
			return parameters.signer.client;
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
