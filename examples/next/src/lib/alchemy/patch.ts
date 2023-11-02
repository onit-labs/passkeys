// ! the following makes the necessary changes for the aa-core lib to support viem v2

import {
  getContract,
  type Address,
  type Chain,
  type GetContractReturnType,
  type Hash,
  type Hex,
  type HttpTransport,
  type PublicClient,
  type Transport,
  decodeFunctionResult,
} from "viem";

import {
  EntryPointAbi,
  createPublicErc4337Client,
  SimpleAccountAbi,
  SimpleAccountFactoryAbi,
  wrapSignatureWith6492,
  type SmartAccountSigner,
  type PublicErc4337Client,
  type ISmartContractAccount,
  type SignTypedDataParams,
  type SupportedTransports,
  type BatchUserOperationCallData
} from "@alchemy/aa-core";


/**
 * 
 * 
 * 
 * 
 * ! base sca
 * 
 * 
 * 
 */

export enum DeploymentState {
  UNDEFINED = "0x0",
  NOT_DEPLOYED = "0x1",
  DEPLOYED = "0x2",
}

export interface BaseSmartAccountParams<
  TTransport extends SupportedTransports = Transport
> {
  rpcClient: string | PublicErc4337Client<TTransport>;
  entryPointAddress: Address;
  factoryAddress: Address;
  owner?: SmartAccountSigner | undefined;
  chain: Chain;
  accountAddress?: Address;
}

export abstract class BaseSmartContractAccount<
  TTransport extends SupportedTransports = Transport
