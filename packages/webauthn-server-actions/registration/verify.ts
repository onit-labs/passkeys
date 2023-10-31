"use server";

import base64 from "@hexagon/base64";
// tODO: replace these with serialisable/zod versions
// import { verifyRegistrationResponse } from "@simplewebauthn/server";
import {
	AttestationObject,
	decodeAttestationObject,
	decodeClientDataJSON,
	parseAuthenticatorData,
} from "@simplewebauthn/server/helpers";
import {
	type RegistrationResponseJSON,
	webauthnRegistrationResponseSchema,
	AttestationFormat,
	Base64URLString,
	base64URLStringSchema,
} from "webauthn-zod";

import { z } from "zod";
import { action } from "../client";

// ! pull in fn/types that are not exposed by simplewebauthn atm

type AuthenticationExtensionsAuthenticatorOutputs = {
	devicePubKey?: DevicePublicKeyAuthenticatorOutput;
	uvm?: UVMAuthenticatorOutput;
};
type DevicePublicKeyAuthenticatorOutput = {
	dpk?: Uint8Array;
	sig?: string;
	nonce?: Uint8Array;
	scope?: Uint8Array;
	aaguid?: Uint8Array;
};
type UVMAuthenticatorOutput = {
	uvm?: Uint8Array[];
};

/**
 * Make sense of Bits 3 and 4 in authenticator indicating:
 *
 * - Whether the credential can be used on multiple devices
 * - Whether the credential is backed up or not
 *
 * Invalid configurations will raise an `Error`
 */
function parseBackupFlags({ be, bs }) {
	const credentialBackedUp = bs;
	let credentialDeviceType: CredentialDeviceType = "singleDevice";
	if (be) {
		credentialDeviceType = "multiDevice";
	}
	if (credentialDeviceType === "singleDevice" && credentialBackedUp) {
		throw new InvalidBackupFlags(
			"Single-device credential indicated that it was backed up, which should be impossible.",
		);
	}
	return { credentialDeviceType, credentialBackedUp };
}
class InvalidBackupFlags extends Error {
	constructor(message) {
		super(message);
		this.name = "InvalidBackupFlags";
	}
}

/**
 * The two types of credentials as defined by bit 3 ("Backup Eligibility") in authenticator data:
 * - `"singleDevice"` credentials will never be backed up
 * - `"multiDevice"` credentials can be backed up
 */
type CredentialDeviceType = "singleDevice" | "multiDevice";

export const verifyRegistration = action(
	z.any(),
	async ({
		response,
	}): Promise<{
		// TODO: create a webauthn schema for this?
		verified: boolean;
		registrationInfo?: {
			fmt: AttestationFormat;
			counter: number;
			aaguid: Base64URLString | undefined;
			credentialID: Base64URLString | undefined;
			credentialPublicKey: Base64URLString | undefined;
			credentialType: "public-key";
			attestationObject: AttestationObject;
			userVerified: boolean;
			credentialDeviceType: CredentialDeviceType;
			credentialBackedUp: boolean;
			origin: string;
			rpID?: string;
			authenticatorExtensionResults?: AuthenticationExtensionsAuthenticatorOutputs;
		};
	}> => {
		const attestationObject = decodeAttestationObject(
			base64.toArrayBuffer(response.response.attestationObject, true),
		);
		const clientDataJSON = decodeClientDataJSON(response.response.clientDataJSON);
		const { type, origin, challenge, tokenBinding } = clientDataJSON;
		const authData = parseAuthenticatorData(attestationObject.get("authData"));
		const { aaguid, rpIdHash, flags, credentialID, counter, credentialPublicKey, extensionsData } =
			authData;
		const { credentialDeviceType, credentialBackedUp } = parseBackupFlags(flags);

		return {
			verified: true,
			registrationInfo: {
				fmt: attestationObject.get("fmt"),
				counter,
				aaguid: aaguid ? base64URLStringSchema.parse(aaguid) : undefined,
				credentialID: credentialID ? base64URLStringSchema.parse(credentialID) : undefined,
				credentialPublicKey: credentialPublicKey
					? base64URLStringSchema.parse(credentialPublicKey)
					: undefined,
				credentialType: "public-key",
				attestationObject,
				userVerified: true,
				credentialDeviceType,
				credentialBackedUp,
				origin,
				authenticatorExtensionResults: extensionsData,
			},
		};
	},
);
