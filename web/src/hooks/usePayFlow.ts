import { useCallback, useState } from "react";
import type { WalletAccountV6 } from "starknet";

import { loadEnvelopeKeys, STEP_COPY } from "../lib/config";
import { payWithWallet } from "../pay";

export type ProgressRow = { id: number; step: string; detail?: string };

export type PayResult = {
  status: number;
  transactionHash: string;
  body: unknown;
};

export function usePayFlow() {
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<ProgressRow[]>([]);
  const [result, setResult] = useState<PayResult | null>(null);
  const [error, setError] = useState("");

  const reset = useCallback(() => {
    setLog([]);
    setResult(null);
    setError("");
  }, []);

  const pay = useCallback(
    async (input: {
      resourceUrl: string;
      account: WalletAccountV6;
      payerAddress: string;
    }) => {
      setError("");
      setResult(null);
      setLog([]);
      setBusy(true);
      try {
        const paid = await payWithWallet({
          resourceUrl: input.resourceUrl,
          account: input.account,
          payerAddress: input.payerAddress,
          envelope: loadEnvelopeKeys(),
          onProgress: ({ step, detail }) => {
            setLog((rows) => [...rows, { id: rows.length + 1, step, detail }]);
          },
        });
        setResult(paid);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  return {
    busy,
    log,
    result,
    error,
    setError,
    pay,
    reset,
    stepLabel: (step: string) => STEP_COPY[step] || step,
  };
}