> implements ISmartContractAccount {
  protected factoryAddress: Address;
  protected deploymentState: DeploymentState = DeploymentState.UNDEFINED;
  protected accountAddress?: Address;
  protected owner: SmartAccountSigner | undefined;
  protected entryPoint: GetContractReturnType<
    typeof EntryPointAbi,
    PublicClient,
    Chain
  >;
  protected entryPointAddress: Address;
  protected rpcProvider:
    | PublicErc4337Client<TTransport>
    | PublicErc4337Client<HttpTransport>;

  constructor(params: BaseSmartAccountParams<TTransport>) {
    this.entryPointAddress = params.entryPointAddress;

    const rpcUrl =
      typeof params.rpcClient === "string"
        ? params.rpcClient
        : params.rpcClient.transport.type === "http"
          ? (
            params.rpcClient.transport as ReturnType<HttpTransport>["config"] &
            ReturnType<HttpTransport>["value"]
          ).url || params.chain.rpcUrls.default.http[0]
          : undefined;

    const fetchOptions =
      typeof params.rpcClient === "string"
        ? undefined
        : params.rpcClient.transport.type === "http"
          ? (
            params.rpcClient.transport as ReturnType<HttpTransport>["config"] &
            ReturnType<HttpTransport>["value"]
          ).fetchOptions
          : undefined;

    this.rpcProvider = rpcUrl
      ? createPublicErc4337Client({
        chain: params.chain,
        rpcUrl,
        fetchOptions: {
          ...fetchOptions,
          headers: {
            ...fetchOptions?.headers,
            "Alchemy-Aa-Sdk-Signer": params.owner?.signerType,
            "Alchemy-Aa-Sdk-Factory-Address": params.factoryAddress,
          },
        },
      })
      : (params.rpcClient as PublicErc4337Client<TTransport>);

    this.accountAddress = params.accountAddress;
    this.factoryAddress = params.factoryAddress;
    this.owner = params.owner;

    this.entryPoint = getContract({
      address: params.entryPointAddress,
      abi: EntryPointAbi,
      // Need to cast this as PublicClient or else it breaks ABI typing.
      // This is valid because our PublicClient is a subclass of PublicClient
      client: this.rpcProvider as PublicClient,
    });
  }

  // #region abstract-methods

  /**
   * This method should return a signature that will not `revert` during validation.
   * It does not have to pass validation, just not cause the contract to revert.
   * This is required for gas estimation so that the gas estimate are accurate.
   *
   */
  abstract getDummySignature(): Hash;

  /**
   * this method should return the abi encoded function data for a call to your contract's `execute` method
   *
   * @param target -- equivalent to `to` in a normal transaction
   * @param value -- equivalent to `value` in a normal transaction
   * @param data -- equivalent to `data` in a normal transaction
   * @returns abi encoded function data for a call to your contract's `execute` method
   */
  abstract encodeExecute(
    target: string,
    value: bigint,
    data: string
  ): Promise<Hash>;

  /**
   * this should return an ERC-191 compliant message and is used to sign UO Hashes
   *
   * @param msg -- the message to sign
   */
  abstract signMessage(msg: string | Uint8Array): Promise<Hash>;

  /**
   * this should return the init code that will be used to create an account if one does not exist.
   * Usually this is the concatenation of the account's factory address and the abi encoded function data of the account factory's `createAccount` method.
   */
  protected abstract getAccountInitCode(): Promise<Hash>;

  // #endregion abstract-methods

  // #region optional-methods

  /**
   * If your contract supports signing and verifying typed data,
   * you should implement this method.
   *
   * @param _params -- Typed Data params to sign
   */
  async signTypedData(_params: SignTypedDataParams): Promise<`0x${string}`> {
    throw new Error("signTypedData not supported");
  }

  /**
   * This method should wrap the result of `signMessage` as per
   * [EIP-6492](https://eips.ethereum.org/EIPS/eip-6492)
   *
   * @param msg -- the message to sign
   */
  async signMessageWith6492(msg: string | Uint8Array): Promise<`0x${string}`> {
    const [isDeployed, signature] = await Promise.all([
      this.isAccountDeployed(),
      this.signMessage(msg),
    ]);

    return this.create6492Signature(isDeployed, signature);
  }

  /**
   * Similar to the signMessageWith6492 method above,
   * this method should wrap the result of `signTypedData` as per
   * [EIP-6492](https://eips.ethereum.org/EIPS/eip-6492)
   *
   * @param params -- Typed Data params to sign
   */
  async signTypedDataWith6492(
    params: SignTypedDataParams
  ): Promise<`0x${string}`> {
    const [isDeployed, signature] = await Promise.all([
      this.isAccountDeployed(),
      this.signTypedData(params),
    ]);

    return this.create6492Signature(isDeployed, signature);
  }

  private async create6492Signature(
    isDeployed: boolean,
    signature: Hash
  ): Promise<Hash> {
    if (isDeployed) {
      return signature;
    }

    const [factoryAddress, factoryCalldata] =
      await this.parseFactoryAddressFromAccountInitCode();

    console.debug(
      `[BaseSmartContractAccount](create6492Signature)\
        factoryAddress: ${factoryAddress}, factoryCalldata: ${factoryCalldata}`
    );

    return wrapSignatureWith6492({
      factoryAddress,
      factoryCalldata,
      signature,
    });
  }

  /**
   * Not all contracts support batch execution.
   * If your contract does, this method should encode a list of
   * transactions into the call data that will be passed to your
   * contract's batch execution method.
   *
   * @param _txs -- the transactions to batch execute
   */
  async encodeBatchExecute(
    _txs: BatchUserOperationCallData
  ): Promise<`0x${string}`> {
    throw new Error("encodeBatchExecute not supported");
  }
  // #endregion optional-methods

  async getNonce(): Promise<bigint> {
    if (!(await this.isAccountDeployed())) {
      return 0n;
    }
    const address = await this.getAddress();
    return this.entryPoint.read.getNonce([address, BigInt(0)]);
  }

  async getInitCode(): Promise<Hex> {
    if (this.deploymentState === DeploymentState.DEPLOYED) {
      return "0x";
    }
    const contractCode = await this.rpcProvider.getBytecode({
      address: await this.getAddress(),
    });

    if ((contractCode?.length ?? 0) > 2) {
      this.deploymentState = DeploymentState.DEPLOYED;
      return "0x";
    } else {
      this.deploymentState = DeploymentState.NOT_DEPLOYED;
    }

    return this.getAccountInitCode();
  }

  async getAddress(): Promise<Address> {
    if (!this.accountAddress) {
      const initCode = await this.getAccountInitCode();
      console.debug(
        "[BaseSmartContractAccount](getAddress) initCode: ",
        initCode
      );
      try {
        await this.entryPoint.simulate.getSenderAddress([initCode]);
      } catch (err: any) {
        console.debug(
          "[BaseSmartContractAccount](getAddress) entrypoint.getSenderAddress result: ",
          err
        );
        if (err.cause?.data?.errorName === "SenderAddressResult") {
          this.accountAddress = err.cause.data.args[0] as Address;
          return this.accountAddress;
        }
      }

      throw new Error("getCounterFactualAddress failed");
    }

    return this.accountAddress;
  }

  getOwner(): SmartAccountSigner | undefined {
    return this.owner;
  }

  getFactoryAddress(): Address {
    return this.factoryAddress;
  }

  // Extra implementations
  async isAccountDeployed(): Promise<boolean> {
    return (await this.getDeploymentState()) === DeploymentState.DEPLOYED;
  }

  async getDeploymentState(): Promise<DeploymentState> {
    if (this.deploymentState === DeploymentState.UNDEFINED) {
      const initCode = await this.getInitCode();
      return initCode === "0x"
        ? DeploymentState.DEPLOYED
        : DeploymentState.NOT_DEPLOYED;
    } else {
      return this.deploymentState;
    }
  }

  /**
   * https://eips.ethereum.org/EIPS/eip-4337#first-time-account-creation
   * The initCode field (if non-zero length) is parsed as a 20-byte address,
   * followed by calldata to pass to this address.
   * The factory address is the first 40 char after the 0x, and the callData is the rest.
   */
  protected async parseFactoryAddressFromAccountInitCode(): Promise<
    [Address, Hex]
  > {
    const initCode = await this.getAccountInitCode();
    const factoryAddress = `0x${initCode.substring(2, 42)}` as Address;
    const factoryCalldata = `0x${initCode.substring(42)}` as Hex;
    return [factoryAddress, factoryCalldata];
  }
}


