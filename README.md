# Passkeys Accounts

A collection of utilities to enable passkey accounts in [viem](https://viem.sh) & [wagmi](https://wagmi.sh)

## Features

- Create & Import EOA into a passkey wallet & use it to interact with directly with [Ethereum](https://ethereum.org/)
- Bring your own passkey library, such as [SimpleWebAuthn](https://github.com/MasterKale/SimpleWebAuthn) or [React Native Passkeys](https://github.com/peterferguson/react-native-passkeys)
- (Mostly) Unopinionated about how you store and handle the private key

... This is a work in progress so if you find any issues please let us know.


## Installation

Install wagmi, viem & @forum/passkeys

```bash
pnpm install wagmi viem @forum/passkeys
```


## Quick Start

This is one possible way to use this library to get started with largeBlob passkey accounts in wagmi.

It splits the setup process into three steps:

1. First define a class to represent your site's passkey. This can wrap the `navigator.credential` api itself or some library like `SimpleWebAuthn` or `react-native-passkeys`.
   
   This should handle the calls to your server to verify that the calls are legit. [See SimpleWebAuthn's server docs](`https://simplewebauthn.dev/docs/packages/server#2-verify-registration-response`) for an example of how to handle the verification.

   ```tsx

   import { Passkey as AbstractPasskey } from '@forum/passkeys'

   export class Passkey extends AbstractPasskey {

       // - init your relaying party parameters 
       // ...

   	async create(options): Promise<RegistrationResponseJSON | null> {
   		const { challenge } = await getChallengeFromServer()

   		const passkeyResult = await await navigator.credential.create({ 
               ...options,
               challenge
           })

   		if (!passkeyResult) throw new Error('Failed to create passkey')

   		const verified = await getVerifiedPasskeyResult(passkeyResult)

   		if (!verified) throw new Error('Failed to verify challenge')

   		return passkeyResult
   	}

   	async get(options): Promise<AuthenticationResponseJSON | null> {
   		const { challenge } = await getChallengeFromServer()

   		const passkeyResult = await navigator.credential.get({
               ...options,
               rpId: hostname,
               challenge 
           })

           const verified = await getVerifiedPasskeyResult(passkeyResult)

   		if (!verified) throw new Error('Failed to verify challenge')

   		return passkeyResult
   	}
   }
   ```

2. Define a custom hook to create the account 
   ```tsx
   import { useAccount, useConfig, useConnect, useDisconnect } from 'wagmi'
   import { generatePrivateKey, privateKeyToAddress } from 'viem/accounts'
   import { PasskeyConnector } from '@forum/passkeys'

   export const useCreateAccount() {
      const config = useConfig()

      const createAccount = async (
        username: string,
        privateKey = generatePrivateKey()
     ) => {
      		const passkey = new ForumPasskey()
      		const address = privateKeyToAddress(privateKey)

              // - generate the initial passkey for the new user & check that they are 
              // - using a device/browser that supports `largeBlob` webauthn extension
      		const credential = await passkey.create({
      			user: {
      				id: base64URLFromString(address),
      				name: username,
      				displayName: username,
      			},
      			extensions: { largeBlob: { support: 'required' } },
      		})

      		if (!credential?.clientExtensionResults?.largeBlob?.supported)
      			throw new Error('LargeBlob not supported')

              // - optional: if you have access to a secure store (e.g. keychain access)
              // - you can store the pk at this point
            	await storeInYourOwnSecureStoreForPrivateKeys({
                  credentialId: credential.id,
                  privateKey
              })

              // - init the viem passkey account
      		const largeBlobAccount = new LargeBlobPasskeyAccount({
      			passkey: new ForumPasskey(),
      			privateKey
      		})

              // - init the wagmi passkey connector
      		const connector = new PasskeyConnector({
      			account: largeBlobAccount.toAccount(),
      			config,
      		})

      		connect({ connector })

           // - you could choose to delay the following (storing the large blob)
           // - until the users first tx but for the example we do it here
         	const write = await passkey.get({
             	extensions: { largeBlob: { write: privateKey } },
             	allowCredentials: [{ type: 'public-key', id: credential.id }],
         	})

         	if(!write?.clientExtensionResults.largeBlob?.written)
                throw new Error('failed to store large blob')

      		return credential
      	}

      	return { createAccount }
   }
   ```

3. Integrate the hook into a normal wagmi connect flow
   ```tsx
   import { useAccount, useConfig, useConnect, useDisconnect } from 'wagmi'
   import { generatePrivateKey, privateKeyToAddress } from 'viem/accounts'
   import { PasskeyConnector } from '@forum/passkeys'
   import { useCreateAccount } from './use-create-account.ts'

   function Profile() {
   	const { address } = useAccount()
   	const { connect } = useConnect()
   	const { disconnect } = useDisconnect()
    const { createAccount } = useCreateAccount()

   	if (address) {
   		return (
           	<div>
       			Connected to { address }
               	<button onClick={ () => disconnect() }> Disconnect < /button>
       		< /div>
           )
   y    }
   	return <button onClick={ () => createAccount('username') }> Connect Wallet < /button>
   }
   ```
