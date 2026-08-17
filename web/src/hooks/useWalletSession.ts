import { useCallback, useEffect, useState } from "react";
import type { WalletAccountV6 } from "starknet";

import {
  connectWallet,
  listPickableWallets,
  type WalletWithStarknetFeatures,
} from "../wallet";

export type WalletSession = {
  account: WalletAccountV6;
  address: string;
  chainId: string;
  strk20Ok: boolean;
  strk20Note: string;
};

export function useWalletSession() {
  const [wallets, setWallets] = useState<WalletWithStarknetFeatures[]>([]);
  const [session, setSession] = useState<WalletSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const refresh = () => setWallets(listPickableWallets());
    refresh();
    const timer = window.setInterval(refresh, 1500);
    return () => window.clearInterval(timer);
  }, []);

  const connect = useCallback(async (wallet: WalletWithStarknetFeatures) => {
    setError("");
    setBusy(true);
    try {
      const connected = await connectWallet(wallet);
      setSession({
        account: connected.account,
        address: connected.address,
        chainId: connected.chainId,
        strk20Ok: connected.strk20.ok,
        strk20Note: connected.strk20.ok
          ? `STRK20 ready (${connected.strk20.versions.join(", ") || "ok"})`
          : connected.strk20.reason || "STRK20 not supported",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setSession(null);
    setError("");
  }, []);

  return {
    wallets,
    session,
    busy,
    error,
    setError,
    connect,
    disconnect,
  };
}
