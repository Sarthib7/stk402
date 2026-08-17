import type { PayResult, ProgressRow } from "../hooks/usePayFlow";
import { shortAddress } from "../lib/format";

type Props = {
  log: ProgressRow[];
  result: PayResult | null;
  error: string;
  busy: boolean;
  stepLabel: (step: string) => string;
};

export function PayStatus({ log, result, error, busy, stepLabel }: Props) {
  if (log.length === 0 && !result && !error) return null;

  return (
    <section
      className="status"
      aria-live="polite"
      aria-labelledby="status-heading"
    >
      <h2 id="status-heading">
        {result ? "Settled" : error ? "Blocked" : "Progress"}
      </h2>

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
                  <p className="timeline-title">{stepLabel(row.step)}</p>
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
  );
}
