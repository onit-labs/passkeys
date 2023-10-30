"use server";

// tODO: replace these with serialisable/zod versions
import {
	verifyAuthenticationResponse,
	type VerifyRegistrationResponseOpts,
} from "@simplewebauthn/server";

import { webauthnRegistrationResultSchema } from "@forum/passkeys";

import { type RegistrationResponseJSON } from "@forum/passkeys/webauthn-zod";

import { action } from "../client";
import { z } from "zod";

export const verifyRegistration = action(
	z.any(),
	async (response): Promise<RegistrationResponseJSON> => {
		console.log("verifyRegistration - response", response);

		const verification = verifyAuthenticationResponse(response);

		console.log("verifyRegistration - verification", verification);

		return webauthnRegistrationResultSchema.parse(verification);
	},
);
