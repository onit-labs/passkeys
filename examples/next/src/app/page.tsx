"use client";

import { Toaster, toast } from "sonner";
import base64 from "@hexagon/base64";
import { getAlchemyProvider } from "@/lib/alchemy";
import { defaultChainId, getChainAndTransport } from "@/lib/wagmi";
import { WalletClientSigner } from "@alchemy/aa-core";
import { LargeBlobPasskeyAccount, Passkey, passkeyConnector } from "@forum/passkeys";
import {
	type AuthenticationCredential,
	type RegistrationCredential,
} from "@forum/passkeys/passkey.types";
import {
	type AuthenticationExtensionsClientOutputs,
	AuthenticationResponseJSON,
	type Base64URLString,
	type PublicKeyCredentialCreationOptionsJSON,
	PublicKeyCredentialRequestOptionsJSON,
	type RegistrationResponseJSON,
	authenticationExtensionsClientOutputsSchema,
	base64URLStringSchema,
} from "webauthn-zod";
import { Account, EIP1193RequestFn, Transport, createWalletClient, publicActions } from "viem";
import { useAccount, useConnect, useDisconnect } from "wagmi";

import type {
	VerifiedAuthenticationResponse,
	VerifiedRegistrationResponse,
	VerifyAuthenticationResponseOpts,
	VerifyRegistrationResponseOpts,
} from "@simplewebauthn/server";

import * as webauthnServerActions from "webauthn-server-actions";

class ExamplePasskey implements Passkey {
	constructor(
		public params: Passkey["params"] = {
			rp: { name: "example" },
			pubKeyCredParams: [{ type: "public-key", alg: -7 }],
		},
		public rp = params.rp,
		public pubKeyCredParams = params.pubKeyCredParams,
	) {}

	async generateRegistrationOptions(
		options: Omit<PublicKeyCredentialCreationOptionsJSON, "challenge">,
	): Promise<PublicKeyCredentialCreationOptionsJSON> {
		const response = await webauthnServerActions.generateRegistrationOptions(options);
		if (response.validationError) throw response.validationError;
		if (response.serverError) throw response.serverError;
		if (!response.data) throw new Error("Failed to generate data");
		console.log("generateRegistrationOptions", response.data);
		return response.data;
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
		const response = await webauthnServerActions.verifyRegistration(options);
		if (response.validationError) throw response.validationError;
		if (response.serverError) throw response.serverError;
		if (!response.data) throw new Error("Failed to generate data");
		console.log("verifyRegistration", response.data);
		return response.data;
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
				challenge: base64.toArrayBuffer(request.challenge, true),
				user: { ...request.user, id: base64.toArrayBuffer(request.user.id, true) },
				// @ts-expect-error
				excludeCredentials: request.excludeCredentials?.map((credential) => ({
					...credential,
					id: base64.toArrayBuffer(credential.id, true),
					// TODO: remove the override when typescript has updated webauthn types
					transports: (credential.transports ?? undefined) as AuthenticatorTransport[] | undefined,
				})),
			},
		})) as RegistrationCredential;

		const clientExtensionResults = authenticationExtensionsClientOutputsSchema.parse(
			credential?.getClientExtensionResults(),
		);

		if (!credential) return null;

		console.log("create result", credential);
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
			// mediation: mediation ?? (await mediationAvailable()) ? "conditional" : "optional",
			mediation: mediation ?? "optional",
			signal,
			publicKey: {
				...request,
				extensions: {
					...request.extensions,
					largeBlob: {
						...request.extensions?.largeBlob,
						...(request.extensions?.largeBlob?.write && {
							write: base64.toArrayBuffer(request.extensions.largeBlob.write, true),
						}),
					},
				},
				challenge: base64.toArrayBuffer(request.challenge, true),
				allowCredentials: request.allowCredentials?.map((credential) => ({
					...credential,
					id: base64.toArrayBuffer(credential.id, true),
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
	const walletName = `${"username" in rest ? rest.username : rest.credentialId} Wallet Client`;

	return createWalletClient({
		account,
		chain,
		transport: (chain) => {
			const tport = transport(chain);
			return {
				...tport,
				request: async ({ method, params }: Parameters<EIP1193RequestFn>[0]) => {
					console.log("request hack", method, params, account);
					if (method === "eth_accounts") {
						return [account.address];
					}
					return await tport.request({ method, params });
				},
			} as unknown as Transport;
		},
		name: walletName,
	});
	// .extend((client) => ({
	// 	...publicActions,
	// 	request: async ({ method, params }: Parameters<typeof client.request>) => {
	// 		console.log("request hack", methods, params);
	// 		if (method === "eth_accounts") {
	// 			return [account.address];
	// 		}
	// 		return await client.request({ method, params });
	// 	},
	// }));
}

function App() {
	const account = useAccount();
	const { connect, status, error } = useConnect();
	const { disconnect } = useDisconnect();

	return (
		<>
			<Toaster />
			<div className="py-20 px-8 flex flex-col items-center justify-center text-center gap-y-2">
				<h2 className="text-3xl text-bold">Account</h2>

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
				<div className="flex flex-col items-center justify-center gap-y-2 max-w-[80%] mx-auto text-center">
					<h2 className="text-3xl text-bold">Connect</h2>

					<div>{status}</div>
					<div>{error?.message}</div>

					<form
						className="flex gap-x-2"
						onSubmit={async (e) => {
							e.preventDefault();
							const formData = new FormData(e.currentTarget);
							const { username } = Object.fromEntries(formData) as {
								username?: string;
							};

							if (!username) return;

							try {
								const { chain } = getChainAndTransport(defaultChainId);

								const walletClient = await getPasskeyWalletClient({ username, chainId: chain.id });
								console.log("after walletClient", await walletClient.getAddresses());

								/** A largeBlob passkey *CAN* more than more signer that will sign in a single verification
								 * is this something we want to add?
								 *
								 * Accounts could have both EOA & R1 signers that (under certain conditions?) could both be required
								 * with no difference to UX.
								 *
								 */
								const signer = new WalletClientSigner(walletClient, "largeBlob-passkey-signer");
								const provider = getAlchemyProvider({ signer, chain });
								connect(
									{ connector: passkeyConnector({ signer, chain, provider }) },
									{
										onSuccess: (...args) => console.log("connected passkey account", { ...args }),
										onError: (...args) =>
											console.log("failed to connect passkey account", { ...args }),
									},
								);
							} catch (e) {
								toast((e as Error).message);
							}
						}}
					>
						<input
							type="text"
							name="username"
							id="username"
							autoComplete="username webauthn"
							className="rounded-lg px-2 py-1"
						/>

						<button type="submit" className="rounded-lg px-2 py-1 border">
							Connect
						</button>
					</form>
				</div>
			)}
		</>
	);
}

export default App;
