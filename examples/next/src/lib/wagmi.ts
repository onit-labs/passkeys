import { http, createConfig } from "wagmi";
import { Chain, baseGoerli as baseGoerli_ } from "wagmi/chains";
import { defineChain } from "viem";

// - define alchemy baseGoerli chain

const ALCHEMY_API_KEYS = (
	process.env.NEXT_PUBLIC_ALCHEMY_API_KEYS
		? JSON.parse(process.env.NEXT_PUBLIC_ALCHEMY_API_KEYS)
		: {}
) as Record<string, { key: string; name: string }>;

const getAlchemyChainUrl = (id: number) => {
	const alchemyChain = ALCHEMY_API_KEYS?.[String(id)];
	if (alchemyChain) return `https://${alchemyChain.name}.g.alchemy.com/v2/${alchemyChain.key}`;
};

const baseGoerliRpcUrl = getAlchemyChainUrl(baseGoerli_.id);

if (!baseGoerliRpcUrl) throw new Error("Alchemy baseGoerli RPC URL not found");

export const baseGoerli = defineChain({
	...baseGoerli_,
	rpcUrls: {
		...baseGoerli_.rpcUrls,
		alchemy: {
			http: [baseGoerliRpcUrl],
			webSocket: [baseGoerliRpcUrl?.replace("https", "wss")],
		},
	},
});

export const supportedChains = { [baseGoerli.id]: baseGoerli } as const;

export const chains = Object.values(supportedChains) as unknown as [Chain, ...Chain[]];

const transports = Object.fromEntries(
	Object.keys(supportedChains).map((id) => {
		const alchemyChainRpcUrl = getAlchemyChainUrl(id as unknown as number);

		const rpcUrl = http(alchemyChainRpcUrl || undefined);

		return [id, rpcUrl];
	}),
);

export const config = createConfig({ chains, transports });

declare module "wagmi" {
	interface Register {
		config: typeof config;
	}
}

// - helpers

type SupportedChainId = keyof typeof supportedChains;

function isSupportedChain(chainId: number): chainId is SupportedChainId {
	if (!(chainId in supportedChains)) return false;
	return true;
}

export function getChainAndTransport(id: number) {
	if (!isSupportedChain(id)) throw new Error(`Unsupported chainId: ${id}`);
	return { chain: supportedChains[id], transport: transports[id] };
}

// biome-ignore lint/style/noNonNullAssertion: <explanation>
export const defaultChainId = chains.at(0)!.id;
