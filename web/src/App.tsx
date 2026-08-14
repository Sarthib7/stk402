import { useEffect, useState } from "react";
import type { WalletAccountV6 } from "starknet";

import { payWithWallet } from "./pay";
import {
  connectWallet,
  listPickableWallets,
  type WalletWithStarknetFeatures,
} from "./wallet";
import "./App.css";

const DEFAULT_RESOURCE =
  import.meta.env.VITE_STK402_RESOURCE_URL?.trim() ||
  "http://127.0.0.1:8787/tools/sha256?text=stk402";

const SKILL_URL =
  import.meta.env.VITE_STK402_SKILL_URL?.trim() ||
  (typeof window !== "undefined"
    ? `${window.location.origin}/SKILL.md`
    : "/SKILL.md");

function loadEnvelopeKeys() {
  const serverPublicKey =
    import.meta.env.VITE_STK402_ENVELOPE_PUBLIC_KEY?.trim() || "";
  const clientPrivateKey =
    import.meta.env.VITE_STK402_CLIENT_ENVELOPE_PRIVATE_KEY?.trim() || "";
  const clientPublicKey =
    import.meta.env.VITE_STK402_CLIENT_ENVELOPE_PUBLIC_KEY?.trim() || "";
  if (!serverPublicKey && !clientPrivateKey && !clientPublicKey) {
    return undefined;
  }
  if (!serverPublicKey || !clientPrivateKey || !clientPublicKey) {
    throw new Error(
      "set all three VITE_STK402_* envelope keys, or leave all empty for plaintext exact-private",
    );
  }
  return { serverPublicKey, clientPrivateKey, clientPublicKey };
}

export default function App() {
  const [wallets, setWallets] = useState<WalletWithStarknetFeatures[]>([]);
  const [account, setAccount] = useState<WalletAccountV6 | null>(null);
  const [address, setAddress] = useState("");
  const [chainId, setChainId] = useState("");
  const [strk20Ok, setStrk20Ok] = useState(false);
  const [strk20Note, setStrk20Note] = useState("");
  const [resourceUrl, setResourceUrl] = useState(DEFAULT_RESOURCE);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [result, setResult] = useState<string>("");
  const [error, setError] = useState("");

  useEffect(() => {
    setWallets(listPickableWallets());
    const timer = window.setInterval(() => {
      setWallets(listPickableWallets());
    }, 1500);
    return () => window.clearInterval(timer);
  }, []);

  async function onConnect(wallet: WalletWithStarknetFeatures) {
    setError("");
    setBusy(true);
    try {
      const connected = await connectWallet(wallet);
      setAccount(connected.account);
      setAddress(connected.address);
      setChainId(connected.chainId);
      setStrk20Ok(connected.strk20.ok);
      setStrk20Note(
        connected.strk20.ok
          ? `STRK20 Wallet API ok (${connected.strk20.versions.join(", ") || "ok"})`
          : connected.strk20.reason || "STRK20 not supported",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onPay() {
    if (!account || !address) {
      setError("connect Ready or Xverse first");
      return;
    }
    if (!strk20Ok) {
      setError("connected wallet cannot run STRK20 private pay");
      return;
    }
    setError("");
    setResult("");
    setLog([]);
    setBusy(true);
    try {
      const paid = await payWithWallet({
        resourceUrl,
        account,
        payerAddress: address,
        envelope: loadEnvelopeKeys(),
        onProgress: ({ step, detail }) => {
          setLog((rows) => [...rows, detail ? `${step}: ${detail}` : step]);
        },
      });
      setResult(JSON.stringify(paid, null, 2));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <header className="hero">
        <p className="brand">stk402</p>
        <h1>Consumer pay</h1>
        <p className="lede">
          Connect Ready or Xverse. Pay a real x402 Paid Resource from STRK20
          notes. No viewing key leaves the wallet. Agents: open the skill URL
          below and pay via CLI or MCP.
        </p>
      </header>

      <section className="panel">
        <h2>Agent skill</h2>
        <p className="muted">
          Same demo origin. Load this skill, point{" "}
          <code>STK402_RESOURCE_URL</code> at the Paid Resource below, then{" "}
          <code>npm run pay:resource</code> or MCP{" "}
          <code>stk402_pay_resource</code>.
        </p>
        <p className="meta">
          <span className="label">Skill</span>{" "}
          <a href={SKILL_URL} target="_blank" rel="noreferrer">
            {SKILL_URL}
          </a>
        </p>
      </section>

      <section className="panel">
        <h2>1. Wallet</h2>
        {!address ? (
          <ul className="wallets">
            {wallets.length === 0 ? (
              <li className="muted">No Ready/Xverse detected yet.</li>
            ) : (
              wallets.map((wallet) => (
                <li key={wallet.name}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onConnect(wallet)}
                  >
                    {wallet.name}
                  </button>
                </li>
              ))
            )}
          </ul>
        ) : (
          <div className="meta">
            <p>
              <span className="label">Address</span> {address}
            </p>
            <p>
              <span className="label">Chain</span> {chainId}
            </p>
            <p className={strk20Ok ? "ok" : "bad"}>{strk20Note}</p>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>2. Paid Resource</h2>
        <label className="field">
          <span>Resource URL</span>
          <input
            value={resourceUrl}
            onChange={(event) => setResourceUrl(event.target.value.trim())}
            spellCheck={false}
          />
        </label>
        <button type="button" disabled={busy || !strk20Ok} onClick={onPay}>
          {busy ? "Working…" : "Pay privately"}
        </button>
        <p className="muted">
          Proof generation can take minutes. Merchant must be pool-registered.
          Envelope servers need the three VITE_STK402_* envelope keys (same
          authorized client key the server pins).
        </p>
      </section>

      {(log.length > 0 || result || error) && (
        <section className="panel">
          <h2>3. Result</h2>
          {log.length > 0 && (
            <ol className="log">
              {log.map((row) => (
                <li key={row}>{row}</li>
              ))}
            </ol>
          )}
          {error && <pre className="error">{error}</pre>}
          {result && <pre className="okbox">{result}</pre>}
        </section>
      )}
    </main>
  );
}
