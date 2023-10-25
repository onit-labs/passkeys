import {
	concat,
	concatHex,
	createPublicClient,
	encodeAbiParameters,
	encodeFunctionData,
	getContract,
	parseAbi,
	parseAbiParameters,
	type Address,
	type Client,
	type ContractFunctionExecutionErrorType,
	type ContractFunctionRevertedErrorType,
	type FallbackTransport,
	type GetContractReturnType,
	type Hex,
	type HttpTransport,
	type LocalAccount,
	type PublicClient,
	type SerializeTransactionFn,
	type SignableMessage,
	type TransactionSerializable,
	type Transport,
	type TypedData,
	type TypedDataDefinition,
} from "viem";
import { ENTRYPOINT_ABI, GET_SENDER_ADDRESS_ABI } from "./utils/abis/entrypoint";
import { SmartAccountSigner } from "./utils/signer.type";
import { UserOperationCallData } from "./types/4337";

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

type EntryPoint = GetContractReturnType<typeof ENTRYPOINT_ABI, Client>;

/**
 * TODO:
 * - [ ] implement 1271 for deployed accounts
 */

export class SmartAccount implements LocalAccount {
	#initCode?: Hex;
	#deploymentStatus?: "unknown" | "deployed" | "counterfactual" = "unknown";
	entryPoint?: EntryPoint;
	publicClient?: PublicClient;
	address: `0x${string}`;

	constructor(
		public signer: SmartAccountSigner,
		public options: {
			transport: Transport | FallbackTransport | HttpTransport;
			entryPoint: Address;
			/**
			 * The abi of the smart account
			 * @warning should be in a form that is parsable by viem [`parseAbi`](https://viem.sh/docs/abi/parseAbi.html#parseabi)
			 */
			accountAbi: readonly string[];
			smartAccount: CounterFactualSmartAccountArgs | DeployedSmartAccountArgs;
			actions?: Parameters<PublicClient["extend"]>[0];
		},
		// ! required by viem bu not used by us
		public publicKey = "0x" as const,
		public source = "custom" as const,
		public type = "local" as const,
	) {
		// ! this should be the SCA address not the signer
		this.publicClient = createPublicClient({
			transport: this.options.transport,
		}).extend((client) => {
			if (this.options.actions) return this.options.actions(client);
			return {};
		});

		this.getEntryPointContract();

		this.address = this.getAccountAddress();
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

	assertEntryPoint(): asserts this is this & { entryPoint: EntryPoint } {
		if (!this.getEntryPointContract()) throw new Error("Failed to find entrypoint");
	}

	static async getIsAccountDeployed(address: Address, publicClient: PublicClient) {
		const contractCode = await publicClient.getBytecode({ address });

		if ((contractCode?.length ?? 0) > 2) return true;

		return false;
	}

	static async getSenderAddress(
		{ initCode, entryPoint }: { initCode: Hex; entryPoint: Address },
		publicClient: PublicClient,
	): Promise<Address> {
		try {
			await publicClient.simulateContract({
				address: entryPoint,
				abi: GET_SENDER_ADDRESS_ABI,
				functionName: "getSenderAddress",
				args: [initCode],
			});
		} catch (e) {
			const err = e as ContractFunctionExecutionErrorType;

			if (err.cause.name === "ContractFunctionRevertedError") {
				const revertError = err.cause as ContractFunctionRevertedErrorType;
				const errorName = revertError.data?.errorName ?? "";
				if (
					errorName === "SenderAddressResult" &&
					revertError.data?.args &&
					revertError.data?.args[0]
				) {
					return revertError.data?.args[0] as Address;
				}
			}

			throw e;
		}

		throw new Error("Failed to get account address");
	}

	getEntryPointContract(): EntryPoint {
		this.assertPublicClient();
		if (!this.entryPoint)
			this.entryPoint = getContract({
				abi: ENTRYPOINT_ABI,
				address: this.options.entryPoint,
				client: this.publicClient,
			});

		return this.entryPoint;
	}

	async getIsAccountDeployed(): Promise<boolean> {
		this.assertPublicClient();

		if (this.#deploymentStatus === "unknown")
			this.#deploymentStatus = (await SmartAccount.getIsAccountDeployed(
				this.address,
				this.publicClient,
			))
				? "deployed"
				: "counterfactual";

		return this.#deploymentStatus === "deployed";
	}

	async getNonce({ key = 0n }: { key: bigint }): Promise<bigint> {
		this.assertEntryPoint();
		if (!(await this.getIsAccountDeployed())) return 0n;
		const address = await this.getAccountAddress();
		return this.entryPoint.read.getNonce([address, key]);
	}

	async getAccountInitCode(): Promise<Hex> {
		if (!this.#initCode) {
			this.assertCounterFactualOptionsAvailable();

			const salt = this.options.smartAccount.salt;
			const factory = this.options.smartAccount.factory;
			const signerAddress = await this.signer.getAddress();

			this.#initCode = concatHex([
				factory.address,
				encodeFunctionData({
					abi: parseAbi(factory.deployFunctionAbi),
					functionName: "createAccount",
					args: [signerAddress, salt],
				}),
			]);
		}

		return this.#initCode;
	}

	async getAccountAddress() {
		this.assertPublicClient();
		this.assertEntryPoint();

		// - we do this in the method scope so that we can keep the initCode private
		this.getAccountInitCode();
		if (!this.#initCode) throw new Error("Failed to find initCode");

		if (!this.address)
			this.address = await SmartAccount.getSenderAddress(
				{ initCode: this.#initCode, entryPoint: this.options.entryPoint },
				this.publicClient,
			);

		return this.address;
	}

	async encodeExecute(target: Hex, value: bigint, data: Hex): Promise<`0x${string}`> {
		return encodeFunctionData({
			abi: parseAbi(this.options.accountAbi),
			functionName: "execute",
			args: [target, value, data],
		});
	}

	async encodeBatchExecute(userOps: UserOperationCallData[]): Promise<`0x${string}`> {
		const [targets, datas] = userOps.reduce(
			(accum, curr) => {
				accum[0].push(curr.target);
				accum[1].push(curr.data);

				return accum;
			},
			[[], []] as [Address[], Hex[]],
		);

		return encodeFunctionData({
			abi: parseAbi(this.options.accountAbi),
			functionName: "executeBatch",
			args: [targets, datas],
		});
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
		const isDeployed = await this.getIsAccountDeployed();

		// tODO: create a 1271 sig
		// TODO: if deployed use 1271 sig otherwise use the wrap function to return the sig
		// TODO: same for typedData

		console.log("signMessage", message, isDeployed);
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
