import { Hex } from "viem";
import { uint8ArrayToBase64URLString } from "./utils/encoding";
import { Base64URLString } from "./webauthn-zod/helpers";

import type {
	VerifiedAuthenticationResponse,
	VerifiedRegistrationResponse,
	VerifyAuthenticationResponseOpts,
	VerifyRegistrationResponseOpts,
} from "@simplewebauthn/server";

import type {
	AuthenticationResponseJSON,
	PublicKeyCredentialCreationOptionsJSON,
	PublicKeyCredentialRequestOptionsJSON,
	RegistrationResponseJSON,
} from "./webauthn-zod";

type PasskeyParams = Pick<PublicKeyCredentialCreationOptionsJSON, "rp"> &
	Partial<
		Pick<PublicKeyCredentialCreationOptionsJSON, "pubKeyCredParams" | "authenticatorSelection">
	>;

interface WebauthnServerVerificationMethods {
	generateRegistrationOptions(
		options: Omit<PublicKeyCredentialCreationOptionsJSON, "challenge">,
	): Promise<PublicKeyCredentialCreationOptionsJSON>;

	generateAuthenticationOptions(
		options: Omit<PublicKeyCredentialRequestOptionsJSON, "challenge">,
	): Promise<PublicKeyCredentialRequestOptionsJSON>;

	verifyAuthentication(
		options: VerifyAuthenticationResponseOpts,
	): Promise<VerifiedAuthenticationResponse>;

	verifyRegistration(
		options: VerifyRegistrationResponseOpts,
	): Promise<VerifiedRegistrationResponse>;
}

/**
 * A generic type to emulate the json-ified result of the `get` function on the browser `navigator.credential` api
 * or the result `passkey` api from `react-native-passkeys`
 */
export abstract class Passkey implements WebauthnServerVerificationMethods {
	rp: PublicKeyCredentialCreationOptionsJSON["rp"];

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
		this.rp = params.rp;

		if (params.authenticatorSelection)
			this.authenticatorSelection = {
				...this.authenticatorSelection,
				...params.authenticatorSelection,
			};
	}

	abstract generateRegistrationOptions(
		options: Omit<PublicKeyCredentialCreationOptionsJSON, "challenge">,
	): Promise<PublicKeyCredentialCreationOptionsJSON>;

	abstract generateAuthenticationOptions(
		options: Omit<PublicKeyCredentialRequestOptionsJSON, "challenge">,
	): Promise<PublicKeyCredentialRequestOptionsJSON>;

	abstract verifyAuthentication(
		options: VerifyAuthenticationResponseOpts,
	): Promise<VerifiedAuthenticationResponse>;

	abstract verifyRegistration(
		options: VerifyRegistrationResponseOpts,
	): Promise<VerifiedRegistrationResponse>;

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

// THIS PROBABLY WON'T BE ABSTRACT
// TODO: update this signer to use a the methods on the above passkey class to implement the ability to sign messages with
// i.  [] k1
// ii. [] r1
export abstract class PasskeySigner {
	constructor(public passkey: Passkey, public params: unknown) {}

	/**
	 * @description A static helper method to make it easier to handle converting the signature result of a passkey in to
	 * something that is more easily passed onchain
	 *
	 * @param signature The resulting signature from a passkey verification in the standard ASN.1 format encoded as base64url
	 *
	 * @example ```ts
	 * const allowCredentials = [{ type: 'public-key', credentialId }]
	 * const passkeyResult = await this.passkey.get({ challenge, allowCredentials })
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
