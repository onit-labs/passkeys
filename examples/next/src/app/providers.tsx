"use client";

import { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { ReactQueryStreamedHydration } from "@tanstack/react-query-next-experimental";
import { useState, type ReactNode } from "react";
import { WagmiProvider, deserialize, serialize } from "wagmi";

import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";

import { IS_DEVELOPMENT } from "@/config/constants";
import { config } from "@/lib/wagmi";

// With SSR, we usually want to set some default staleTime above 0 to avoid refetching immediately on the client
const defaultOptions = { queries: { staleTime: 60 * 1000 } } as const;

export function Providers(props: { children: ReactNode }) {
	const [queryClient] = useState(() => new QueryClient({ defaultOptions }));

	const [persister] = useState(() =>
		createSyncStoragePersister({
			key: "REACT_QUERY_OFFLINE_CACHE",
			serialize,
			storage: typeof window === "undefined" ? undefined : window.localStorage,
			deserialize,
		}),
	);

	return (
		<WagmiProvider config={config}>
			<PersistQueryClientProvider client={queryClient} persistOptions={{ persister }}>
				<ReactQueryStreamedHydration>{props.children}</ReactQueryStreamedHydration>
				{IS_DEVELOPMENT && <ReactQueryDevtools initialIsOpen={false} />}
			</PersistQueryClientProvider>
		</WagmiProvider>
	);
}
