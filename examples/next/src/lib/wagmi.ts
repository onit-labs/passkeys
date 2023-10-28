import { http, createConfig } from "wagmi";
import { baseGoerli } from "wagmi/chains";

export const config = createConfig({
	chains: [baseGoerli],
	connectors: undefined,
	transports: { [baseGoerli.id]: http() },
});

declare module "wagmi" {
	interface Register {
		config: typeof config;
	}
}
