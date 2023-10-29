import { AlchemyProvider } from "@alchemy/aa-alchemy";
import { LightSmartContractAccount, getDefaultLightAccountFactory } from "@alchemy/aa-accounts";
import { type WalletClientSigner } from "@alchemy/aa-core";
import { type Chain, type Address } from "viem";

// v6 entrypoint address
const ENTRYPOINT = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789" as const;

// const eoaSigner: SmartAccountSigner = LocalAccountSigner.privateKeyToAccountSigner(PRIVATE_KEY); // Create a signer for your EOA

const ALCHEMY_API_KEY = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;

if (!ALCHEMY_API_KEY) {
	throw new Error("No Alchemy API key found");
}

export const getAlchemyProvider = ({
	signer,
	chain,
	entryPoint = ENTRYPOINT,
}: { signer: WalletClientSigner; chain: Chain; entryPoint?: Address }) =>
	new AlchemyProvider({
		apiKey: ALCHEMY_API_KEY,
		chain,
		entryPointAddress: entryPoint,
	}).connect(
		(rpcClient) =>
			new LightSmartContractAccount({
				entryPointAddress: entryPoint,
				chain: rpcClient.chain,
				owner: signer,
				factoryAddress: getDefaultLightAccountFactory(rpcClient.chain),
				rpcClient,
			}),
	);
