import {
	BaseSmartAccountParams,
	BaseSmartContractAccount,
	type SmartAccountSigner,
} from "@alchemy/aa-core";
import {
	type Account,
	type Address,
	type Hex,
	type SignTypedDataParameters,
	type SignableMessage,
	type Transport,
	concatHex,
	encodeFunctionData,
	parseAbi,
} from "viem";
import { type UserOperationCallData } from "./types/4337";

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
}

interface SmartAccountWithCounterFactualOwner
	extends Omit<BaseSmartContractAccount, "owner">,
		Account<Address> {
	owner: SmartAccountSigner | undefined;
}

// interface SmartAccountOptions {
// 	accountAbi: readonly string[];
// 	smartAccount: CounterFactualSmartAccountArgs | DeployedSmartAccountArgs;
// }

/**
 * TODO:
 * - [ ] implement 1271 for deployed accounts
 */

export class PasskeySmartAccount
	extends BaseSmartContractAccount
	implements SmartAccountWithCounterFactualOwner
{
	address: `0x${string}`;
	// ! adapt the account fields so that it also matches the viem `Account` type
	publicKey = "0x" as const;
	source = "custom" as const;
	type = "local" as const;

	constructor(params: BaseSmartAccountParams<Transport>) {
		super(params);

		// // ! this should be the SCA address not the signer
		// this.address = this.getAccountAddress();
	}

	assertOwner(): asserts this is this & { owner: SmartAccountSigner } {
		if (!("owner" in this)) throw new Error("No owner has been passed");
	}

	getDummySignature(): `0x${string}` {
		throw new Error("Method not implemented.");
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

	assertCounterFactualOptionsAvailable(): asserts this is Extract<
		this,
		{ options: { smartAccount: CounterFactualSmartAccountArgs } }
	> {
		if (!("factory" in this.options.smartAccount))
			throw new Error("Smart Account factory info not provided");
	}

	async getAccountInitCode(): Promise<Hex> {
		this.assertCounterFactualOptionsAvailable();
		this.assertOwner();

		const salt = this.options.smartAccount.salt;
		const factory = this.options.smartAccount.factory;
		const signerAddress = await this.owner.getAddress();

		return concatHex([
			factory.address,
			encodeFunctionData({
				abi: parseAbi(factory.deployFunctionAbi),
				functionName: "createAccount",
				args: [signerAddress, salt],
			}),
		]);
	}

	async signMessage({ message }: { message: SignableMessage }): Promise<Hex> {
		this.assertOwner();
		const isDeployed = await this.isAccountDeployed();

		// tODO: create a 1271 sig
		// TODO: if deployed use 1271 sig otherwise use the wrap function to return the sig
		// TODO: same for typedData

		console.log("signMessage", message, isDeployed);
		return await this.owner.signMessage({ message });
	}

	async signTypedData(typedDataDefinition: Omit<SignTypedDataParameters, "privateKey">) {
		this.assertOwner();
		return await this.owner.signTypedData(typedDataDefinition);
	}

	// @ts-expect-error: // ? Should we try do something that wraps the tx into a userOp
	async signTransaction() {
		throw new Error("Please use sendUserOperation");
	}
}
