"use client";

import { getAlchemyProvider } from "@/lib/alchemy";
import { defaultChainId, getChainAndTransport } from "@/lib/wagmi";
import { WalletClientSigner } from "@alchemy/aa-core";
import {
	AuthenticationCredential,
	LargeBlobPasskeyAccount,
	Passkey,
	RegistrationCredential,
	passkeyConnector,
} from "@forum/passkeys";
import { base64URLStringToBuffer } from "@forum/passkeys/utils/encoding";
import {
	type AuthenticationExtensionsClientOutputs,
	AuthenticationResponseJSON,
	type Base64URLString,
	type PublicKeyCredentialCreationOptionsJSON,
	PublicKeyCredentialRequestOptionsJSON,
	type RegistrationResponseJSON,
	authenticationExtensionsClientOutputsSchema,
	base64URLStringSchema,
} from "@forum/passkeys/webauthn-zod";
import { Account, createWalletClient } from "viem";
import { useAccount, useConnect, useDisconnect } from "wagmi";

import type {
	VerifiedAuthenticationResponse,
	VerifiedRegistrationResponse,
	VerifyAuthenticationResponseOpts,
	VerifyRegistrationResponseOpts,
} from "@simplewebauthn/server";

import * as webauthnServerActions from "./webauthn-server-actions";

class ExamplePasskey implements Passkey {
	constructor(
		public params: Passkey["params"] = {
			rp: { name: "example" },
		},
		public rp = params.rp,
	) {}

	async generateRegistrationOptions(
		options: Omit<PublicKeyCredentialCreationOptionsJSON, "challenge">,
	): Promise<PublicKeyCredentialCreationOptionsJSON> {
		return await webauthnServerActions.generateRegistrationOptions(options);
	}

	async generateAuthenticationOptions(
		options: Omit<PublicKeyCredentialRequestOptionsJSON, "challenge">,
	): Promise<PublicKeyCredentialRequestOptionsJSON> {
		return await webauthnServerActions.generateAuthenticationOptions(options);
	}

	async verifyAuthentication(
		options: VerifyAuthenticationResponseOpts,
	): Promise<VerifiedAuthenticationResponse> {
		return await webauthnServerActions.verifyAuthentication(options);
	}

	async verifyRegistration(
		options: VerifyRegistrationResponseOpts,
	): Promise<VerifiedRegistrationResponse> {
		return await webauthnServerActions.verifyRegistration(options);
	}

	async create({
		signal,
		...request
	}: PublicKeyCredentialCreationOptionsJSON &
		Pick<CredentialCreationOptions, "signal">): Promise<RegistrationResponseJSON | null> {
		const credential = (await navigator.credentials.create({
			signal,
			publicKey: {
				...request,
				challenge: base64URLStringToBuffer(request.challenge),
				user: { ...request.user, id: base64URLStringToBuffer(request.user.id) },
				// @ts-expect-error
				excludeCredentials: request.excludeCredentials?.map((credential) => ({
					...credential,
					id: base64URLStringToBuffer(credential.id),
					// TODO: remove the override when typescript has updated webauthn types
					transports: (credential.transports ?? undefined) as AuthenticatorTransport[] | undefined,
				})),
			},
		})) as RegistrationCredential;

		const clientExtensionResults = authenticationExtensionsClientOutputsSchema.parse(
			credential?.getClientExtensionResults(),
		);

		if (!credential) return null;

		return {
			id: base64URLStringSchema.parse(credential.id),
			rawId: base64URLStringSchema.parse(credential.id),
			response: {
				clientDataJSON: base64URLStringSchema.parse(credential.response.clientDataJSON),
				attestationObject: base64URLStringSchema.parse(credential.response.attestationObject),
			},
			authenticatorAttachment: undefined,
			type: "public-key" as const,
			clientExtensionResults,
		};
	}

	async get({
		mediation,
		signal,
		...request
	}: PublicKeyCredentialRequestOptionsJSON &
		Pick<
			CredentialRequestOptions,
			"mediation" | "signal"
		>): Promise<AuthenticationResponseJSON | null> {
		const credential = (await navigator.credentials.get({
			mediation,
			signal,
			publicKey: {
				...request,
				extensions: {
					...request.extensions,
					largeBlob: {
						...request.extensions?.largeBlob,
						...(request.extensions?.largeBlob?.write && {
							write: base64URLStringToBuffer(request.extensions.largeBlob.write),
						}),
					},
				},
				challenge: base64URLStringToBuffer(request.challenge),
				allowCredentials: request.allowCredentials?.map((credential) => ({
					...credential,
					id: base64URLStringToBuffer(credential.id),
					// TODO: remove the override when typescript has updated webauthn types
					transports: (credential.transports ?? undefined) as AuthenticatorTransport[] | undefined,
				})),
			},
		})) as AuthenticationCredential;

		const clientExtensionResults = authenticationExtensionsClientOutputsSchema.parse(
			credential?.getClientExtensionResults(),
		);

		if (!credential) return null;

		return {
			id: base64URLStringSchema.parse(credential.id),
			rawId: base64URLStringSchema.parse(credential.id),
			response: {
				clientDataJSON: base64URLStringSchema.parse(credential.response.clientDataJSON),
				authenticatorData: base64URLStringSchema.parse(credential.response.authenticatorData),
				signature: base64URLStringSchema.parse(credential.response.signature),
				userHandle: credential.response.userHandle
					? base64URLStringSchema.parse(credential.response.userHandle)
					: undefined,
			},
			authenticatorAttachment: undefined,
			type: "public-key" as const,
			clientExtensionResults,
		};
	}
}

const passkey = new ExamplePasskey();

async function getPasskeyWalletClient({
	chainId,
	...rest
}: { chainId: number } & ({ credentialId: Base64URLString } | { username: string })) {
	const { chain, transport } = getChainAndTransport(chainId);

	const account = await LargeBlobPasskeyAccount.init({ passkey, ...rest });

	return createWalletClient({ account, chain, transport });
}

function App() {
	const account = useAccount();
	const { connect, status, error } = useConnect();
	const { disconnect } = useDisconnect();

	return (
		<>
			<div>
				<h2>Account</h2>

				<div>
					status: {account.status}
					<br />
					addresses: {JSON.stringify(account.addresses)}
					<br />
					chainId: {account.chainId}
				</div>

				{account.status === "connected" && (
					<button type="button" onClick={() => disconnect()}>
						Disconnect
					</button>
				)}
			</div>
			{account.status === "disconnected" && (
				<div>
					<h2>Connect</h2>

					<div>{status}</div>
					<div>{error?.message}</div>

					<input type="text" autoComplete="username webauthn" />

					<button
						type="button"
						onClick={async () => {
							const { chain } = getChainAndTransport(defaultChainId);

							const walletClient = await getPasskeyWalletClient({
								chainId: chain.id,
								username: "",
							});
							/** A largeBlob passkey *CAN* more than more signer that will sign in a single verification
							 * is this something we want to add?
							 *
							 * Accounts could have both EOA & R1 signers that (under certain conditions?) could both be required
							 * with no difference to UX.
							 *
							 */
							const signer = new WalletClientSigner(walletClient, "largeBlob-passkey-signer");

							connect(
								{
									connector: passkeyConnector({
										signer,
										chain,
										provider: getAlchemyProvider({ signer, chain }),
									}),
								},
								{
									onSuccess: (...args) => console.log("connected passkey account", { ...args }),
									onError: (...args) =>
										console.log("failed to connect passkey account", { ...args }),
								},
							);
						}}
					>
						Connect
					</button>
				</div>
			)}
		</>
	);
}

export default App;
