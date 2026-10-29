import { useState } from "react";
import type { InventoryItem, LotView } from "../../../schemas/domain";
import { Field } from "./FormControls";

export function InventoryNotesForm({
  item,
  lot,
  busy,
  onSave,
  onCancel,
}: {
  item: InventoryItem;
  lot: LotView;
  busy: boolean;
  onSave: (payload: {
    id: string;
    expectedNotes: string;
    notes: string;
  }) => void;
  onCancel: () => void;
}) {
  const [notes, setNotes] = useState(lot.input.notes);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy && notes !== lot.input.notes)
          onSave({ id: item.id, expectedNotes: lot.input.notes, notes });
      }}
    >
      <p>
        <strong>{item.title}</strong>
      </p>
      <p className="form-note">
        Keep inspection findings, pickup plans and reminders with this lot.
        Purchase and sale figures stay in the ledger.
      </p>
      <Field label="Inspection & lot notes">
        <textarea
          rows={7}
          maxLength={10000}
          value={notes}
          disabled={busy}
          onChange={(event) => setNotes(event.target.value)}
        />
      </Field>
      <div className="form-actions">
        <button type="button" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
        <button
          className="primary"
          type="submit"
          aria-disabled={busy}
          disabled={notes === lot.input.notes}
        >
          {busy ? "Saving…" : "Save notes"}
        </button>
      </div>
    </form>
  );
}
