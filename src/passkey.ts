import { Address, Hex } from "viem";
import {
	AuthenticationResponseJSON,
	PublicKeyCredentialCreationOptionsJSON,
	PublicKeyCredentialRequestOptionsJSON,
	RegistrationResponseJSON,
} from "./passkey.types";
import { uint8ArrayToBase64URLString } from "./utils/encoding";
import { Base64URLString } from "./utils/webauthn-zod";

type PasskeyParams = Pick<PublicKeyCredentialCreationOptionsJSON, "rp" | "authenticatorSelection"> &
	Partial<Pick<PublicKeyCredentialCreationOptionsJSON, "pubKeyCredParams">>;

/**
 * A generic type to emulate the json-ified result of the `get` function on the browser `navigator.credential` api
 * or the result `passkey` api from `react-native-passkeys`
 */
export abstract class Passkey {
	/**
	 * This is simply the most widely supported public key type for webauthn
	 * so we adopt it as a default to ease the boiler plate for the end user
	 */
	pubKeyCredParams: PublicKeyCredentialCreationOptionsJSON["pubKeyCredParams"] = [
		{ type: "public-key", alg: -7 },
	];

	/**
	 * These are the default selector options for a passkey vs a 'regular' webauthn credential
	 */
	authenticatorSelection: PublicKeyCredentialCreationOptionsJSON["authenticatorSelection"] = {
		residentKey: "required",
		userVerification: "preferred",
	};

	constructor(public params: PasskeyParams) {
		if (params.authenticatorSelection)
			this.authenticatorSelection = {
				...this.authenticatorSelection,
				...params.authenticatorSelection,
			};
	}

	abstract create(
		options: Omit<PublicKeyCredentialCreationOptionsJSON, "rp" | "pubKeyCredParams"> &
			Partial<Pick<PublicKeyCredentialCreationOptionsJSON, "pubKeyCredParams">>,
	): Promise<RegistrationResponseJSON | null>;

	abstract get(
		options: Omit<PublicKeyCredentialRequestOptionsJSON, "rpId">,
	): Promise<AuthenticationResponseJSON | null>;
}

interface R1SignatureResult {
	r: Base64URLString;
	s: Base64URLString;
	rawSignature: Base64URLString;
	authenticatorDataHex: Hex;
	clientDataJSONHex: Hex;
}

interface CounterFactualSmartAccountArgs {
	/**
	 * This is the salt that will be used when deploying the account
	 */
	salt?: bigint;
	factory: {
		/**
		 * The abi of the smart account factory or just the deploy function
		 * @warning should be in a form that is parsable by viem [`parseAbi`](https://viem.sh/docs/abi/parseAbi.html#parseabi)
		 */
		deployFunctionAbi: readonly string[];
		deployFunctionName: string;
		/**
		 * The accounts factory address
		 */
		address: Address;
	};

	// /**
	//  * This is the init code needed to deploy the account
	//  */
	// initCode: Hex;
}

interface DeployedSmartAccountArgs {
	/**
	 * The deployed smart account address
	 */
	address: Address;
}

interface BaseSmartAccountPasskeyParams {
	/**
	 * This is the credentialId of the passkey used to identify the correct passkey
	 */
	credentialId: Base64URLString;
	/**
	 * The accounts supported entrypoint
	 */
	entrypoint: Address;
}

type SmartAccountPasskeyParams = BaseSmartAccountPasskeyParams &
	(CounterFactualSmartAccountArgs | DeployedSmartAccountArgs);

// tODO: update this to be the signer
export abstract class PasskeySigner extends Passkey {
	constructor(public account: SmartAccountPasskeyParams, public params: PasskeyParams) {
		super(params);
	}

	assertsIsDeployed(): asserts this is Extract<
		this,
		{ account: { smartAccount: DeployedSmartAccountArgs } }
	> {
		// TODO: With the initCode we could actually assign the counterfactual address if not deployed
		if ("factory" in this.account) throw new Error("This account has not been deployed");
	}

	/**
	 * @description A static helper method to make it easier to handle converting the signature result of a passkey in to
	 * something that is more easily passed onchain
	 *
	 * @param signature The resulting signature from a passkey verification in the standard ASN.1 format encoded as base64url
	 *
	 * @example ```ts
	 * const allowCredentials = [{ type: 'public-key', credentialId }]
	 * const passkeyResult = await this.get({ challenge, allowCredentials })
	 * const base64UrlSignature = passkeyResult.response.signature
	 * const { rawSignature, r, s } = this.getRAndSFromSignature(base64UrlSignature)
	 * ```
	 */
	static getRAndSFromSignature(signature: Base64URLString) {
		const signatureBytes = Buffer.from(signature);
		const usignature = new Uint8Array(signatureBytes);
		const rStart = usignature[4] === 0 ? 5 : 4;
		const rEnd = rStart + 32;
		const sStart = usignature[rEnd + 2] === 0 ? rEnd + 3 : rEnd + 2;
		const r = usignature.slice(rStart, rEnd);
		const s = usignature.slice(sStart);

		const rawSignature = new Uint8Array([...r, ...s]);

		return {
			rawSignature: uint8ArrayToBase64URLString(rawSignature),
			r: uint8ArrayToBase64URLString(r),
			s: uint8ArrayToBase64URLString(s),
		} satisfies Pick<R1SignatureResult, "r" | "rawSignature" | "s">;
	}

	/**
	 * @description If the smart account uses a passkey as the signer (i.e. verifies with secp256r1 onchain) then this
	 * method is what is used to sign the transaction.
	 *
	 * **Your method implementation should handle all the normal server verification involved with using webauthn**
	 *
	 * @param messageBytes The message to be signed in base64url format
	 * @param credentialId The credentialId of the passkey to sign with in base64url format
	 * @returns `R1SignatureResult` {@link R1SignatureResult} The signature and other data associated with the passkey verification result
	 * @throws {Error}
	 */
	abstract signR1(
		messageBytes: Base64URLString,
		credentialId: Base64URLString,
	): Promise<R1SignatureResult | null>;
}
