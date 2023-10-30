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

import * as base64 from "@hexagon/base64";
import {
	getAddress,
	type Address,
	type CustomSource,
	type Hash,
	type Hex,
	type JsonRpcAccount,
	fromHex,
} from "viem";
import type { AuthenticationResponseJSON } from "./passkey.types";
import { Passkey } from "./passkey";
import { Base64URLString, base64URLStringSchema } from "./webauthn-zod/helpers";
import { Storage, createStorage, noopStorage } from "wagmi";
import {
	CredentialIdEncodingError,
	MissingCredentialIdError,
	MissingUsernameError,
} from "./errors";
import { PrivateKeyAccount } from "node_modules/viem/_types/types/account";
import { ZodType, z } from "zod";

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
	largeBlobSchema?: ZodType;
};

export const zodHexString = z.preprocess(
	(val) => {
		if (typeof val !== "string") return "0x";
		if (!val.startsWith("0x")) return `0x${val}`;
		return val;
	},
	z.custom<Hex>((val) => new RegExp(/0x[a-f0-9]*$/, "gi").test(val as string)),
);

export const zodEthAddress = zodHexString.refine(getAddress);

const defaultLargeBlobSchema = z.object({ privateKey: zodHexString });

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
export class LargeBlobPasskeyAccount<
	TPasskey extends Passkey = Passkey,
	TLargeBlobSchema extends ZodType = z.infer<typeof defaultLargeBlobSchema>,
> implements Account
{
	public credentialId?: Base64URLString;
	public username?: string;
	public passkey: TPasskey;
	public storage: Storage<StorageKeys>;
	public largeBlobSchema = defaultLargeBlobSchema;

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

		if (this.opts.largeBlobSchema) {
			this.largeBlobSchema = this.opts.largeBlobSchema;
		}

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

	// TODO: [ ] create wallet for viem account with passed username
	// TODO: [ ] recover wallet for viem account with passed credential
	// ? maybe after first recovery we can keep the privateKey in memory as a LocalAccount?

	private async createEoa(
		credentialId?: CredentialId,
	): Promise<{ account: PrivateKeyAccount; privateKey: Hex }> {
		const privateKey = generatePrivateKey();
		const account = privateKeyToAccount(privateKey);

		if (credentialId) {
			await this.updateStoredAccounts({ address: account.address, credentialId });
		}

		return { account, privateKey };
	}

	private async createAccount(username?: string): Promise<PrivateKeyAccount | undefined> {
		// TODO: [ ] check for existence `username`
		// TODO: [ ] if it exists & we do not have the linked `credentialId` stored ... what to do?
		// TODO: [ ] if it exists & we do not have the linked `largeBlob-address` stored -> authenticate & store result
		// TODO: [ ] if neither create the eoa and store the bloby

		// - if `credentialId` exists then authenticate passkey & check largeBlob for privateKey
		if (this.credentialId) {
			const allowCredentials = [{ type: "public-key" as const, id: this.credentialId }];

			const opts = await this.passkey.generateAuthenticationOptions({
				rpId: this.passkey.rp.id,
				allowCredentials,
				extensions: { largeBlob: { read: true } },
			});

			const authenticationResponse = await this.passkey.get(opts);

			if (authenticationResponse) {
				const response = await this.passkey.verifyAuthentication({
					// ! we should also allow for arbitrary strings here to allow for updates to the spec
					// @ts-expect-error: Type `string` is not assignable to type `AuthenticatorAttachment | undefined`
					response: authenticationResponse,
				});

				if (response.verified) {
					console.log("response verified", response);
					const largeBlob = authenticationResponse.clientExtensionResults.largeBlob?.blob;
					// - make sure the blob matches our expectation of a private key
					if (largeBlob) {
						const blobData = this.deserialiseLargeBlob(largeBlob);
						return privateKeyToAccount(blobData.privateKey);
						// - make sure private key matches the stored address
					}
				}
			}
		}

		// - no `credentialId` or no account found on the blob
		// - use username to create an EOA in the blob
		if (username) {
			// - create EOA for storing on the largeBlob & identifying the address with the userId
			const eoa = await this.createEoa();

			// - verify the passkey supports largeBlob
			const opts = await this.passkey.generateRegistrationOptions({
				...this.passkey,
				extensions: { largeBlob: { support: "required" } },
				user: {
					id: base64.fromBuffer(fromHex(eoa.publicKey, "bytes"), true),
					name: username,
					displayName: username,
				},
			});

			const registrationResponse = await this.passkey.create(opts);

			if (registrationResponse) {
				const response = await this.passkey.verifyRegistration({
					// @ts-expect-error: Type `string` is not assignable to type `AuthenticatorTransportFuture[] | undefined`
					// ! we should also allow for arbitrary strings here to allow for updates to the spec
					response: registrationResponse,
				});

				if (response.verified) {
					console.log("response verified", response);

					if (!response.registrationInfo?.credentialID)
						throw new Error("Verified webauthn response without returning `credentialId`");

					// - set & store the credentialId
					this.credentialId = base64.fromBuffer(response.registrationInfo.credentialID, true);

					// - make sure largeBlob is supported and store the key
					if (registrationResponse.clientExtensionResults.largeBlob?.supported) {
						// biome-ignore lint/style/noNonNullAssertion: we throw before this if undefined
						const allowCredentials = [{ type: "public-key" as const, id: this.credentialId! }];

						const authOpts = await this.passkey.generateAuthenticationOptions({
							rpId: this.passkey.rp.id,
							allowCredentials,
							extensions: {
								largeBlob: { write: this.serialiseLargeBlob({ privateKey: eoa.privateKey }) },
							},
						});

						const authenticationResponse = await this.passkey.get(authOpts);

						if (authenticationResponse) {
							const response = await this.passkey.verifyAuthentication({
								// ! we should also allow for arbitrary strings here to allow for updates to the spec
								response: authenticationResponse,
							});

							// TODO: verify the blob has been stored successfully!
							// TODO: if a blob has not been stored successfully we should raise it to the user to NOT send funds
							// TODO: to the account until it is
							if (response.verified) {
								console.log("response verified", response);
								const largeBlob = authenticationResponse.clientExtensionResults.largeBlob?.blob;
								// - make sure the blob matches our expectation of a private key
								if (largeBlob) {
									const blobData = this.deserialiseLargeBlob(largeBlob);
								}
							}
						}
					}
				}
			}

			return eoa.account;
		}
	}

	private deserialiseLargeBlob(blob: Base64URLString): z.infer<typeof this.largeBlobSchema> {
		return this.largeBlobSchema.parse(JSON.parse(base64.ToString(blob, true)));
	}

	private serialiseLargeBlob(blobData: z.infer<typeof this.largeBlobSchema>): Base64URLString {
		return base64.fromString(JSON.stringify(this.largeBlobSchema.parse(blobData)), true);
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

	// tODO: [] given a type (r1 or k1) decide which signing type to do (the passkey signer should handle all the challenge stuff)

	async signMessage({ message }) {
		throw new Error("Method not implemented.");
	}

	async signTypedData(typedData) {
		throw new Error("Method not implemented.");
	}

	async signTransaction(transaction, { serializer } = {}) {
		throw new Error("Method `signTransaction` not supported.");
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
