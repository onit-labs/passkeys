"use server";

import {
	webauthnAuthenticationResponseSchema,
	webauthnRegistrationResultSchema,
} from "@forum/passkeys";
import {
	publicKeyCredentialCreationOptionsSchema,
	publicKeyCredentialRequestOptionsSchema,
	// type PublicKeyCredentialCreationOptionsJSON,
	// type PublicKeyCredentialRequestOptionsJSON,
} from "@forum/passkeys/utils/webauthn-zod";

import type {
	AuthenticationResponseJSON,
	PublicKeyCredentialCreationOptionsJSON,
	PublicKeyCredentialRequestOptionsJSON,
	RegistrationResponseJSON,
} from "@simplewebauthn/typescript-types";

export async function generateRegistrationOptions(): Promise<PublicKeyCredentialCreationOptionsJSON> {
	return publicKeyCredentialCreationOptionsSchema.parse({});
}

export async function generateAuthenticationOptions(): Promise<PublicKeyCredentialRequestOptionsJSON> {
	return publicKeyCredentialRequestOptionsSchema.parse({});
}

export async function verifyAuthentication(): Promise<AuthenticationResponseJSON> {
	return webauthnAuthenticationResponseSchema.parse({});
}

export async function verifyRegistration(): Promise<RegistrationResponseJSON> {
	return webauthnRegistrationResultSchema.parse({});
}