/**
 * 
 * 
 * 
 * 
 * ! simple-account
 * 
 * 
 * 
 */

import {
  concatHex,
  encodeFunctionData,
  hexToBytes,
  type FallbackTransport,
} from "viem";


export interface SimpleSmartAccountParams<
  TTransport extends Transport | FallbackTransport = Transport
> extends BaseSmartAccountParams<TTransport> {
  owner: SmartAccountSigner;
  index?: bigint;
}

export class SimpleSmartContractAccount<
  TTransport extends Transport | FallbackTransport = Transport
> extends BaseSmartContractAccount<TTransport> {
  protected owner: SmartAccountSigner;
  protected index: bigint;

  constructor(params: SimpleSmartAccountParams<TTransport>) {
    super(params);
    this.owner = params.owner;
    this.index = params.index ?? 0n;
  }

  getDummySignature(): `0x${string}` {
    return "0xfffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1c";
  }

  async encodeExecute(
    target: Hex,
    value: bigint,
    data: Hex
  ): Promise<`0x${string}`> {
    return encodeFunctionData({
      abi: SimpleAccountAbi,
      functionName: "execute",
      args: [target, value, data],
    });
  }

  override async encodeBatchExecute(
    txs: BatchUserOperationCallData
  ): Promise<`0x${string}`> {
    const [targets, datas] = txs.reduce(
      (accum, curr) => {
        accum[0].push(curr.target);
        accum[1].push(curr.data);

        return accum;
      },
      [[], []] as [Address[], Hex[]]
    );

    return encodeFunctionData({
      abi: SimpleAccountAbi,
      functionName: "executeBatch",
      args: [targets, datas],
    });
  }

  signMessage(msg: Uint8Array | string): Promise<`0x${string}`> {
    if (typeof msg === "string" && msg.startsWith("0x")) {
      msg = hexToBytes(msg as Hex);
    } else if (typeof msg === "string") {
      msg = new TextEncoder().encode(msg);
    }

    return this.owner.signMessage(msg);
  }

  protected async getAccountInitCode(): Promise<`0x${string}`> {
    return concatHex([
      this.factoryAddress,
      encodeFunctionData({
        abi: SimpleAccountFactoryAbi,
        functionName: "createAccount",
        args: [await this.owner.getAddress(), this.index],
      }),
    ]);
  }
}


