import { useState } from "react";
import { Check } from "lucide-react";
import type { Modal } from "../types";
import { Amount } from "./FormControls";

export function TransactionForm({
  modal,
  busy,
  onSave,
}: {
  modal: Exclude<Modal, null | { type: "lot" }>;
  busy: boolean;
  onSave: (p: unknown) => Promise<void>;
}) {
  const [amount, setAmount] = useState(
    modal.type === "purchase"
      ? modal.lot.analysis.breakdown.acquisitionCents
      : 0,
  );
  const [expense, setExpense] = useState(0);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void onSave(
          modal.type === "purchase"
            ? { id: modal.lot.input.id, acquisitionCents: amount }
            : { id: modal.item.id, grossCents: amount, expenseCents: expense },
        );
      }}
    >
      <p className="form-note">
        {modal.type === "purchase"
          ? "Record a purchase you already made. Replace the estimate with your actual total: bid, premium, tax, payment fees, inbound shipping, travel and preparation. This amount reduces available capital."
          : "Enter actual sale proceeds and all selling expenses, including fees, shipping, refunds and additional costs. This closes the item and releases net proceeds to available capital."}
      </p>
      <h3>
        {modal.type === "purchase" ? modal.lot.input.title : modal.item.title}
      </h3>
      <Amount
        label={
          modal.type === "purchase"
            ? "Actual total acquisition cost"
            : "Gross proceeds received"
        }
        value={amount}
        onChange={setAmount}
      />
      {modal.type === "sale" && (
        <Amount
          label="Actual selling expenses"
          value={expense}
          onChange={setExpense}
        />
      )}
      <div className="form-actions">
        <span>Financial record · verify before saving</span>
        <button className="primary" disabled={busy}>
          {busy ? "Saving…" : "Confirm record"} <Check size={16} />
        </button>
      </div>
    </form>
  );
}
