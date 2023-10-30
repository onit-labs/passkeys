"use server";
import type { VerifyAuthenticationResponseOpts } from "@simplewebauthn/server";
import {
	webauthnAuthenticationResponseSchema,
	type AuthenticationResponseJSON,
} from "webauthn-zod";

export async function verifyAuthentication(
	options: VerifyAuthenticationResponseOpts,
): Promise<AuthenticationResponseJSON> {
	return webauthnAuthenticationResponseSchema.parse({});
}
