import { http, createConfig } from "wagmi";
import { Chain, baseGoerli } from "wagmi/chains";

export const supportedChains = { [baseGoerli.id]: baseGoerli } as const;

export const chains = Object.values(supportedChains) as unknown as [Chain, ...Chain[]];

const transports = Object.fromEntries(Object.keys(supportedChains).map((id) => [id, http()]));

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
