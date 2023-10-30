import { BaseError } from "./base-error";

export type MissingCredentialIdErrorType = MissingCredentialIdError & {
	name: "MissingCredentialIdError";
};
export class MissingCredentialIdError extends BaseError {
	override name = "MissingCredentialIdError";
	constructor() {
		super("`credentialId` not found.");
	}
}

export type MissingUsernameErrorType = MissingUsernameError & {
	name: "MissingUsernameError";
};
export class MissingUsernameError extends BaseError {
	override name = "MissingUsernameError";
	constructor() {
		super("`username` not found.");
	}
}

export type MissingPrivateKeyErrorType = MissingPrivateKeyError & {
	name: "MissingPrivateKeyError";
};
export class MissingPrivateKeyError extends BaseError {
	override name = "MissingPrivateKeyError";
	constructor() {
		super("`privateKey` not found.");
	}
}

export type CredentialIdEncodingErrorType = CredentialIdEncodingError & {
	name: "CredentialIdEncodingError";
};
export class CredentialIdEncodingError extends BaseError {
	override name = "CredentialIdEncodingError";
	constructor() {
		super("`credentialId` was not base64-url encoded");
	}
}
