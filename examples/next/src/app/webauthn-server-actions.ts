"use server";

import {
	webauthnAuthenticationResponseSchema,
	webauthnRegistrationResultSchema,
} from "@forum/passkeys";

import type {
	AuthenticationResponseJSON,
	PublicKeyCredentialCreationOptionsJSON,
	PublicKeyCredentialRequestOptionsJSON,
	RegistrationResponseJSON,
} from "@simplewebauthn/typescript-types";

export async function generateRegistrationOptions(): Promise<PublicKeyCredentialCreationOptionsJSON> {
	return {} as PublicKeyCredentialCreationOptionsJSON;
}

export async function generateAuthenticationOptions(): Promise<PublicKeyCredentialRequestOptionsJSON> {
	return {} as PublicKeyCredentialRequestOptionsJSON;
}

export async function verifyAuthentication(): Promise<AuthenticationResponseJSON> {
	return webauthnAuthenticationResponseSchema.parse({});
}

export async function verifyRegistration(): Promise<RegistrationResponseJSON> {
	return webauthnRegistrationResultSchema.parse({});
}
