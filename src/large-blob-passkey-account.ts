import {
	privateKeyToAddress,
	signMessage,
	generatePrivateKey,
	signTransaction,
	signTypedData,
	toAccount,
	privateKeyToAccount,
} from "viem/accounts";
import { base64URLStringToHex } from "./utils/encoding";

import type { Address, CustomSource, Hash, Hex, JsonRpcAccount } from "viem";
import type { AuthenticationResponseJSON } from "./passkey.types";
import { Passkey } from "./passkey";
import { Base64URLString, base64URLStringSchema } from "./utils/webauthn-zod";
import { Storage, createStorage, noopStorage } from "wagmi";
import {
	CredentialIdEncodingError,
	MissingCredentialIdError,
	MissingUsernameError,
} from "./errors";
import { PrivateKeyAccount } from "node_modules/viem/_types/types/account";

type CredentialId = Base64URLString;

type StorageKeys = {
	"account-username": string;
	"account-credentialId": CredentialId;
	"account-largeBlob-accounts": Record<CredentialId, Address>;
	"account-privateKey": Hex;
};

/**
 * An `Account` type that is meant to 'mirror' the viem `Account` but will allow us to implement
 * our class using 'implements'
 *
 * TODO: decide whether we want to drop `signTransaction` for 4337 accounts or convert the value into a userOp &
 * intercept the sendTransaction passing it to the bundler
 */
type Account = CustomSource & JsonRpcAccount;

type Opts<TPasskey extends Passkey = Passkey> = {
	credentialId?: Base64URLString;
	username?: string;
	storePrivateKey?: boolean;
	passkey: TPasskey;
	storage?: typeof noopStorage;
};

/**
 *
 * TODO:
 * [x] Allow users to pass `storage` & a `storePrivateKey` flag
 * i. [ ] document that the storePrivateKey flag should only be enabled if a secure storage location is being provided
 *
 * TODO:
 * [x] If storage is not passed or there is no data in storage, a `credentialId` | `username` must be explicitly passed
 *
 * TODO:
 * [ ] If the user has not yet created a largeBlob on the passkey then
 * i.   [ ] create the EOA & store the private key locally (temporarily until the next signature or just invoke two sigs)?
 * ii.  [ ] based on the storage flag store the key or not
 * iii. [ ] *ALWAYS* store the credentialId on passkey creation & return to the developer so they can also handle storage
 *
 * TODO:
 * [ ] First check storage for Private Key (pk) (& later we can also add account index?)
 *
 * TODO:
 * [ ] Create signing functions for wagmi
 *
 *
 */
// export class LargeBlobPasskeyAccount<TPasskey extends Passkey = Passkey> implements Account {
export class LargeBlobPasskeyAccount<TPasskey extends Passkey = Passkey> implements Account {
	public credentialId?: Base64URLString;
	public username?: string;
	public passkey: TPasskey;
	public storage: Storage<StorageKeys>;

	constructor(
		public opts: Opts<TPasskey> = { passkey: undefined },
		/**
		 * @warning This is to appease wagmi/viem we are going to be presenting the 4337 account as the address rather than this signer
		 */
		public address: Address = "0x",
	) {
		this.username = this.opts.username;
		this.credentialId = this.opts.credentialId;

		this.storage = createStorage<StorageKeys>({
			key: "passkey-storage",
			storage:
				this.opts.storage ?? (typeof window !== "undefined" && window.localStorage)
					? window.localStorage
					: noopStorage,
		});

		// tODO: move this out of the opts arg once we adopt the tests properly
		this.passkey = this.opts.passkey;
		this.opts.storePrivateKey = this.opts.storePrivateKey ?? false;

		LargeBlobPasskeyAccount.syncStoredState(this);
	}

	private assertHasUsername(): asserts this is this & { username: string } {
		if (!this.username || typeof this.username !== "string") throw new MissingUsernameError();
	}

	private assertHasCredentialId(): asserts this is this & { credentialId: Base64URLString } {
		// tODO: test it is Base64Url
		if (!this.credentialId || typeof this.credentialId !== "string")
			throw new MissingCredentialIdError();
	}

