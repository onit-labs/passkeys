"use server";

import {
	publicKeyCredentialCreationOptionsSchema,
	type PublicKeyCredentialCreationOptionsJSON,
} from "webauthn-zod";
import { z } from "zod";
// import { kv } from "@vercel/kv";

import { generateRegistrationOptions as generateOptions } from "@simplewebauthn/server";

import { action } from "../client";

const defaultAuthenticatorSelection = {
	residentKey: "preferred",
	userVerification: "preferred",
};

export const generateRegistrationOptions = action(
	publicKeyCredentialCreationOptionsSchema.omit({ challenge: true }),
	async (options): Promise<PublicKeyCredentialCreationOptionsJSON> => {
		console.log("generateRegistrationOptions - options", options);

		const generated = await generateOptions({
			...options,
			rpName: options.rp.name,
			// // Don't prompt users for additional information about the authenticator
			// // (Recommended for smoother UX)
			// attestationType: "none",
			rpID: options.rp.id,
			userID: options.user.id,
			userName: options.user.name,
			userDisplayName: options.user.displayName,
		});

		console.log("generateRegistrationOptions - generated", generated);

		// // Remember the challenge for this user
		// await kv.set(`user:${options.user.id}`, {
		// 	...options.user,
		// 	currentChallenge: generated.challenge,
		// });

		// TODO: store the challenge for verification

		return publicKeyCredentialCreationOptionsSchema.parse(generated);
	},
);
