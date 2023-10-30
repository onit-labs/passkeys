"use server";
import {
	publicKeyCredentialRequestOptionsSchema,
	type PublicKeyCredentialRequestOptionsJSON,
} from "@forum/passkeys/webauthn-zod";

export async function generateAuthenticationOptions(
	options: Omit<PublicKeyCredentialRequestOptionsJSON, "challenge">,
): Promise<PublicKeyCredentialRequestOptionsJSON> {
	return publicKeyCredentialRequestOptionsSchema.parse({});
}
