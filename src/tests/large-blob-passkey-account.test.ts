import { beforeEach, describe, expect, it, test } from "vitest";
import { CredentialIdEncodingError, MissingPrivateKeyError, MissingUsernameError } from "../errors";
import { LargeBlobPasskeyAccount } from "../large-blob-passkey-account";
import { base64URLStringSchema } from "../utils/webauthn-zod";

const notBase64UrlcredentialId = "ZGFua29nYWk=";
const credentialId = base64URLStringSchema.parse("ZGFua29nYWk");
const username = "XXXX";

describe("instantiation", () => {
	beforeEach((ctx) => {
		// - clear the localStorage for each that don't explicitly decline it
		if (!ctx.task.name.startsWith("noClear - ")) return window.localStorage.clear();
		console.log("not clearing local storage for", ctx.task.name);
	});

	it.concurrent(
		"throws username error if nothing is passed & nothing in storage",
		async ({ expect }) => {
			try {
				const account = await LargeBlobPasskeyAccount.init();
				expect(account).toBeInstanceOf(LargeBlobPasskeyAccount);
				account.testAsserts();
				throw new Error("Should have failed");
			} catch (e) {
				expect(e).toBeInstanceOf(MissingUsernameError);
			}
		},
	);

	it.concurrent("Instantiates if `username` passed", async ({ expect }) => {
		const account = await LargeBlobPasskeyAccount.init({ username });
		expect(account).toBeInstanceOf(LargeBlobPasskeyAccount);
		expect(account.testAsserts()).toBeUndefined();
	});

	it.concurrent("Instantiates if `credentialId` passed", async ({ expect }) => {
		const account = await LargeBlobPasskeyAccount.init({ credentialId });
		expect(account).toBeInstanceOf(LargeBlobPasskeyAccount);
		expect(account.testAsserts()).toBeUndefined();
	});

	it.concurrent("Fails to init if credentialId is not base64-url encoded", async ({ expect }) => {
		try {
			// @ts-expect-error
			await LargeBlobPasskeyAccount.init({ credentialId: notBase64UrlcredentialId });
			throw new Error("Should have failed");
		} catch (e) {
			expect(e).toBeInstanceOf(CredentialIdEncodingError);
		}
	});

	it.concurrent("Check it gets credentialId with init", async ({ expect }) => {
		const account = await LargeBlobPasskeyAccount.init({ credentialId });
		expect(account.credentialId).toBe(credentialId);
	});

	it("Check it gets credentialId without init", async ({ expect }) => {
		const account = await LargeBlobPasskeyAccount.init({ credentialId });
		expect(account.credentialId).toBe(credentialId);
	});

	it("noClear - Checks localStorage for `credentialId` after instantiation", async ({ expect }) => {
		const account = await LargeBlobPasskeyAccount.init();
		expect(account.credentialId).toBe(credentialId);
	});

	it("test assertions succeed on username being passed", async ({ expect }) => {
		const account = await LargeBlobPasskeyAccount.init({ username });
		expect(account).toBeInstanceOf(LargeBlobPasskeyAccount);
		expect(account.testAsserts()).toBeUndefined();
	});

	it("noClear - Checks localStorage for `username` after instantiation", async ({ expect }) => {
		const account = await LargeBlobPasskeyAccount.init();
		expect(account.username).toBe(username);
	});
});

describe("ethereum account creation", () => {
	it.concurrent("creates and stores an eoa", async ({ expect }) => {});
});
