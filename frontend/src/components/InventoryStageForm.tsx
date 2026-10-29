import { useState } from "react";
import type {
  InventoryStage,
  StageHistoryEntry,
} from "../../../schemas/domain";
import { Field } from "./FormControls";

export const stageLabels: Record<InventoryStage, string> = {
  unreviewed: "Unreviewed",
  needs_pickup: "Needs pickup",
  testing: "Testing",
  ready_to_list: "Ready to list",
  listed: "Listed",
};

export function InventoryStageForm({
  title,
  initial,
  sold,
  history,
  busy,
  onSave,
  onCancel,
}: {
  title: string;
  initial: InventoryStage;
  sold: boolean;
  history: StageHistoryEntry[];
  busy: boolean;
  onSave: (stage: InventoryStage) => void;
  onCancel: () => void;
}) {
  const [stage, setStage] = useState(initial);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy && !sold && stage !== initial) onSave(stage);
      }}
    >
      <p>
        <strong>{title}</strong>
      </p>
      <p className="form-note">
        Record your own progress. You can correct a stage in either direction;
        every saved change stays in its history. Stage changes do not publish a
        listing or change your recorded finances.
      </p>
      {sold ? (
        <p className="form-note" role="status">
          This item is Sold. Its last operational stage and history are
          read-only.
        </p>
      ) : (
        <Field label="Operational stage">
          <select
            value={stage}
            disabled={busy}
            onChange={(event) => setStage(event.target.value as InventoryStage)}
          >
            {Object.entries(stageLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      )}
      <section className="stage-history" aria-label="Stage history">
        <h3>Stage history</h3>
        {history.length === 0 ? (
          <p className="form-note">
            No stage changes recorded. This item began Unreviewed.
          </p>
        ) : (
          <ol>
            {[...history].reverse().map((entry) => (
              <li key={entry.auditId}>
                <strong>
                  {stageLabels[entry.fromStage]} → {stageLabels[entry.toStage]}
                </strong>
                <small>{new Date(entry.createdAt).toLocaleString()}</small>
              </li>
            ))}
          </ol>
        )}
      </section>
      <div className="form-actions">
        <button type="button" disabled={busy} onClick={onCancel}>
          {sold ? "Close" : "Cancel"}
        </button>
        {!sold && (
          <button
            className="primary"
            type="submit"
            aria-disabled={busy}
            disabled={stage === initial}
          >
            {busy ? "Saving…" : "Save stage"}
          </button>
        )}
      </div>
    </form>
  );
}
