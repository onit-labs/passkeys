"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";
import { startRegistration } from '@simplewebauthn/browser'
import { GenerateRegistrationOptionsOpts } from "@simplewebauthn/server";
import { }  from 'passkeys.js'

  const opts: GenerateRegistrationOptionsOpts = {
			rpName: "SimpleWebAuthn Example",
			rpID,
			userID: loggedInUserId,
			userName: username,
			timeout: 60000,
			attestationType: "none",
			/**
			 * Passing in a user's list of already-registered authenticator IDs here prevents users from
			 * registering the same device multiple times. The authenticator will simply throw an error in
			 * the browser if it's asked to perform registration when one of these ID's already resides
			 * on it.
			 */
			excludeCredentials: devices.map((dev) => ({
				id: dev.credentialID,
				type: "public-key",
				transports: dev.transports,
			})),
			authenticatorSelection: {
				residentKey: "discouraged",
			},
			/**
			 * Support the two most common algorithms: ES256, and RS256
			 */
			supportedAlgorithmIDs: [-7, -257],
		};



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



				<button type="button" onClick={() => connect({ connector:  })}>
					Connect
				</button>
			</div>

				)}
			
		</>
	);
}

export default App;
