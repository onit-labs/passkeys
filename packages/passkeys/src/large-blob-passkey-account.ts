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
import { Passkey } from "./passkey";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "webauthn-zod";
import { Base64URLString, base64URLStringSchema } from "webauthn-zod";
import { Storage, createStorage, noopStorage } from "wagmi";
import {
	CredentialIdEncodingError,
	MissingCredentialIdError,
	MissingUsernameError,
} from "./errors";
import { PrivateKeyAccount } from "node_modules/viem/_types/types/account";
import { ZodType, z } from "zod";
import {
	PublicKeyCredentialRequestOptionsJSON,
	PublicKeyCredentialCreationOptionsJSON,
} from "webauthn-zod";
import {
	VerifiedAuthenticationResponse,
	VerifiedRegistrationResponse,
} from "@simplewebauthn/server";
import { SetRequired } from "./types";

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

type Opts<
	TPasskey extends Passkey = Passkey,
	TLargeBlobSchema extends z.Schema<
		// biome-ignore lint/suspicious/noExplicitAny: <explanation>
		z.ZodObject<{ privateKey: Address } & Record<string, any>>
	> = typeof defaultLargeBlobSchema,
> = {
	credentialId?: Base64URLString;
	username?: string;
	/**
	 * @warning This flag should only be enabled if a secure storage location is being provided. Otherwise the users will
	 * be stored in **plain-text** in `localStorage`!
	 */
	storePrivateKey?: boolean;
	passkey: TPasskey;
	storage?: typeof noopStorage;
	largeBlobSchema?: TLargeBlobSchema;
};

export class LargeBlobPasskeyAccount<
	TPasskey extends Passkey = Passkey,
	TLargeBlobSchema extends z.Schema<
		// biome-ignore lint/suspicious/noExplicitAny: <explanation>
		z.ZodObject<{ privateKey: Address } & Record<string, any>>
	> = typeof defaultLargeBlobSchema,
