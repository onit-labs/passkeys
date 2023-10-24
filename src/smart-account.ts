import {
	Address,
	Transport,
	// concat,
	type Hex,
	type LocalAccount,
	type SerializeTransactionFn,
	type SignableMessage,
	type TransactionSerializable,
	type TypedData,
	type TypedDataDefinition,
	type FallbackTransport,
	type HttpTransport,
	type PublicClient,
	createPublicClient,
	parseAbi,
	encodeFunctionData,
	concat,
	encodeAbiParameters,
	parseAbiParameters,
} from "viem";
import { SmartAccountSigner } from "./utils/signer.type";

interface CounterFactualSmartAccountArgs {
	/**
	 * This is the salt that will be used when deploying the account
	 */
	salt?: bigint;
	factory: {
		/**
		 * The abi of the smart account or its deploy function
		 * should be in a form that is parsable by viem [`parseAbi`](https://viem.sh/docs/abi/parseAbi.html#parseabi)
		 */
		deployFunctionAbi: readonly string[];
		deployFunctionName: string;
		/**
		 * The accounts factory address
		 */
		address: Address;
	};

	// /**
	//  * This is the init code needed to deploy the account
	//  */
	// initCode: Hex;
}

interface DeployedSmartAccountArgs {
	/**
	 * The deployed smart account address
	 */
	address: Address;
}

/**
 * TODO:
 * - [ ] implement 1271 for deployed accounts
 */

export class SmartAccount implements LocalAccount {
	#initCode?: Hex;
	#deploymentStatus?: "unknown" | "deployed" | "counterfactual" = "unknown";
	publicClient?: PublicClient;
	address: `0x${string}`;

	constructor(
		public signer: SmartAccountSigner,
		public options: {
			transport: Transport | FallbackTransport | HttpTransport;
			entryPoint: Address;
			smartAccount: CounterFactualSmartAccountArgs | DeployedSmartAccountArgs;
			actions?: Parameters<PublicClient["extend"]>[0];
		},
		// ! required by viem bu not used by us
		public publicKey = "0x" as const,
		public source = "custom" as const,
		public type = "local" as const,
	) {
		// ! this should be the SCA address not the signer
		this.address = "0x";
		this.publicClient = createPublicClient({
			transport: this.options.transport,
		}).extend((client) => {
			if (this.options.actions) return this.options.actions(client);
			return {};
		});
	}

	assertCounterFactualOptionsAvailable(): asserts this is Extract<
		this,
		{ options: { smartAccount: CounterFactualSmartAccountArgs } }
	> {
		if (!("factory" in this.options.smartAccount))
			throw new Error("Smart Account factory info not provided");
	}

	assertPublicClient(): asserts this is this & { publicClient: PublicClient } {
		if (!this.publicClient) throw new Error("Failed to init public client");
	}

	static async getIsAccountDeployed(address: Address, publicClient: PublicClient) {
		const contractCode = await publicClient.getBytecode({ address });

		if ((contractCode?.length ?? 0) > 2) return true;

		return false;
	}

	async getIsAccountDeployed() {
		this.assertPublicClient();
		if (this.#deploymentStatus === "deployed") return true;
		if (this.#deploymentStatus === "counterfactual") return false;

		this.#deploymentStatus = (await SmartAccount.getIsAccountDeployed(
			this.address,
			this.publicClient,
		))
			? "deployed"
			: "counterfactual";

		return this.#deploymentStatus === "deployed";
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
		if (await this.getIsAccountDeployed()) return signature1271;
		this.assertCounterFactualOptionsAvailable();

		const salt = this.options.smartAccount.salt;
		const factory = this.options.smartAccount.factory;

		const abi = parseAbi(factory.deployFunctionAbi);
		const magicBytes =
			"0x6492649264926492649264926492649264926492649264926492649264926492" as const;

		const factoryDeployCallData = encodeFunctionData({
			abi,
			functionName: factory.deployFunctionName,
			args: [factory.address, salt ?? 0n],
		});

		return concat([
			encodeAbiParameters(parseAbiParameters("address, bytes, bytes"), [
				factory.address,
				factoryDeployCallData,
				signature1271,
			]),
			magicBytes,
		]) as Hex;
	}

	async signMessage({ message }: { message: SignableMessage }): Promise<Hex> {
		// TODO: regardless of the signer we need to check if the account has been deployed or not
		// TODO: if so then we can early return a standard 1271 sig otherwise use the wrap function to return the sig

		console.log("signMessage", message);
		return await this.signer.signMessage({ message });
	}

	/**
	 * This is used when the account has been deployed and will sign 1271
	 */
	async signTypedData<
		const typedData extends TypedData | Record<string, unknown>,
		primaryType extends keyof typedData | "EIP712Domain" = keyof typedData,
	>(typedDataDefinition: TypedDataDefinition<typedData, primaryType>) {
		return await this.signer.signTypedData(typedDataDefinition);
	}

	// ? Should we try do something that wraps the tx into a userOp
	// ! for now we assume this is a noop
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
