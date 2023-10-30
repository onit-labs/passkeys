import {
	privateKeyToAddress,
	signMessage,
	signTransaction,
	signTypedData,
	toAccount,
} from "viem/accounts";
import { base64URLStringToHex } from "./utils/encoding";

import type { Account, Address, Hash, Hex, PrivateKeyAccount } from "viem";
import type { AuthenticationResponseJSON } from "./passkey.types";
import { Passkey } from "./passkey";
import { Base64URLString } from "webauthn-zod";

/**
 * Allow user to initiate the account having already verified the user holds the passkey
 * thus being able to pass the privateKey
 *
 * Or allow the user to delay initiation of the account until sign time
 */
type Params<TPasskey extends Passkey> = { passkey: TPasskey } & (
	| { address: Address; credentialId: Base64URLString }
	| { privateKey: Hash }
);

export class LargeBlobPasskeyAccount<TPasskey extends Passkey = Passkey> {
	address?: Address;
	credentialId?: Base64URLString;
	privateKey?: Hash;
	passkey: TPasskey;

	constructor(params: Params<TPasskey>) {
		this.passkey = params.passkey;

		if ("address" in params) {
			this.address = params.address;
			this.credentialId = params.credentialId;
		}

		if ("privateKey" in params) {
			this.privateKey = params.privateKey;
		}
	}

	initPrivateKeyFromPasskey(
		authenticationResponse: Pick<AuthenticationResponseJSON, "clientExtensionResults">,
	): Hex {
		const largeBlob = authenticationResponse?.clientExtensionResults.largeBlob?.blob;

		// TODO: should we encode the blob as JSON or just assume it is actually the privateKey?

		if (!largeBlob) {
			throw new Error("No blob stored on passkey");
		}

		// ! for now assuming that the blob is JUST a privateKey
		this.privateKey = base64URLStringToHex(largeBlob);

		return this.privateKey;
	}

	initAccount() {
		if (!this.address && this.privateKey) {
			this.address = privateKeyToAddress(this.privateKey);
		}
		if (!this.address) throw new Error("Failed to find address associted to the account");
	}

	toAccount(): PrivateKeyAccount {
		if (!this.address) this.initAccount();

		const getPrivateKey = async () => {
			if (this.privateKey) return this.privateKey;

			// - use passkey largeBlob extension to return the EOA privateKey
			if (!this.credentialId) throw new Error("No passkey credentialId was found");

			// TODO: if privateKey exists store it and delete from local?
			// TODO: or create a variable that detects if it has been stored and ensure that it is stored on passkey as well

			// @ts-expect-error: we ignore the challenge in our version
			const response = await this.passkey.get({
				allowCredentials: [{ type: "public-key", id: this.credentialId }],
			});

			if (!response) throw new Error("No response from passkey");
			console.log("toAccount - response", response);

			return this.initPrivateKeyFromPasskey(response);
		};

		return {
			...toAccount({
				// biome-ignore lint/style/noNonNullAssertion: we throw an error or initialise this
				address: this.address!, // TODO: add throw expression instead of ignoring?
				async signMessage({ message }) {
					console.log("signMessage", message);
					const privateKey = await getPrivateKey();
					return signMessage({ message, privateKey });
				},
				async signTransaction(transaction, { serializer } = {}) {
					const privateKey = await getPrivateKey();
					return signTransaction({ privateKey, transaction, serializer });
				},
				async signTypedData(typedData) {
					const privateKey = await getPrivateKey();
					return signTypedData({ ...typedData, privateKey });
				},
			}),
			source: "privateKey" as const,
		} satisfies Account;
	}
}

export type PasskeyAccount = ReturnType<InstanceType<typeof LargeBlobPasskeyAccount>["toAccount"]>;
