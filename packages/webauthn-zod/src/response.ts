import { z } from "zod";
import { base64URLStringSchema } from "./helpers";
import {
	COSEAlgorithmIdentifierSchema,
	authenticatorAttachmentSchema,
	authenticatorTransportFutureSchema,
	publicKeyCredentialTypeSchema,
} from "./enums";
import { authenticationExtensionsClientOutputsSchema } from "./extensions";

/**
 * Webauthn Schemas
 */

export const webauthnResultBaseSchema = z.object({
	id: base64URLStringSchema,
	rawId: base64URLStringSchema,
	type: publicKeyCredentialTypeSchema,
	authenticatorAttachment: authenticatorAttachmentSchema.optional(),
	clientExtensionResults: authenticationExtensionsClientOutputsSchema,
});

export const authenticatorAssertionResponseJSONSchema = z.object({
	userHandle: base64URLStringSchema,
	signature: base64URLStringSchema,
	clientDataJSON: base64URLStringSchema,
	authenticatorData: base64URLStringSchema,
});

export const authenticatorAttestationResponseJSON = z.object({
	clientDataJSON: base64URLStringSchema,
	attestationObject: base64URLStringSchema,
	authenticatorData: base64URLStringSchema.optional(),
	transports: z.array(authenticatorTransportFutureSchema).optional(),
	publicKeyAlgorithm: COSEAlgorithmIdentifierSchema.optional(),
	publicKey: base64URLStringSchema.optional(),
}); /**
 * ! The following are the useful schemas above is all sub-schemas
 */

export const webauthnAuthenticationResponseSchema = z
	.object({ response: authenticatorAssertionResponseJSONSchema })
	.merge(webauthnResultBaseSchema);

export type AuthenticationResponseJSON = z.infer<typeof webauthnAuthenticationResponseSchema>;

export const webauthnRegistrationResponseSchema = z
	.object({ response: authenticatorAttestationResponseJSON })
	.merge(webauthnResultBaseSchema);

export type RegistrationResponseJSON = z.infer<typeof webauthnRegistrationResponseSchema>;
