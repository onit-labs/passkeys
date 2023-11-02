"use server";
import type { VerifyAuthenticationResponseOpts } from "@simplewebauthn/server";
import {
	webauthnAuthenticationResponseSchema,
	type AuthenticationResponseJSON,
} from "webauthn-zod";
// @ts-ignore
import base64 from "@hexagon/base64";
import {
	AttestationObject,
	decodeAttestationObject,
	decodeClientDataJSON,
	parseAuthenticatorData,
	toHash,
	verifySignature,
} from "@simplewebauthn/server/helpers";
import {
	parseBackupFlags,
	type AuthenticationExtensionsAuthenticatorOutputs,
	matchExpectedRPID,
} from "../utils";
import { CredentialDeviceType } from "@simplewebauthn/typescript-types";

export async function verifyAuthentication(options: VerifyAuthenticationResponseOpts): Promise<{
	verified: boolean;
	authenticationInfo: {
		credentialID: Uint8Array;
		newCounter: number;
		userVerified: boolean;
		credentialDeviceType: CredentialDeviceType;
		credentialBackedUp: boolean;
		origin: string;
		rpID: string;
		authenticatorExtensionResults?: AuthenticationExtensionsAuthenticatorOutputs;
	};
}> {
	console.log("verifyAuthentication - options", options);

	// ! the following is adapted from @simplewebauthn/server
	const {
		response,
		expectedChallenge,
		expectedOrigin,
		expectedRPID,
		expectedType,
		authenticator,
		requireUserVerification = true,
		advancedFIDOConfig,
	} = options;
	const { id, rawId, type: credentialType, response: assertionResponse } = response;

	console.log("verify", {
		id,
		credentialType,
		assertionResponse,
	});

	const clientDataJSON = decodeClientDataJSON(assertionResponse.clientDataJSON);
	const { type, origin, challenge, tokenBinding } = clientDataJSON;
	const authDataBuffer = new Uint8Array(
		base64.toArrayBuffer(assertionResponse.authenticatorData) as ArrayBuffer,
	);
	const authData = parseAuthenticatorData(authDataBuffer);
	const { rpIdHash, flags, counter, extensionsData } = authData;

	// // Make sure the response's RP ID is ours
	// let expectedRPIDs = [];
	// if (typeof expectedRPID === "string") {
	// 	expectedRPIDs = [expectedRPID];
	// } else {
	// 	expectedRPIDs = [...(expectedRPID ?? [])];
	// }
	// const matchedRPID = await matchExpectedRPID(rpIdHash, expectedRPIDs);

	/**
	 * Use WebAuthn spec-defined rules for verifying UP and UV flags
	 */
	// WebAuthn only requires the user presence flag be true
	if (!flags.up) {
		throw new Error("User not present during authentication");
	}
	// Enforce user verification if required
	if (requireUserVerification && !flags.uv) {
		throw new Error("User verification required, but user could not be verified");
	}

	const clientDataHash = await toHash(base64.toArrayBuffer(assertionResponse.clientDataJSON, true));
	const signatureBase = new Uint8Array(authDataBuffer.length + clientDataHash.length);
	signatureBase.set(authDataBuffer);
	signatureBase.set(clientDataHash, authDataBuffer.length);
	const signature = base64.toArrayBuffer(assertionResponse.signature);

	// if ((counter > 0 || authenticator.counter > 0) && counter <= authenticator.counter) {
	// 	// Error out when the counter in the DB is greater than or equal to the counter in the
	// 	// dataStruct. It's related to how the authenticator maintains the number of times its been
	// 	// used for this client. If this happens, then someone's somehow increased the counter
	// 	// on the device without going through this site
	// 	throw new Error(
	// 		`Response counter value ${counter} was lower than expected ${authenticator.counter}`,
	// 	);
	// }

	const { credentialDeviceType, credentialBackedUp } = parseBackupFlags(flags);

	// return webauthnAuthenticationResponseSchema.parse({});
	return {
		verified: true,
		// verified: await verifySignature({
		// 	signature,
		// 	data: signatureBase,
		// 	credentialPublicKey: authenticator.credentialPublicKey,
		// }),
		authenticationInfo: {
			newCounter: counter,
			// credentialID: authenticator.credentialID,
			credentialID: '',
			userVerified: flags.uv,
			credentialDeviceType,
			credentialBackedUp,
			authenticatorExtensionResults: extensionsData,
			origin: clientDataJSON.origin,
			// rpID: matchedRPID,
			rpID: "localhost",
		},
	};
}
