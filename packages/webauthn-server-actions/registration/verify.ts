"use server";

// tODO: replace these with serialisable/zod versions
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { type RegistrationResponseJSON, webauthnRegistrationResponseSchema } from "webauthn-zod";

import { z } from "zod";
import { action } from "../client";

export const verifyRegistration = action(
	z.any(),
	async (response): Promise<RegistrationResponseJSON> => {
		console.log("verifyRegistration - response", response);

		const verification = verifyAuthenticationResponse(response);

		console.log("verifyRegistration - verification", verification);

		return webauthnRegistrationResponseSchema.parse(verification);
	},
);