	private assertHasSufficientInformation(): asserts this is this &
		({ username: string } | { credentialId: Base64URLString }) {
		try {
			this.assertHasCredentialId();
		} catch (error) {
			this.assertHasUsername();
		}
	}

	testAsserts() {
		this.assertHasSufficientInformation();
	}

	public static async init(opts?: Opts): Promise<LargeBlobPasskeyAccount> {
		const account = new LargeBlobPasskeyAccount(opts);

		await this.syncStoredState(account);

		if (account.credentialId && !base64URLStringSchema.safeParse(account.credentialId).success) {
			throw new CredentialIdEncodingError();
		}

		return account;
	}

	private async updateStoredAccounts({
		address,
		credentialId,
	}: { address: Address; credentialId: CredentialId }) {
		const accounts = await this.storage.getItem("account-largeBlob-accounts");

		if (address && credentialId && accounts && address === accounts?.[credentialId]) {
			this.storage.setItem("account-largeBlob-accounts", {
				...accounts,
				[credentialId]: address,
			});
		}
	}

	private async createEoa(credentialId?: CredentialId): Promise<PrivateKeyAccount> {
		const privateKey = generatePrivateKey();
		const account = privateKeyToAccount(privateKey);

		if (credentialId) {
			await this.updateStoredAccounts({ address: account.address, credentialId });
		}

		return account;
	}

	private async createAccount(username?: string): Promise<any> {
		// TODO: [ ] check for existence `username`
		// TODO: [ ] if it exists & we do not have the linked `credentialId` stored ... what to do?
		// TODO: [ ] if it exists & we do not have the linked `largeBlob-address` stored -> authenticate & store result
		// TODO: [ ] if neither create the eoa and store the bloby

		const response = await this.passkey.get({
			allowCredentials: [{ type: "public-key", id: this.credentialId }],
		});
	}

	/**
	 * Ensure that the provided account options and the stored options are up to date
	 * @param account {@link LargeBlobPasskeyAccount} the account to sync
	 */
	private static async syncStoredState(account: LargeBlobPasskeyAccount) {
		const [storedUsername, storedCredentialId] = await Promise.all(
			(["username", "credentialId"] as const).map((key) =>
				account.storage.getItem(`account-${key}`),
			),
		);

		if (!storedCredentialId && account.credentialId) {
			await account.storage.setItem("account-credentialId", account.credentialId);
		}

		if (!storedUsername && account.username) {
			await account.storage.setItem("account-username", account.username);
		}

		if (!!storedUsername && !account.username) {
			account.username = storedUsername;
		}

		if (!!storedCredentialId && !account.credentialId) {
			try {
				account.credentialId = base64URLStringSchema.parse(storedCredentialId);
			} catch (error) {
				throw new CredentialIdEncodingError();
			}
		}
	}

	async signMessage({ message }) {
		throw new Error("Method not implemented.");
	}

	async signTransaction(transaction, { serializer } = {}) {
		throw new Error("Method not implemented.");
	}

	async signTypedData(typedData) {
		throw new Error("Method not implemented.");
	}

	// async authenticate() {
	// 	this.assertHasSufficientInformation();
	// 	const { credentialId, privateKey } = this;
	// 	const passkey = new Passkey({ credentialId, privateKey });
	// 	const authenticationResponse = await passkey.authenticate();
	// 	this.credentialId = authenticationResponse.credentialId;
	// 	this.privateKey = authenticationResponse.privateKey;
	// 	this.address = privateKeyToAddress(authenticationResponse.privateKey);
	// 	return authenticationResponse;
	// }

	// async create() {
	// 	this.assertHasSufficientInformation();
	// 	const { credentialId, privateKey } = this;
	// 	const passkey = new Passkey({ credentialId, privateKey });
	// 	const authenticationResponse = await passkey.create();
	// 	this.credentialId = authenticationResponse.credentialId;
}

// export type PasskeyAccount = ReturnType<InstanceType<typeof LargeBlobPasskeyAccount>["toAccount"]>;
