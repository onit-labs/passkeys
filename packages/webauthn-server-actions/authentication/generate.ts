"use server";
import {
	publicKeyCredentialRequestOptionsSchema,
	type PublicKeyCredentialRequestOptionsJSON,
} from "webauthn-zod";
// import { cookies } from "next/headers";

import { generateAuthenticationOptions as generateOptions } from "@simplewebauthn/server";

export async function generateAuthenticationOptions(
	options: Omit<PublicKeyCredentialRequestOptionsJSON, "challenge">,
): Promise<PublicKeyCredentialRequestOptionsJSON> {
	console.log("generateAuthenticationOptions - options", options);

	const generated = await generateOptions({
		...options,
		rpID: options.rpId,
		// @ts-expect-error: Type `string` is not assignable to type `AuthenticatorTransportFuture`
		// - as per the spec this should be allowed to be a generic string
		allowCredentials: options.allowCredentials,
	});

	console.log("generateAuthenticationOptions - generated", generated);

	// TODO: store the challenge for verification

	return {
		...publicKeyCredentialRequestOptionsSchema.parse(generated),
		// TODO: figure out why the `id` field is resolves to empty string
		allowCredentials: options.allowCredentials,
	};
}
