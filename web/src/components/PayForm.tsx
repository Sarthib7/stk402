type Props = {
  resourceUrl: string;
  canPay: boolean;
  busy: boolean;
  connected: boolean;
  strk20Ok: boolean;
  strk20Note: string;
  onResourceUrlChange: (value: string) => void;
  onPay: () => void;
};

export function PayForm({
  resourceUrl,
  canPay,
  busy,
  connected,
  strk20Ok,
  strk20Note,
  onResourceUrlChange,
  onPay,
}: Props) {
  return (
    <section className="pay" aria-labelledby="pay-heading">
      <h2 id="pay-heading">Paid Resource</h2>
      <p className="section-lede">
        Paste the invoice endpoint. Proof generation can take a few minutes.
      </p>

      <label className="field">
        <span className="field-label">Resource URL</span>
        <input
          value={resourceUrl}
          onChange={(event) => onResourceUrlChange(event.target.value.trim())}
          spellCheck={false}
          autoComplete="off"
          inputMode="url"
          enterKeyHint="go"
          placeholder="https://…/tools/sha256?text=stk402"
        />
      </label>

      <button
        type="button"
        className="btn btn-accent btn-block"
        disabled={!canPay}
        onClick={onPay}
      >
        {busy ? "Working…" : "Pay privately"}
      </button>

      {!connected && (
        <p className="hint">Connect a wallet to enable private pay.</p>
      )}
      {connected && !strk20Ok && (
        <p className="hint warn">{strk20Note}</p>
      )}
    </section>
  );
}
