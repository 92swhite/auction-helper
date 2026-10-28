import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { openExternal } from "../api";
import { sources } from "../sources";

export function SourceRegistry() {
  const [error, setError] = useState("");
  async function openReference(url: string) {
    setError("");
    try {
      await openExternal(url);
    } catch {
      setError(
        "The reference could not be opened. Try again from this source's details.",
      );
    }
  }
  return (
    <section aria-labelledby="source-capabilities-title">
      <h3 id="source-capabilities-title">Source capabilities</h3>
      <p className="form-note">
        All sources use manual entry. Automatic discovery, price refresh,
        notifications, bidding and publishing are unavailable. Expand a source
        for its workflow and access review.
      </p>
      {error && <p role="alert">{error}</p>}
      <div className="source-registry">
        {sources.map((source) => (
          <details key={source.id}>
            <summary>
              <span>{source.name}</span>
              <span className="badge muted">Manual entry</span>
            </summary>
            <div className="source-details">
              <p>{source.workflow}</p>
              <p>{source.accessReview}</p>
              <p className="form-note">
                {source.checkedOn ? (
                  <>
                    Documentation checked{" "}
                    <time dateTime={source.checkedOn}>{source.checkedOn}</time>.
                    Recheck before any integration.
                  </>
                ) : (
                  "Provider documentation not reviewed."
                )}
              </p>
              {source.references.map((reference) => (
                <button
                  className="source-reference"
                  key={reference.url}
                  onClick={() => void openReference(reference.url)}
                >
                  {reference.title}{" "}
                  <ExternalLink size={14} aria-hidden="true" />
                </button>
              ))}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
