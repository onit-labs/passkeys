"use server";
import type { VerifyAuthenticationResponseOpts } from "@simplewebauthn/server";
import { webauthnAuthenticationResponseSchema } from "@forum/passkeys";
import { type AuthenticationResponseJSON } from "@forum/passkeys/webauthn-zod";

export async function verifyAuthentication(
	options: VerifyAuthenticationResponseOpts,
): Promise<AuthenticationResponseJSON> {
	return webauthnAuthenticationResponseSchema.parse({});
}
