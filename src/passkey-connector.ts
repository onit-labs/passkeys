import type { getConfig } from '@wagmi/core'
import { createWalletClient, custom, getAddress } from 'viem'
import { Connector, ConnectorNotFoundError } from 'wagmi'

import { PasskeyAccount, PresentationParams } from './large-blob-passkey-account'
import { PasskeyProvider, PasskeyProviderOptions, PasskeyWalletClient } from './passkey-provider'

// ! taken from https://github.com/wagmi-dev/wagmi/blob/6f47485ec9837059def3b1a8df547de9eda16284/packages/connectors/src/utils/normalizeChainId.ts
function normalizeChainId(chainId: string | number | bigint) {
	if (typeof chainId === 'string')
		return Number.parseInt(chainId, chainId.trim().substring(0, 2) === '0x' ? 16 : 10)
	if (typeof chainId === 'bigint') return Number(chainId)
	return chainId
}

type WagmiConfig = Pick<ReturnType<typeof getConfig>, 'publicClient' | 'lastUsedChainId' | 'chains'>

/**
 * Connector for Passkey Wallets
 */
export class PasskeyConnector extends Connector<PasskeyProvider, PasskeyProviderOptions> {
	readonly id = 'passkey'
	readonly name = 'Passkey'
	ready = true

	account: PasskeyAccount
	#provider?: PasskeyProvider
	#config?: WagmiConfig

	protected shimDisconnectKey = `${this.id}.shimDisconnect`

	constructor({
		account,
		config,
		options: options_,
	}: {
		account: PasskeyAccount
		presentationParams: PresentationParams
		config: WagmiConfig
		// biome-ignore lint/suspicious/noExplicitAny: <explanation>
		options?: any
	}) {
		const options = {
			shimDisconnect: false,
			...options_,
		}
		super({ chains: config.chains, options })

		this.account = account
		this.#config = config
	}

	async connect() {
		const provider = await this.getProvider()
		if (!provider) throw new ConnectorNotFoundError()

		if (provider.on) {
			provider.on('accountsChanged', this.onAccountsChanged)
			provider.on('chainChanged', this.onChainChanged)
			provider.on('disconnect', this.onDisconnect)
		}

		this.emit('message', { type: 'connecting' })

		const account = await this.getAccount()
		const id = await this.getChainId()

		// Add shim to storage signalling wallet is connected
		if (this.options.shimDisconnect) this.storage?.setItem(this.shimDisconnectKey, true)

		return {
			account,
			chain: { id, unsupported: this.isChainUnsupported(id) },
		}
	}

	async disconnect() {
		const provider = await this.getProvider()
		if (!provider?.removeListener) return

		provider.removeListener('accountsChanged', this.onAccountsChanged)
		provider.removeListener('chainChanged', this.onChainChanged)
		provider.removeListener('disconnect', this.onDisconnect)

		// Remove shim signalling wallet is disconnected
		if (this.options.shimDisconnect) this.storage?.removeItem(this.shimDisconnectKey)
	}

	async getAccount() {
		const provider = await this.getProvider()
		if (!provider) throw new ConnectorNotFoundError()
		const accounts = (await provider.request({ method: 'eth_accounts' })) as [string, ...string[]]
		return getAddress(accounts[0])
	}

	async getChainId() {
		const provider = await this.getProvider()
		if (!provider) throw new ConnectorNotFoundError()
		return normalizeChainId(provider.chainId)
	}

	async getProvider() {
		if (!this.#provider) {
			const chain = this.chains?.[0]
			if (!chain) throw new Error('Unsupported chain')

			const { publicClient, lastUsedChainId } = this.#config ?? {}

			if (!publicClient) throw new Error('Missing publicClient')

			const provider = new PasskeyProvider({
				chainId: lastUsedChainId ?? chain?.id,
				walletClient: createWalletClient({
					account: this.account,
					chain,
					transport: custom(publicClient),
				}),
			})
			this.#provider = provider
		}
		return this.#provider
	}

	async getWalletClient({ chainId }: { chainId?: number } = {}): Promise<PasskeyWalletClient> {
		const provider = await this.getProvider()
		const chain = this.chains.find((x) => x.id === chainId)
		if (!provider) throw new Error('provider is required.')
		if (!chain) throw new Error('chain is required.')
		return createWalletClient({ account: this.account, chain, transport: custom(provider) })
	}

	async isAuthorized() {
		try {
			if (
				this.options.shimDisconnect &&
				// If shim does not exist in storage, wallet is disconnected
				!this.storage?.getItem(this.shimDisconnectKey)
			)
				return false

			const address = await this.getAccount()

			return !!address
		} catch {
			return false
		}
	}

	protected onAccountsChanged(_accounts: string[]) {
		// TODO
	}

	protected onChainChanged(_chainId: string | number) {
		// TODO
	}

	protected onDisconnect() {
		this.emit('disconnect')
	}
}
