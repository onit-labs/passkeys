"use server";

import {
	publicKeyCredentialCreationOptionsSchema,
	type PublicKeyCredentialCreationOptionsJSON,
} from "@forum/passkeys/webauthn-zod";

import { generateRegistrationOptions as generateOptions } from "@simplewebauthn/server";

import { action } from "../client";

export const generateRegistrationOptions = action(
	publicKeyCredentialCreationOptionsSchema,
	async (options): Promise<PublicKeyCredentialCreationOptionsJSON> => {
		console.log("generateRegistrationOptions - options", options);

		const generated = await generateOptions(options);

		console.log("generateRegistrationOptions - generated", generated);

		// TODO: store the challenge for verification

		return publicKeyCredentialCreationOptionsSchema.parse(generated);
	},
);
