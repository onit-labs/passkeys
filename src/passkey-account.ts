import { CustomSource, toAccount } from "viem/accounts";

import {
	Account,
	Hex,
	LocalAccount,
	PrivateKeyAccount,
	SerializeTransactionFn,
	SignableMessage,
	TransactionSerializable,
	TypedData,
	TypedDataDefinition,
	encodeAbiParameters,
	encodeFunctionData,
	parseAbi,
	parseAbiParameters,
} from "viem";
import { SmartAccountPasskey } from "./passkey";

/**
 * TODO:
 * - [ ] implement 6492 for counterfactual accounts
 * TODO:
 * - [ ] implement 1271 for deployed accounts
 * TODO:
 * - [ ] create a signer for signing as the owner (this can be either r1 or k1)
 */

export class PasskeyWithSmartAccount implements LocalAccount {
	source = "custom" as const;
	type = "local" as const;
	address: `0x${string}`;
	publicKey: `0x${string}`;

	constructor(public passkey: SmartAccountPasskey) {
		this.address = "0x";
		this.publicKey = "0x";
	}

	/**
	 * Wraps an 1271 into a 6492 signature accounts that have not yet been deployed (counterfactual accounts)
	 *
	 * https://eips.ethereum.org/EIPS/eip-1271
	 * https://eips.ethereum.org/EIPS/eip-6492
	 *
	 * @param {Hex} signature1271 - the 1271 signature to convert
	 * @returns {Hex} - An 6492 compatible signature if the account has already been deployed then the function is idenity
	 */
	async convert1271SignatureTo6492(signature1271: Hex): Promise<Hex> {
		if ("address" in this.passkey.account) return signature1271;

		const abi = parseAbi(this.passkey.account.factory.deployFunctionAbi);
		const magicBytes = "6492649264926492649264926492649264926492649264926492649264926492" as const;

		const factoryDeployCallData = encodeFunctionData({
			abi,
			functionName: this.passkey.account.factory.deployFunctionName,
			args: [this.passkey.account.factory.address, this.passkey.account.salt ?? 0n],
		});

		return (encodeAbiParameters(parseAbiParameters("address, bytes, bytes"), [
			this.passkey.account.factory.address,
			factoryDeployCallData,
			signature1271,
		]) + magicBytes) as Hex;
	}

	async signMessage({ message }: { message: SignableMessage }): Promise<Hex> {
		console.log("signMessage", message);
		return "0x" as Hex;
	}

	/**
	 * This is used when the account has been deployed and will sign 1271
	 */
	async signTypedData<
		const typedData extends TypedData | Record<string, unknown>,
		primaryType extends keyof typedData | "EIP712Domain" = keyof typedData,
	>(typedDataDefinition: TypedDataDefinition<typedData, primaryType>) {
		console.log("typedDataDefinition", typedDataDefinition);
		return "0x" as Hex;
	}

	// ? Should we try do something that wraps the tx into a userOp
	async signTransaction<TTransactionSerializable extends TransactionSerializable>(
		transaction: TTransactionSerializable,
		{
			serializer,
		}: { serializer?: SerializeTransactionFn<TTransactionSerializable> | undefined } = {
			serializer: undefined,
		},
	) {
		console.log("signTransaction", transaction);
		console.log("serializer", serializer);
		return "0x" as Hex;
	}
}
