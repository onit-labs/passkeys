import { z } from "zod";
import { base64URLStringSchema } from "./helpers";

import {
	COSEAlgorithmIdentifierSchema,
	attestationConveyancePreferenceSchema,
	attestationFormatSchema,
	authenticatorAttachmentSchema,
	authenticatorTransportFutureSchema,
	publicKeyCredentialHintsSchema,
	publicKeyCredentialTypeSchema,
	residentKeyRequirementSchema,
	userVerificationRequirementSchema,
} from "./enums";
import { authenticationExtensionsClientInputsSchema } from "./extensions";

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
	type: publicKeyCredentialTypeSchema,
	alg: COSEAlgorithmIdentifierSchema,
});

export const publicKeyCredentialDescriptorSchema = z.object({
	id: base64URLStringSchema,
	type: publicKeyCredentialTypeSchema,
	transports: z.array(authenticatorTransportFutureSchema).default([]).optional(),
});

export const authenticatorSelectionCriteriaSchema = z.object({
	authenticatorAttachment: authenticatorAttachmentSchema.optional(),
	residentKey: residentKeyRequirementSchema.optional(),
	requireResidentKey: z.boolean().default(false).optional(),
	userVerification: userVerificationRequirementSchema.optional(),
});

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

// https://twitter.com/mattpocockuk/status/1622730173446557697?s=20&t=NdpAcmEFXY01xkqU3KO0Mg
export type Simplify<type> = { [key in keyof type]: type[key] } & unknown;

export type PublicKeyCredentialCreationOptionsJSON = Simplify<
	z.infer<typeof publicKeyCredentialCreationOptionsSchema>
>;

export const publicKeyCredentialRequestOptionsSchema = z.object({
	rpId: z.string().optional(),
	challenge: base64URLStringSchema,
	timeout: z.number().optional(),
	allowCredentials: z.array(publicKeyCredentialDescriptorSchema).optional(),
	userVerification: userVerificationRequirementSchema.optional(),
	attestation: attestationConveyancePreferenceSchema.default("none").optional(),
	attestationFormats: z.array(attestationFormatSchema).default([]).optional(),
	hints: z.array(publicKeyCredentialHintsSchema).default([]).optional(),
	extensions: authenticationExtensionsClientInputsSchema.optional(),
});

export type PublicKeyCredentialRequestOptionsJSON = Simplify<
	z.infer<typeof publicKeyCredentialRequestOptionsSchema>
>;
