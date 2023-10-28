import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { type ReactNode } from "react";
import "./globals.css";

import { Providers } from "./providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
	title: "Passkeys Wagmi Account Example",
	description:
		"An example showing how to use largeBlob as a signer on the alchemy 4337 LightAccount",
};

export default function RootLayout(props: { children: ReactNode }) {
	return (
		<html lang="en">
			<body className={inter.className}>
				<Providers>{props.children}</Providers>
			</body>
		</html>
	);
}