/**
 * 
 * 
 * 
 * 
 * ! light-account
 * 
 * 
 * 
 */


import {
  SmartAccountProvider,
} from "@alchemy/aa-core";
import { LightAccountAbi } from "./abis/light-account-abi";
import { LightAccountFactoryAbi } from "./abis/light-account-factory-abi";

export class LightSmartContractAccount<
  TTransport extends Transport | FallbackTransport = Transport
> extends SimpleSmartContractAccount<TTransport> {
  override async signTypedData(params: SignTypedDataParams): Promise<Hash> {
    return this.owner.signTypedData(params);
  }

  /**
   * Returns the on-chain EOA owner address of the account.
   *
   * @returns {Address} the on-chain EOA owner of the account
   */
  async getOwnerAddress(): Promise<Address> {
    const callResult = await this.rpcProvider.call({
      to: await this.getAddress(),
      data: encodeFunctionData({
        abi: LightAccountAbi,
        functionName: "owner",
      }),
    });

    if (callResult.data == null) {
      throw new Error("could not get on-chain owner");
    }

    const decodedCallResult = decodeFunctionResult({
      abi: LightAccountAbi,
      functionName: "owner",
      data: callResult.data,
    });

    if (decodedCallResult !== (await this.owner.getAddress())) {
      throw new Error("on-chain owner does not match account owner");
    }

    return decodedCallResult;
  }

  /**
   * Encodes the transferOwnership function call using the LightAccount ABI.
   *
   * @param newOwner - the new owner of the account
   * @returns {Hex} the encoded function call
   */
  static encodeTransferOwnership(newOwner: Address): Hex {
    return encodeFunctionData({
      abi: LightAccountAbi,
      functionName: "transferOwnership",
      args: [newOwner],
    });
  }

  /**
   * Transfers ownership of the account to the newOwner on-chain and also updates the owner of the account.
   * Optionally waits for the transaction to be mined.
   *
   * @param provider - the provider to use to send the transaction
   * @param newOwner - the new owner of the account
   * @param waitForTxn - whether or not to wait for the transaction to be mined
   * @returns {Hash} the userOperation hash, or transaction hash if `waitForTxn` is true
   */
  static async transferOwnership<
    TTransport extends Transport | FallbackTransport = Transport
  >(
    provider: SmartAccountProvider<TTransport> & {
      account: LightSmartContractAccount<TTransport>;
    },
    newOwner: SmartAccountSigner,
    waitForTxn = false
  ): Promise<Hash> {
    const data = this.encodeTransferOwnership(await newOwner.getAddress());
    const result = await provider.sendUserOperation({
      target: await provider.getAddress(),
      data,
    });

    provider.account.owner = newOwner;

    if (waitForTxn) {
      return provider.waitForUserOperationTransaction(result.hash);
    }

    return result.hash;
  }

  protected override async getAccountInitCode(): Promise<`0x${string}`> {
    return concatHex([
      this.factoryAddress,
      encodeFunctionData({
        abi: LightAccountFactoryAbi,
        functionName: "createAccount",
        args: [await this.owner.getAddress(), this.index],
      }),
    ]);
  }
}

/**
 * 
 * 
 * 
 * 
 * ! provider
 * 
 * 
 * 
 */

import {
  deepHexlify,
  resolveProperties,
  type AccountMiddlewareFn,
  type SmartAccountProviderConfig,
} from "@alchemy/aa-core";
import {
  withAlchemyGasFeeEstimator,
  withAlchemyGasManager,
  SupportedChains
} from "@alchemy/aa-alchemy";
import {
  arbitrum,
  arbitrumGoerli,
  optimism,
  optimismGoerli,
} from "viem/chains";

export type ConnectionConfig =
  | { rpcUrl?: never; apiKey: string; jwt?: never }
  | { rpcUrl?: never; apiKey?: never; jwt: string }
  | { rpcUrl: string; apiKey?: never; jwt?: never }
  | { rpcUrl: string; apiKey?: never; jwt: string };

