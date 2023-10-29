"use client";

import { getAlchemyProvider } from "@/lib/alchemy";
import { defaultChainId, getChainAndTransport } from "@/lib/wagmi";
import { WalletClientSigner } from "@alchemy/aa-core";
import { Account, createWalletClient } from "viem";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { passkeyConnector } from "@forum/passkeys";

function getPasskeyWalletClient(chainId: number) {
	const { chain, transport } = getChainAndTransport(chainId);

	const walletClient = createWalletClient({
		account: {} as Account,
		chain,
		transport,
	});

	return walletClient;
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

					<button
						type="button"
						onClick={() => {
							const { chain } = getChainAndTransport(defaultChainId);

							/** A largeBlob passkey *CAN* more than more signer that will sign in a single verification
							 * is this something we want to add?
							 *
							 * Accounts could have both EOA & R1 signers that (under certain conditions?) could both be required
							 * with no difference to UX.
							 *
							 */
							const signer = new WalletClientSigner(
								getPasskeyWalletClient(defaultChainId),
								"largeBlob-passkey-signer",
							);

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
