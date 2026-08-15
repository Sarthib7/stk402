import type { WalletWithStarknetFeatures } from "../wallet";
import type { WalletSession } from "../hooks/useWalletSession";
import { chainLabel, shortAddress } from "../lib/format";

type Props = {
  wallets: WalletWithStarknetFeatures[];
  session: WalletSession | null;
  busy: boolean;
  walletBrowser: string | null;
  onConnect: (wallet: WalletWithStarknetFeatures) => void;
  onDisconnect: () => void;
};

export function WalletConnect({
  wallets,
  session,
  busy,
  walletBrowser,
  onConnect,
  onDisconnect,
}: Props) {
  if (session) {
    return (
      <div className="session" role="status">
        <div className="session-main">
          <span className={`dot ${session.strk20Ok ? "dot-ok" : "dot-bad"}`} />
          <div>
            <p className="session-addr">{shortAddress(session.address)}</p>
            <p className="session-meta">
              {chainLabel(session.chainId)} · {session.strk20Note}
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
    );
  }

  if (wallets.length === 0) {
    return (
      <div className="wallet-empty">
        <p className="hint pulse">Waiting for Ready or Xverse…</p>
        <p className="hint">
          {walletBrowser
            ? `Detected ${walletBrowser} browser — approve the connection when prompted.`
            : "Install Ready or Xverse, or open this page inside the wallet browser."}
        </p>
      </div>
    );
  }

  return (
    <div className="wallet-actions">
      {wallets.map((wallet) => (
        <button
          key={wallet.name}
          type="button"
          className="btn btn-primary btn-block"
          disabled={busy}
          onClick={() => onConnect(wallet)}
        >
          Connect {wallet.name}
        </button>
      ))}
    </div>
  );
}
