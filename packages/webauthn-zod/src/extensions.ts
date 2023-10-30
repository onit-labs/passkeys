import { z } from "zod";
import { base64URLStringSchema } from "./helpers";
import { largeBlobSupportSchema } from "./enums";

export const credentialPropertiesOutputSchema = z.object({
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
export const authenticationExtensionsLargeBlobOutputsSchema = z.object({
	supported: z.boolean().optional(),
	blob: base64URLStringSchema.optional(),
	written: z.boolean().optional(),
});

export const authenticationExtensionsClientOutputsSchema = z.object({
	appid: z.boolean().optional(),
	credProps: credentialPropertiesOutputSchema.optional(),
	hmacCreateSecret: z.boolean().optional(),
	largeBlob: authenticationExtensionsLargeBlobOutputsSchema.optional(),
});

export type AuthenticationExtensionsClientOutputs = z.infer<
	typeof authenticationExtensionsClientOutputsSchema
>;

export const authenticationExtensionsClientInputsSchema = z.object({
	appid: z.string().optional(),
	credProps: z.boolean().optional(),
	hmacCreateSecret: z.boolean().optional(),
	largeBlob: authenticationExtensionsLargeBlobInputsSchema.optional(),
});
