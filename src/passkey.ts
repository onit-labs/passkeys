import {
	AuthenticationResponseJSON,
	PublicKeyCredentialCreationOptionsJSON,
	PublicKeyCredentialRequestOptionsJSON,
	RegistrationResponseJSON,
} from './passkey.types'

/**
 * A generic type to emulate the json-ified result of the `get` function on the browser `navigator.credential` api
 * or the result `passkey` api from `rn-passkeys`
 */
export abstract class Passkey {
	rp: PublicKeyCredentialCreationOptionsJSON['rp']

	/**
	 * This is simply the most widely supported public key type for webauthn
	 * so we adopt it as a default to ease the boiler plate for the end user
	 */
	pubKeyCredParams: PublicKeyCredentialCreationOptionsJSON['pubKeyCredParams'] = [
		{ type: 'public-key', alg: -7 },
	]

	/**
	 * These are the default selector options for a passkey vs a 'regular' webauthn credential
	 */
	authenticatorSelection: PublicKeyCredentialCreationOptionsJSON['authenticatorSelection'] = {
		residentKey: 'required',
		userVerification: 'preferred',
	}

	constructor(
		params: Pick<PublicKeyCredentialCreationOptionsJSON, 'rp' | 'authenticatorSelection'> &
			Partial<Pick<PublicKeyCredentialCreationOptionsJSON, 'pubKeyCredParams'>>,
	) {
		this.rp = params.rp
		if (params.pubKeyCredParams) this.pubKeyCredParams = params.pubKeyCredParams
		if (params.authenticatorSelection)
			this.authenticatorSelection = {
				...this.authenticatorSelection,
				...params.authenticatorSelection,
			}
	}

	abstract create(
		options: Omit<PublicKeyCredentialCreationOptionsJSON, 'rp' | 'pubKeyCredParams'> &
			Partial<Pick<PublicKeyCredentialCreationOptionsJSON, 'pubKeyCredParams'>>,
	): Promise<RegistrationResponseJSON | null>

	abstract get(
		options: Omit<PublicKeyCredentialRequestOptionsJSON, 'rpId'>,
	): Promise<AuthenticationResponseJSON | null>
}
