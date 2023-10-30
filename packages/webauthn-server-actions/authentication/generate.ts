"use server";
import {
	publicKeyCredentialRequestOptionsSchema,
	type PublicKeyCredentialRequestOptionsJSON,
} from "webauthn-zod";

export async function generateAuthenticationOptions(
	options: Omit<PublicKeyCredentialRequestOptionsJSON, "challenge">,
): Promise<PublicKeyCredentialRequestOptionsJSON> {
	return publicKeyCredentialRequestOptionsSchema.parse({});
}
