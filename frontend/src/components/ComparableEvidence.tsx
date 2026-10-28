import { useState } from "react";
import { ExternalLink } from "lucide-react";
import type { LotInput } from "../../../schemas/domain";
import { openExternal } from "../api";
import { money } from "../format";

export function ComparableEvidence({ lot }: { lot: LotInput }) {
  const [error, setError] = useState("");
  async function open(url: string) {
    setError("");
    try {
      await openExternal(url);
    } catch {
      setError("The evidence page could not be opened. Try again.");
    }
  }
  return (
    <details className="comparable-evidence">
      <summary>Review comparable evidence ({lot.comparables.length})</summary>
      <p>
        Auction condition:{" "}
        <strong>{lot.condition.trim() || "Not provided"}</strong>
      </p>
      <p className="form-note">
        Check the product, condition, date and final price yourself. No
        automatic matching or age cutoff is applied. Only included,
        user-verified sales contribute to the estimate.
      </p>
      {error && <p role="alert">{error}</p>}
      {lot.comparables.length === 0 ? (
        <p>No comparable observations saved. The manual estimate is used.</p>
      ) : (
        <ol>
          {lot.comparables.map((comparable, index) => (
            <li key={index}>
              <strong>{comparable.title}</strong>
              <p className="evidence-kind">
                {comparable.sold
                  ? comparable.included
                    ? "Sold · used in estimate"
                    : "Sold · excluded from estimate"
                  : "Asking · context only"}
              </p>
              <dl>
                <div>
                  <dt>Price</dt>
                  <dd>{money(comparable.priceCents)}</dd>
                </div>
                <div>
                  <dt>Buyer-paid shipping</dt>
                  <dd>{money(comparable.shippingCents)}</dd>
                </div>
                <div>
                  <dt>{comparable.sold ? "Sale date" : "Observation date"}</dt>
                  <dd>
                    <time dateTime={comparable.soldOn}>
                      {comparable.soldOn}
                    </time>
                  </dd>
                </div>
                <div>
                  <dt>Condition</dt>
                  <dd>{comparable.condition.trim() || "Not provided"}</dd>
                </div>
              </dl>
              <button onClick={() => void open(comparable.url)}>
                Open evidence for comparable {index + 1}{" "}
                <ExternalLink size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ol>
      )}
    </details>
  );
}
