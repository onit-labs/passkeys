"use server";

// @ts-ignore
import base64 from "@hexagon/base64";
// tODO: replace these with serialisable/zod versions
// import { verifyRegistrationResponse } from "@simplewebauthn/server";
import {
	AttestationObject,
	decodeAttestationObject,
	decodeClientDataJSON,
	parseAuthenticatorData,
} from "@simplewebauthn/server/helpers";
import type { CredentialDeviceType } from "@simplewebauthn/typescript-types";
import {
	type RegistrationResponseJSON,
	webauthnRegistrationResponseSchema,
	AttestationFormat,
	Base64URLString,
	base64URLStringSchema,
} from "webauthn-zod";

import { z } from "zod";
import { action } from "../client";
import { parseBackupFlags, type AuthenticationExtensionsAuthenticatorOutputs } from "../utils";

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

		// TODO: verify the challenge with iron-session seal

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
