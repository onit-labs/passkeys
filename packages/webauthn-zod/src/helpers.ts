import { z } from "zod";
import base64 from "@hexagon/base64";

// - helpers
const base64Like = z.union([
	z.instanceof(Buffer),
	z.instanceof(ArrayBuffer),
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
