import { z } from "zod";

export const publicKeyCredentialTypeSchema = z
	.enum(["public-key"])
	.brand<"PublicKeyCredentialType">()
	.default("public-key");

export const userVerificationRequirementSchema = z
	.enum(["required", "preferred", "discouraged"])
	.brand<"UserVerificationRequirement">()
	.default("preferred");

export const residentKeyRequirementSchema = z
	.enum(["required", "preferred", "discouraged"])
	.brand<"ResidentKeyRequirement">()
	.default("preferred");

export const largeBlobSupportSchema = z
	.enum(["platform", "cross-platform"])
	.brand<"LargeBlobSupport">();

export const attestationConveyancePreferenceSchema = z
	.enum(["none", "indirect", "direct", "enterprise"])
	.brand<"AttestationConveyancePreference">();

export const authenticatorAttachmentSchema = z
	.enum(["platform", "cross-platform"])
	.brand<"AuthenticatorAttachment">();

export const COSEAlgorithmIdentifierSchema = z.number().brand<"COSEAlgorithmIdentifier">();

export const authenticatorTransportFutureSchema = z
	.enum(["ble", "cable", "hybrid", "internal", "nfc", "smart-card", "usb"])
	.brand<"AuthenticatorTransportFuture">();

export const publicKeyCredentialHintsSchema = z
	.enum(["security-key", "client-device", "hybrid"])
	.brand<"PublicKeyCredentialHints">();

export const attestationFormatSchema = z
	.enum(["none", "packed", "tpm", "android-key", "android-safetynet", "fido-u2f", "apple"])
	.brand<"AttestationFormat">();

export type LargeBlobSupport = z.infer<typeof largeBlobSupportSchema>;
export type ResidentKeyRequirement = z.infer<typeof residentKeyRequirementSchema>;
export type PublicKeyCredentialType = z.infer<typeof publicKeyCredentialTypeSchema>;
export type UserVerificationRequirement = z.infer<typeof userVerificationRequirementSchema>;
export type AttestationConveyancePreference = z.infer<typeof attestationConveyancePreferenceSchema>;
export type AuthenticatorAttachment = z.infer<typeof authenticatorAttachmentSchema>;
export type COSEAlgorithmIdentifier = z.infer<typeof COSEAlgorithmIdentifierSchema>;
export type AuthenticatorTransportFuture = z.infer<typeof authenticatorTransportFutureSchema>;
export type PublicKeyCredentialHints = z.infer<typeof publicKeyCredentialHintsSchema>;
export type AttestationFormat = z.infer<typeof attestationFormatSchema>;
