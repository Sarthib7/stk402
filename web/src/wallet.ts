import {
  RpcProvider,
  WalletAccountV6,
  constants,
  walletV6,
  validateAndParseAddress,
} from "starknet";
import { createStore } from "@starknet-io/get-starknet-discovery";
import type { WalletWithStarknetFeatures } from "@starknet-io/get-starknet-wallet-standard/features";

const SEPOLIA_RPC = "https://api.cartridge.gg/x/starknet/sepolia";
const MAINNET_RPC = "https://rpc.starknet.lava.build";

function normalizeId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function compareApiVersion(left: string, right: string): number {
  const parse = (v: string) =>
    v
      .replace(/^v/i, "")
      .split(/[.+-]/)
      .map((part) => Number.parseInt(part, 10) || 0);
  const a = parse(left);
  const b = parse(right);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Discovery returns v6-incompatible typings across packages; cast at the boundary. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asWalletApi(wallet: WalletWithStarknetFeatures): any {
  return wallet;
}

export function listPickableWallets(): WalletWithStarknetFeatures[] {
  const store = createStore({ eip1193Adapters: [] });
  return store.getWallets().filter((wallet) => {
    const id = normalizeId(wallet.name);
    return !id.includes("metamask") && !id.includes("braavos");
  });
}

export async function walletSupportsStrk20(
  wallet: WalletWithStarknetFeatures,
): Promise<{ ok: boolean; versions: string[]; reason?: string }> {
  try {
    const versions = await walletV6.supportedWalletApi(asWalletApi(wallet));
    const list = versions.map(String);
    const ok = list.some((version) => compareApiVersion(version, "0.10.3") >= 0);
    return {
      ok,
      versions: list,
      reason: ok
        ? undefined
        : "Wallet API below 0.10.3. Use Ready X or Xverse with STRK20 support.",
    };
  } catch (error) {
    return {
      ok: false,
      versions: [],
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function connectWallet(
  wallet: WalletWithStarknetFeatures,
): Promise<{
  account: WalletAccountV6;
  address: string;
  chainId: string;
  strk20: { ok: boolean; versions: string[]; reason?: string };
}> {
  const apiWallet = asWalletApi(wallet);
  const chainId = await walletV6.requestChainId(apiWallet);
  const rpcUrl =
    chainId === constants.StarknetChainId.SN_MAIN ? MAINNET_RPC : SEPOLIA_RPC;
  const provider = new RpcProvider({ nodeUrl: rpcUrl });
  const account = await WalletAccountV6.connect(provider, apiWallet);
  const accounts = await walletV6.requestAccounts(apiWallet);
  if (typeof accounts === "string" || !accounts[0]) {
    throw new Error("wallet did not return an account address");
  }
  const address = validateAndParseAddress(accounts[0]);
  const strk20 = await walletSupportsStrk20(wallet);
  return { account, address, chainId: String(chainId), strk20 };
}

export type { WalletWithStarknetFeatures };
