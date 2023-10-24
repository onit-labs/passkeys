import type { Address } from "abitype";
import type { CustomSource } from "viem";

export interface SmartAccountSigner extends Pick<CustomSource, "signMessage" | "signTypedData"> {
	getAddress: () => Promise<Address>;
}
