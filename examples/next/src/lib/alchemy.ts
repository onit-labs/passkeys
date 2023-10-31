import { AlchemyProvider } from "@alchemy/aa-alchemy";
import { LightSmartContractAccount, getDefaultLightAccountFactory } from "@alchemy/aa-accounts";
import { type WalletClientSigner } from "@alchemy/aa-core";
import { type Chain, type Address } from "viem";

// v6 entrypoint address
const ENTRYPOINT = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789" as const;

const ALCHEMY_API_KEYS = (
	process.env.NEXT_PUBLIC_ALCHEMY_API_KEYS
		? JSON.parse(process.env.NEXT_PUBLIC_ALCHEMY_API_KEYS)
		: {}
) as Record<string, { key: string; name: string }>;

export const getAlchemyProvider = ({
	signer,
	chain,
	entryPoint = ENTRYPOINT,
}: { signer: WalletClientSigner; chain: Chain; entryPoint?: Address }) => {
	const alchemyChain = ALCHEMY_API_KEYS?.[String(chain.id)];

	if (!alchemyChain) {
		throw new Error(`Alchemy API key not found for chain ${chain.id}`);
	}

	return new AlchemyProvider({
		apiKey: alchemyChain.key,
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
};
