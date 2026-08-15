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

const STEP_COPY: Record<string, string> = {
  request: "Reading invoice",
  envelope: "Opening encrypted terms",
  transfer: "Proving shielded transfer",
  receipt: "Signing receipt",
  settle: "Settling Paid Resource",
};

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

function shortAddress(value: string): string {
  if (value.length < 14) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function chainLabel(chainId: string): string {
  if (chainId.includes("SN_MAIN") || chainId.endsWith("534e5f4d41494e")) {
    return "Mainnet";
  }
  if (chainId.includes("SN_SEPOLIA") || chainId.includes("SEPOLIA")) {
    return "Sepolia";
  }
  return chainId;
}

type ProgressRow = { id: number; step: string; detail?: string };

export default function App() {
  const [wallets, setWallets] = useState<WalletWithStarknetFeatures[]>([]);
  const [account, setAccount] = useState<WalletAccountV6 | null>(null);
  const [address, setAddress] = useState("");
  const [chainId, setChainId] = useState("");
  const [strk20Ok, setStrk20Ok] = useState(false);
  const [strk20Note, setStrk20Note] = useState("");
  const [resourceUrl, setResourceUrl] = useState(DEFAULT_RESOURCE);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<ProgressRow[]>([]);
  const [result, setResult] = useState<{
    status: number;
    transactionHash: string;
    body: unknown;
  } | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

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
          ? `STRK20 ready (${connected.strk20.versions.join(", ") || "ok"})`
          : connected.strk20.reason || "STRK20 not supported",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function onDisconnect() {
    setAccount(null);
    setAddress("");
    setChainId("");
    setStrk20Ok(false);
    setStrk20Note("");
    setResult(null);
    setLog([]);
    setError("");
  }

  async function onPay() {
    if (!account || !address) {
      setError("Connect Ready or Xverse first");
      return;
    }
    if (!strk20Ok) {
      setError("Connected wallet cannot run STRK20 private pay");
      return;
    }
    setError("");
    setResult(null);
    setLog([]);
    setBusy(true);
    try {
      const paid = await payWithWallet({
        resourceUrl,
        account,
        payerAddress: address,
        envelope: loadEnvelopeKeys(),
        onProgress: ({ step, detail }) => {
          setLog((rows) => [
            ...rows,
            { id: rows.length + 1, step, detail },
          ]);
        },
      });
      setResult(paid);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function copySkill() {
    try {
      await navigator.clipboard.writeText(SKILL_URL);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  const canPay = Boolean(account && strk20Ok && !busy);
  const showStatus = log.length > 0 || result || error;

  return (
    <div className="shell">
      <div className="atmosphere" aria-hidden="true">
        <div className="mist mist-a" />
        <div className="mist mist-b" />
        <div className="cipher-grid" />
        <div className="note-plane">
          <svg viewBox="0 0 420 520" className="note-svg" role="img">
            <defs>
              <linearGradient id="noteFill" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#1a7a5c" stopOpacity="0.18" />
                <stop offset="55%" stopColor="#0c1620" stopOpacity="0.06" />
                <stop offset="100%" stopColor="#3d6b8a" stopOpacity="0.14" />
              </linearGradient>
            </defs>
            <rect
              x="48"
              y="40"
              width="280"
              height="380"
              rx="18"
              fill="url(#noteFill)"
              stroke="#0c1620"
              strokeOpacity="0.18"
              strokeWidth="1.5"
            />
            <rect
              x="88"
              y="78"
              width="280"
              height="380"
              rx="18"
              fill="#f4f7f9"
              fillOpacity="0.55"
              stroke="#0c1620"
              strokeOpacity="0.12"
              strokeWidth="1.5"
            />
            <path
              d="M128 150h160M128 186h120M128 222h140M128 258h90"
              stroke="#0c1620"
              strokeOpacity="0.22"
              strokeWidth="6"
              strokeLinecap="round"
            />
            <circle cx="300" cy="340" r="28" fill="#2f9e7a" fillOpacity="0.85" />
            <path
              d="M288 340h24M300 328v24"
              stroke="#f4f7f9"
              strokeWidth="4"
              strokeLinecap="round"
            />
          </svg>
        </div>
      </div>

      <header className="hero">
        <p className="brand">stk402</p>
        <h1>Pay from shielded notes</h1>
        <p className="lede">
          Connect Ready or Xverse. Settle a real x402 invoice — the amount stays
          in the note.
        </p>

        <div className="cta-group">
          {!address ? (
            wallets.length === 0 ? (
              <p className="hint pulse">
                Waiting for Ready or Xverse…
              </p>
            ) : (
              wallets.map((wallet) => (
                <button
                  key={wallet.name}
                  type="button"
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() => onConnect(wallet)}
                >
                  Connect {wallet.name}
                </button>
              ))
            )
          ) : (
            <div className="session" role="status">
              <div className="session-main">
                <span className={`dot ${strk20Ok ? "dot-ok" : "dot-bad"}`} />
                <div>
                  <p className="session-addr">{shortAddress(address)}</p>
                  <p className="session-meta">
                    {chainLabel(chainId)} · {strk20Note}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={onDisconnect}
                disabled={busy}
              >
                Disconnect
              </button>
            </div>
          )}
        </div>
      </header>

      <section className="pay" aria-labelledby="pay-heading">
        <h2 id="pay-heading">Paid Resource</h2>
        <p className="section-lede">
          Paste the invoice endpoint. Proof generation can take a few minutes.
        </p>

        <label className="field">
          <span className="field-label">Resource URL</span>
          <input
            value={resourceUrl}
            onChange={(event) => setResourceUrl(event.target.value.trim())}
            spellCheck={false}
            autoComplete="off"
            placeholder="https://…/tools/sha256?text=stk402"
          />
        </label>

        <button
          type="button"
          className="btn btn-accent"
          disabled={!canPay}
          onClick={onPay}
        >
          {busy ? "Working…" : "Pay privately"}
        </button>

        {!address && (
          <p className="hint">Connect a wallet to enable private pay.</p>
        )}
        {address && !strk20Ok && (
          <p className="hint warn">{strk20Note}</p>
        )}
      </section>

      {showStatus && (
        <section
          className="status"
          aria-live="polite"
          aria-labelledby="status-heading"
        >
          <h2 id="status-heading">{result ? "Settled" : error ? "Blocked" : "Progress"}</h2>

          {log.length > 0 && (
            <ol className="timeline">
              {log.map((row, index) => {
                const done = index < log.length - 1 || Boolean(result);
                const active = index === log.length - 1 && busy && !result;
                return (
                  <li
                    key={row.id}
                    className={`timeline-item ${done ? "is-done" : ""} ${active ? "is-active" : ""}`}
                  >
                    <span className="timeline-mark" />
                    <div>
                      <p className="timeline-title">
                        {STEP_COPY[row.step] || row.step}
                      </p>
                      {row.detail && (
                        <p className="timeline-detail">{row.detail}</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          {error && <p className="banner banner-error">{error}</p>}

          {result && (
            <div className="settle-card">
              <p className="settle-kicker">HTTP {result.status}</p>
              <p className="settle-hash">
                <span>Tx</span> {shortAddress(result.transactionHash)}
              </p>
              <pre className="settle-body">
                {JSON.stringify(result.body, null, 2)}
              </pre>
            </div>
          )}
        </section>
      )}

      <footer className="agent-foot">
        <p>
          <strong>Agents</strong> load the skill, then pay via CLI or MCP.
        </p>
        <div className="agent-actions">
          <a className="btn btn-ghost" href={SKILL_URL}>
            Open SKILL.md
          </a>
          <button type="button" className="btn btn-ghost" onClick={copySkill}>
            {copied ? "Copied" : "Copy skill URL"}
          </button>
        </div>
      </footer>
    </div>
  );
}
