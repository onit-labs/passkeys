import { z } from "zod";

// ! allow enums are also allowed to be some unknown value of the correct type to allow for changes in the spec
// ! see https://w3c.github.io/webauthn/#sct-domstring-backwards-compatibility

export const publicKeyCredentialTypeSchema = z
	.enum(["public-key"])
	.brand<"PublicKeyCredentialType">()
	.or(z.string())
	.default("public-key");

export const userVerificationRequirementSchema = z
	.enum(["required", "preferred", "discouraged"])
	.brand<"UserVerificationRequirement">()
	.or(z.string())
	.default("preferred");

export const residentKeyRequirementSchema = z
	.enum(["required", "preferred", "discouraged"])
	.brand<"ResidentKeyRequirement">()
	.or(z.string())
	.default("preferred");

export const largeBlobSupportSchema = z
	.enum(["required", "preferred"])
	.brand<"LargeBlobSupport">()
	.or(z.string());

export const attestationConveyancePreferenceSchema = z
	.enum(["none", "indirect", "direct", "enterprise"])
	.brand<"AttestationConveyancePreference">()
	.or(z.string());

export const authenticatorAttachmentSchema = z
	.enum(["platform", "cross-platform"])
	.brand<"AuthenticatorAttachment">()
	.or(z.string());

export const COSEAlgorithmIdentifierSchema = z
	.number()
	.brand<"COSEAlgorithmIdentifier">()
	.or(z.number());

export const authenticatorTransportFutureSchema = z
	.enum(["ble", "cable", "hybrid", "internal", "nfc", "smart-card", "usb"])
	.brand<"AuthenticatorTransportFuture">()
	.or(z.string());

export const publicKeyCredentialHintsSchema = z
	.enum(["security-key", "client-device", "hybrid"])
	.brand<"PublicKeyCredentialHints">()
	.or(z.string());

export const attestationFormatSchema = z
	.enum(["none", "packed", "tpm", "android-key", "android-safetynet", "fido-u2f", "apple"])
	.brand<"AttestationFormat">()
	.or(z.string());

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
