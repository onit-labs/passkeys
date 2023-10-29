import { z } from "zod";
import base64 from "@hexagon/base64";

// - helpers
const base64Like = z.union([
	z.instanceof(Buffer),
	z.instanceof(Uint8Array),
	z.instanceof(Uint16Array),
	z.instanceof(Uint32Array),
	z.string(),
]);

/**
 * - Branded Types to make it clearer how to encode and decode certain types
 */
export const base64URLStringSchema = base64Like
	.transform((val) =>
		typeof val === "string" ? val : (base64.fromArrayBuffer(val, true) as string),
	)
	.refine((val) => base64.validate(val, true))
	.brand<"Base64URL">();

export type Base64URLString = z.infer<typeof base64URLStringSchema>;

export const base64StringSchema = base64Like
	.transform((val) => (typeof val === "string" ? val : (base64.fromArrayBuffer(val) as string)))
	.refine(
		(val) =>
			base64.validate(val, false) &&
			// - ensure padding character
			val.endsWith("="),
	)
	.brand<"Base64">();

export type Base64String = z.infer<typeof base64StringSchema>;

export const asciiStringSchema = z.string().brand<"Ascii">();
export type AsciiString = z.infer<typeof asciiStringSchema>;

export const publicKeyCredentialTypeSchema = z
	.enum(["public-key"])
	.brand<"PublicKeyCredentialType">()
	.default("public-key");
export type PublicKeyCredentialType = z.infer<typeof publicKeyCredentialTypeSchema>;

export const userVerificationRequirementSchema = z
	.enum(["required", "preferred", "discouraged"])
	.brand<"UserVerificationRequirement">()
	.default("preferred");
export type UserVerificationRequirement = z.infer<typeof userVerificationRequirementSchema>;

export const residentKeyRequirementSchema = z
	.enum(["required", "preferred", "discouraged"])
	.brand<"ResidentKeyRequirement">()
	.default("preferred");
export type ResidentKeyRequirement = z.infer<typeof residentKeyRequirementSchema>;

export const largeBlobSupportSchema = z
	.enum(["platform", "cross-platform"])
	.brand<"LargeBlobSupport">();
export type LargeBlobSupport = z.infer<typeof largeBlobSupportSchema>;

export const authenticatorAttachmentSchema = z
	.enum(["platform", "cross-platform"])
	.brand<"AuthenticatorAttachment">();
export type AuthenticatorAttachment = z.infer<typeof authenticatorAttachmentSchema>;

export const COSEAlgorithmIdentifierSchema = z.number().brand<"COSEAlgorithmIdentifier">();
export type COSEAlgorithmIdentifier = z.infer<typeof COSEAlgorithmIdentifierSchema>;

export const authenticatorTransportFutureSchema = z
	.enum(["ble", "cable", "hybrid", "internal", "nfc", "smart-card", "usb"])
	.brand<"AuthenticatorTransportFuture">();
export type AuthenticatorTransportFuture = z.infer<typeof authenticatorTransportFutureSchema>;

/**
 * Webauthn Schemas
 */
const credentialPropertiesOutputSchema = z.object({
	rk: z.boolean().optional(),
});

/**
 * - Specification reference: https://w3c.github.io/webauthn/#dictdef-authenticationextensionslargeblobinputs
 */
export const authenticationExtensionsLargeBlobInputsSchema = z.object({
	// - Only valid during registration.
	support: largeBlobSupportSchema.optional(),

	// - A boolean that indicates that the Relying Party would like to fetch the previously-written blob associated with the asserted credential. Only valid during authentication.
	read: z.boolean().optional(),

	// - An opaque byte string that the Relying Party wishes to store with the existing credential. Only valid during authentication.
	// - We impose that the data is passed as base64-url encoding to make better align the passing of data from RN to native code
	write: base64URLStringSchema.optional(),
});

/**
 * - Specification reference: https://w3c.github.io/webauthn/#dictdef-authenticationextensionslargebloboutputs
 */
const authenticationExtensionsLargeBlobOutputsSchema = z.object({
	supported: z.boolean().optional(),
	blob: base64URLStringSchema.optional(),
	written: z.boolean().optional(),
});

const authenticationExtensionsClientOutputsSchema = z.object({
	appid: z.boolean().optional(),
	credProps: credentialPropertiesOutputSchema.optional(),
	hmacCreateSecret: z.boolean().optional(),
	largeBlob: authenticationExtensionsLargeBlobOutputsSchema.optional(),
});

export const authenticationExtensionsClientInputsSchema = z.object({
	appid: z.string().optional(),
	credProps: z.boolean().optional(),
	hmacCreateSecret: z.boolean().optional(),
	largeBlob: authenticationExtensionsLargeBlobInputsSchema.optional(),
});

const webauthnResultBaseSchema = z.object({
	id: base64URLStringSchema,
	rawId: base64URLStringSchema,
	type: publicKeyCredentialTypeSchema,
	authenticatorAttachment: authenticatorAttachmentSchema.optional(),
	clientExtensionResults: authenticationExtensionsClientOutputsSchema,
});

const authenticatorAssertionResponseJSONSchema = z.object({
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
});

export const publicKeyCredentialEntitySchema = z.object({ name: z.string() });

export const publicKeyCredentialRpEntitySchema = z
	.object({
		id: z.string().optional(),
	})
	.merge(publicKeyCredentialEntitySchema);

export const publicKeyCredentialUserEntitySchema = z.object({
	id: base64URLStringSchema,
	name: z.string(),
	displayName: z.string(),
});

export const publicKeyCredentialParametersSchema = z.object({
	type: z.string(),
	alg: COSEAlgorithmIdentifierSchema,
});

export const publicKeyCredentialDescriptorSchema = z.object({
	id: base64URLStringSchema,
	type: publicKeyCredentialTypeSchema,
	transports: z.array(authenticatorTransportFutureSchema),
});

export const authenticatorSelectionCriteriaSchema = z.object({
	authenticatorAttachment: authenticatorAttachmentSchema,
	residentKey: residentKeyRequirementSchema.optional(),
	requireResidentKey: z.boolean().default(false),
	userVerification: userVerificationRequirementSchema,
});

/**
 * ! The following are the useful schemas above is all sub-schemas
 */

export const webauthnAuthenticationResponseSchema = z
	.object({
		response: authenticatorAssertionResponseJSONSchema,
	})
	.merge(webauthnResultBaseSchema);

export const webauthnRegistrationResultSchema = z
	.object({
		response: authenticatorAttestationResponseJSON,
	})
	.merge(webauthnResultBaseSchema);

export const publicKeyCredentialCreationOptionsSchema = z.object({
	rp: publicKeyCredentialRpEntitySchema,
	user: publicKeyCredentialUserEntitySchema,
	challenge: base64URLStringSchema,
	pubKeyCredParams: z.array(publicKeyCredentialParametersSchema),
	timeout: z.number().optional(),
	excludeCredentials: z.array(publicKeyCredentialDescriptorSchema).optional(),
	authenticatorSelection: authenticatorSelectionCriteriaSchema.optional(),
	// attestation?: AttestationConveyancePreference,
	extensions: authenticationExtensionsClientInputsSchema.optional(),
});
