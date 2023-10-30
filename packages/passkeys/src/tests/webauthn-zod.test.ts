import { describe, it } from "vitest";
import { base64StringSchema, base64URLStringSchema } from "webauthn-zod";

const base64Buffer = new Uint8Array([100, 97, 110, 107, 111, 103, 97, 105]);
const base64String = "ZGFua29nYWk=";
const base64URLString = "ZGFua29nYWk";

describe("base64", () => {
	const schema = base64StringSchema;

	it.concurrent("verifies base64", ({ expect }) => {
		expect(schema.safeParse(base64String).success).toBeTruthy();
	});

	it.concurrent("fails to verify base64url", ({ expect }) => {
		expect(schema.safeParse(base64URLString).success).toBeFalsy();
	});

	it.concurrent("converts uint array to Base64String", ({ expect }) => {
		expect(schema.parse(base64Buffer)).toBe(base64String);
	});
});

describe("base64url", () => {
	const schema = base64URLStringSchema;

	it.concurrent("verifies base64url", ({ expect }) => {
		expect(schema.safeParse(base64URLString).success).toBeTruthy();
	});

	it.concurrent("fails to verify base64", ({ expect }) => {
		expect(schema.safeParse(base64String).success).toBeFalsy();
	});

	it.concurrent("converts uint array to Base64URLString", ({ expect }) => {
		expect(schema.parse(base64Buffer)).toBe(base64URLString);
	});
});
