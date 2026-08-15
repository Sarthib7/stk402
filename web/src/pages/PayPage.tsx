import { useMemo, useState } from "react";

import { AgentFooter } from "../components/AgentFooter";
import { Atmosphere } from "../components/Atmosphere";
import { PayForm } from "../components/PayForm";
import { PayStatus } from "../components/PayStatus";
import { WalletConnect } from "../components/WalletConnect";
import { usePayFlow } from "../hooks/usePayFlow";
import { useWalletSession } from "../hooks/useWalletSession";
import { DEFAULT_RESOURCE, skillUrl } from "../lib/config";
import { detectWalletBrowser } from "../lib/format";

export function PayPage() {
  const wallet = useWalletSession();
  const payFlow = usePayFlow();
  const [resourceUrl, setResourceUrl] = useState(DEFAULT_RESOURCE);
  const walletBrowser = useMemo(() => detectWalletBrowser(), []);
  const skillHref = useMemo(() => skillUrl(), []);

  const busy = wallet.busy || payFlow.busy;
  const session = wallet.session;
  const canPay = Boolean(session?.strk20Ok && !busy);
  const surfaceError = payFlow.error || wallet.error;

  async function onPay() {
    if (!session) {
      payFlow.setError("Connect Ready or Xverse first");
      return;
    }
    if (!session.strk20Ok) {
      payFlow.setError("Connected wallet cannot run STRK20 private pay");
      return;
    }
    wallet.setError("");
    await payFlow.pay({
      resourceUrl,
      account: session.account,
      payerAddress: session.address,
    });
  }

  function onDisconnect() {
    wallet.disconnect();
    payFlow.reset();
  }

  return (
    <div className="shell">
      <Atmosphere />

      <header className="hero">
        <p className="brand">stk402</p>
        <h1>Pay from shielded notes</h1>
        <p className="lede">
          Connect Ready or Xverse. Settle a real x402 invoice — the amount stays
          in the note.
        </p>

        <div className="cta-group">
          <WalletConnect
            wallets={wallet.wallets}
            session={session}
            busy={busy}
            walletBrowser={walletBrowser}
            onConnect={wallet.connect}
            onDisconnect={onDisconnect}
          />
        </div>
      </header>

      <PayForm
        resourceUrl={resourceUrl}
        canPay={canPay}
        busy={busy}
        connected={Boolean(session)}
        strk20Ok={session?.strk20Ok ?? false}
        strk20Note={session?.strk20Note ?? ""}
        onResourceUrlChange={setResourceUrl}
        onPay={onPay}
      />

      <PayStatus
        log={payFlow.log}
        result={payFlow.result}
        error={surfaceError}
        busy={payFlow.busy}
        stepLabel={payFlow.stepLabel}
      />

      <AgentFooter skillHref={skillHref} />
    </div>
  );
}