export type AlchemyProviderConfig = {
  feeOpts?: {
    /** this adds a percent buffer on top of the base fee estimated (default 50%)
     * NOTE: this is only applied if the default fee estimator is used.
     */
    baseFeeBufferPercent?: bigint;
    /** this adds a percent buffer on top of the priority fee estimated (default 5%)'
     * * NOTE: this is only applied if the default fee estimator is used.
     */
    maxPriorityFeeBufferPercent?: bigint;
    /** this adds a percent buffer on top of the preVerificationGasEstimated
     *
     * Defaults 5% on Arbitrum and Optimism, 0% elsewhere
     *
     * This is only useful on Arbitrum and Optimism, where the preVerificationGas is
     * dependent on the gas fee during the time of estimation. To improve chances of
     * the UserOperation being mined, users can increase the preVerificationGas by
     * a buffer. This buffer will always be charged, regardless of price at time of mine.
     *
     * NOTE: this is only applied if the defualt gas estimator is used.
     */
    preVerificationGasBufferPercent?: bigint;
  };
} & Omit<SmartAccountProviderConfig, "rpcProvider"> &
  ConnectionConfig;

export class AlchemyProvider extends SmartAccountProvider<HttpTransport> {
  private pvgBuffer: bigint;
  private feeOptsSet: boolean;

  constructor({
    chain,
    entryPointAddress,
    opts,
    feeOpts,
    ...connectionConfig
  }: AlchemyProviderConfig) {
    const _chain =
      typeof chain === "number" ? SupportedChains.get(chain) : chain;
    if (!_chain || !_chain.rpcUrls["alchemy"]) {
      throw new Error(`AlchemyProvider: chain (${chain}) not supported`);
    }

    const rpcUrl = connectionConfig.rpcUrl == null ? `${_chain.rpcUrls.alchemy.http[0]}` : connectionConfig.rpcUrl;

    const client = createPublicErc4337Client({
      chain: _chain,
      rpcUrl,
      ...(connectionConfig.jwt != null && {
        fetchOptions: {
          headers: {
            Authorization: `Bearer ${connectionConfig.jwt}`,
          },
        },
      }),
    });

    super({ rpcProvider: client, entryPointAddress, chain: _chain, opts });

    withAlchemyGasFeeEstimator(
      this,
      feeOpts?.baseFeeBufferPercent ?? 50n,
      feeOpts?.maxPriorityFeeBufferPercent ?? 5n
    );

    if (feeOpts?.preVerificationGasBufferPercent) {
      this.pvgBuffer = feeOpts?.preVerificationGasBufferPercent;
    } else if (
      new Set<number>([
        arbitrum.id,
        arbitrumGoerli.id,
        optimism.id,
        optimismGoerli.id,
      ]).has(this.chain.id)
    ) {
      this.pvgBuffer = 5n;
    } else {
      this.pvgBuffer = 0n;
    }

    this.feeOptsSet = !!feeOpts;
  }

  override gasEstimator: AccountMiddlewareFn = async (struct) => {
    const request = deepHexlify(await resolveProperties(struct));
    const estimates = await this.rpcClient.estimateUserOperationGas(
      request,
      this.entryPointAddress
    );
    estimates.preVerificationGas =
      (BigInt(estimates.preVerificationGas) * (100n + this.pvgBuffer)) / 100n;

    return {
      ...struct,
      ...estimates,
    };
  };

  /**
   * This methods adds the Alchemy Gas Manager middleware to the provider.
   *
   * @param config - the Alchemy Gas Manager configuration
   * @returns {AlchemyProvider} - a new AlchemyProvider with the Gas Manager middleware
   */
  withAlchemyGasManager(config: Parameters<typeof withAlchemyGasManager>[1]): AlchemyProvider {
    if (!this.isConnected()) {
      throw new Error(
        "AlchemyProvider: account is not set, did you call `connect` first?"
      );
    }

    return withAlchemyGasManager(this, config, !this.feeOptsSet);
  }
}
