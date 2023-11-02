// ! pull in fn/types that are not exposed by simplewebauthn atm

import { type CredentialDeviceType } from "@simplewebauthn/typescript-types";
import { toHash, isoUint8Array } from "@simplewebauthn/server/helpers";

export type AuthenticationExtensionsAuthenticatorOutputs = {
	devicePubKey?: DevicePublicKeyAuthenticatorOutput;
	uvm?: UVMAuthenticatorOutput;
};
export type DevicePublicKeyAuthenticatorOutput = {
	dpk?: Uint8Array;
	sig?: string;
	nonce?: Uint8Array;
	scope?: Uint8Array;
	aaguid?: Uint8Array;
};
export type UVMAuthenticatorOutput = {
	uvm?: Uint8Array[];
};

/**
 * Make sense of Bits 3 and 4 in authenticator indicating:
 *
 * - Whether the credential can be used on multiple devices
 * - Whether the credential is backed up or not
 *
 * Invalid configurations will raise an `Error`
 */
export function parseBackupFlags({
	be,
	bs,
}: {
	be: boolean;
	bs: boolean;
}): {
	credentialDeviceType: CredentialDeviceType;
	credentialBackedUp: boolean;
} {
	const credentialBackedUp = bs;
	let credentialDeviceType: CredentialDeviceType = "singleDevice";
	if (be) {
		credentialDeviceType = "multiDevice";
	}
	if (credentialDeviceType === "singleDevice" && credentialBackedUp) {
		throw new InvalidBackupFlags(
			"Single-device credential indicated that it was backed up, which should be impossible.",
		);
	}
	return { credentialDeviceType, credentialBackedUp };
}
class InvalidBackupFlags extends Error {
	constructor(message) {
		super(message);
		this.name = "InvalidBackupFlags";
	}
}

/**
 * Go through each expected RP ID and try to find one that matches. Returns the unhashed RP ID
 * that matched the hash in the response.
 *
 * Raises an `UnexpectedRPIDHash` error if no match is found
 */
export async function matchExpectedRPID(
	rpIDHash: Uint8Array,
	expectedRPIDs: string[],
): Promise<string> {
	try {
		const matchedRPID = await Promise.any<string>(
			expectedRPIDs.map((expected) => {
				return new Promise((resolve, reject) => {
					toHash(isoUint8Array.fromASCIIString(expected)).then((expectedRPIDHash) => {
						if (isoUint8Array.areEqual(rpIDHash, expectedRPIDHash)) {
							resolve(expected);
						} else {
							reject();
						}
					});
				});
			}),
		);
		return matchedRPID;
	} catch (err) {
		const _err = err;
		// This means no matches were found
		if (_err.name === "AggregateError") {
			throw new UnexpectedRPIDHash();
		}
		// An unexpected error occurred
		throw err;
	}
}
class UnexpectedRPIDHash extends Error {
	constructor() {
		const message = "Unexpected RP ID hash";
		super(message);
		this.name = "UnexpectedRPIDHash";
	}
}