> implements Account
{
	public credentialId?: Base64URLString;
	public username?: string;
	public passkey: TPasskey;
	public storage: Storage<StorageKeys>;
	public largeBlobSchema: TLargeBlobSchema = defaultLargeBlobSchema;

	constructor(
		public opts: Opts<TPasskey, TLargeBlobSchema> = { passkey: undefined },
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

	private async createEoa(): Promise<{ account: PrivateKeyAccount; privateKey: Hex }> {
		const privateKey = generatePrivateKey();
		const account = privateKeyToAccount(privateKey);

		if (this.opts.storePrivateKey) await this.storage.setItem("account-privateKey", privateKey);

		return { account, privateKey };
	}

	private async createAccount(username?: string): Promise<PrivateKeyAccount | undefined> {
		/**
		 * TODO:
		 * 	[ ] if `username` exists & we do not have the linked `credentialId` stored allow the user to sign in with no
		 * 			`allowedCredentials` & verify the returned data against server-side data to re-capture the credentialId
		 *
		 */
		// - if `credentialId` exists then authenticate passkey & check largeBlob for privateKey
		if (this.credentialId) {
			const authentication = await this.authenticate({
				allowCredentials: [{ type: "public-key" as const, id: this.credentialId }],
				extensions: { largeBlob: { read: true } },
			});

			if (authentication?.verified && authentication?.response) {
				const largeBlob = authentication.response.clientExtensionResults.largeBlob?.blob;
				// - make sure the blob matches our expectation of a private key
				if (largeBlob) {
					const blobData = this.deserialiseLargeBlob(largeBlob);
					return privateKeyToAccount(blobData.privateKey);
					// - make sure private key matches the stored address
				}
			}
		}

		// - no `credentialId` or no account found on the blob
		// - use username to create an EOA in the blob
		if (username) {
			// - create EOA for storing on the largeBlob & identifying the address with the userId
			const eoa = await this.createEoa();

			// - verify the passkey supports largeBlob
			const registration = await this.register({
				extensions: { largeBlob: { support: "required" } },
				user: {
					id: base64.fromBuffer(fromHex(eoa.account.publicKey, "bytes"), true),
					name: username,
					displayName: username,
				},
			});

			if (registration?.verified && registration.response && registration?.info?.credentialID) {
				// - set & store the credentialId
				const credentialId = base64.fromBuffer(registration.info.credentialID, true);
				await this.updateStoredAccounts({ address: eoa.account.address, credentialId });
				this.credentialId = credentialId;

				// - make sure largeBlob is supported and store the key
				if (registration.response.clientExtensionResults.largeBlob?.supported) {
					const authentication = await this.authenticate({
						// biome-ignore lint/style/noNonNullAssertion: we throw before this if undefined
						allowCredentials: [{ type: "public-key" as const, id: this.credentialId! }],
						extensions: {
							largeBlob: { write: this.serialiseLargeBlob({ privateKey: eoa.privateKey }) },
						},
					});

					if (authentication?.verified && authentication?.response) {
						console.log("response verified", authentication.response);
						const largeBlob = authentication.response.clientExtensionResults.largeBlob?.blob;
						// TODO: make sure the blob matches our expectation of a private key
						if (largeBlob) {
							const blobData = this.deserialiseLargeBlob(largeBlob);
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

	/**
	 * TODO:
	 *  [] given a type (r1 or k1) decide which signing type to do (the passkey signer should handle all the challenge stuff)
	 *
	 * TODO:
	 * [ ] First check storage for Private Key (pk) (& later we can also add account index?)
	 *
	 * TODO:
	 * [ ] Create signing functions for wagmi
	 *
	 */

	async signMessage({ message }) {
		throw new Error("Method not implemented.");
	}

	async signTypedData(typedData) {
		throw new Error("Method not implemented.");
	}

	async signTransaction(transaction, { serializer } = {}) {
		throw new Error("Method `signTransaction` not supported.");
	}

	async authenticate(options: Omit<PublicKeyCredentialRequestOptionsJSON, "challenge">): Promise<
		| { response: AuthenticationResponseJSON; verified: false }
		| {
				response: AuthenticationResponseJSON;
				info: VerifiedAuthenticationResponse["authenticationInfo"];
				verified: true;
		  }
		| undefined
	> {
		const opts = await this.passkey.generateAuthenticationOptions({
			rpId: this.passkey.rp.id,
			...options,
		});

		const authenticationResponse = await this.passkey.get(opts);

		if (authenticationResponse) {
			const response = await this.passkey.verifyAuthentication({
				// ! we should also allow for arbitrary strings here to allow for updates to the spec
				// @ts-expect-error: Type `string` is not assignable to type `AuthenticatorAttachment | undefined`
				response: authenticationResponse,
			});

			if (response.verified) {
				return {
					verified: true,
					response: authenticationResponse,
					info: response.authenticationInfo,
				};
			} else return { verified: false, response: authenticationResponse };
		}
	}

	async register(
		options: Omit<PublicKeyCredentialCreationOptionsJSON, "challenge" | "rp" | "pubKeyCredParams"> &
			Partial<Pick<PublicKeyCredentialCreationOptionsJSON, "rp" | "pubKeyCredParams">>,
	): Promise<
		| {
				verified: true;
				response: RegistrationResponseJSON;
				info?: SetRequired<
					NonNullable<VerifiedRegistrationResponse["registrationInfo"]>,
					"credentialID"
				>;
		  }
		| {
				verified: false;
				response: RegistrationResponseJSON;
		  }
		| undefined
	> {
		// - verify the passkey supports largeBlob
		const opts = await this.passkey.generateRegistrationOptions({
			...this.passkey,
			...options,
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

				return { response: registrationResponse, verified: true, info: response.registrationInfo };
			} else
				return {
					verified: false,
					response: registrationResponse,
				};
		}
	}
}

// export type PasskeyAccount = ReturnType<InstanceType<typeof LargeBlobPasskeyAccount>["toAccount"]>;
