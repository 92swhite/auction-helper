import { useState, type FormEvent } from "react";
import { ArrowRight, Plus, X } from "lucide-react";
import type { Comparable, Costs, LotInput } from "../../../schemas/domain";
import { Field, Amount } from "./FormControls";

export function LotForm({
  initial,
  busy,
  onSave,
}: {
  initial: LotInput;
  busy: boolean;
  onSave: (l: LotInput) => Promise<void>;
}) {
  const [lot, setLot] = useState<LotInput>(structuredClone(initial));
  const [tab, setTab] = useState("Auction details");
  const set = <K extends keyof LotInput>(key: K, value: LotInput[K]) =>
    setLot((l) => ({ ...l, [key]: value }));
  const cost = (key: keyof Costs, value: number) =>
    setLot((l) => ({ ...l, costs: { ...l.costs, [key]: value } }));
  function comp(
    index: number,
    key: keyof Comparable,
    value: string | number | boolean,
  ) {
    setLot((l) => ({
      ...l,
      comparables: l.comparables.map((c, i) =>
        i === index ? { ...c, [key]: value } : c,
      ),
    }));
  }
  const localDate = new Date(
    Date.parse(lot.endsAt) - new Date(lot.endsAt).getTimezoneOffset() * 60000,
  )
    .toISOString()
    .slice(0, 16);
  const costFields: [keyof Costs, string, boolean][] = [
    ["premiumBps", "Buyer’s premium", true],
    ["taxBps", "Sales tax", true],
    ["paymentBps", "Payment surcharge", true],
    ["inboundCents", "Inbound shipping / removal", false],
    ["travelCents", "Round-trip travel", false],
    ["prepCents", "Cleaning / repair / labor", false],
    ["sellingFeeBps", "Marketplace fee", true],
    ["reserveBps", "Returns reserve", true],
    ["outboundCents", "Outbound shipping / insurance", false],
    ["fixedSellingCents", "Other selling fees", false],
  ];
  function submit(e: FormEvent) {
    e.preventDefault();
    void onSave(lot);
  }
  return (
    <form
      onSubmit={submit}
      onInvalid={(e) => {
        const section = (e.target as HTMLElement).closest<HTMLElement>(
          "[data-form-tab]",
        );
        if (section?.dataset.formTab) setTab(section.dataset.formTab);
      }}
    >
      <div className="tabs form-tabs">
        {["Auction details", "Costs & assumptions", "Comparable evidence"].map(
          (t) => (
            <button
              type="button"
              className={tab === t ? "selected" : ""}
              key={t}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ),
        )}
      </div>
      <div data-form-tab="Auction details" hidden={tab !== "Auction details"}>
        <p className="form-note">
          Paste the source URL and enter the lot details. Pages are not fetched
          automatically.
        </p>
        <div className="form-grid">
          <div className="wide">
            <Field label="Auction title">
              <input
                required
                maxLength={300}
                value={lot.title}
                onChange={(e) => set("title", e.target.value)}
              />
            </Field>
          </div>
          <div className="wide">
            <Field label="Source URL">
              <input
                type="url"
                required
                placeholder="https://…"
                value={lot.url}
                onChange={(e) => set("url", e.target.value)}
              />
            </Field>
          </div>
          <Field label="Source">
            <select
              value={lot.source}
              onChange={(e) => set("source", e.target.value)}
            >
              {[
                "Manual",
                "Dickensheet",
                "PublicSurplus",
                "GovDeals",
                "HiBid",
                "Other",
                ...(lot.source.startsWith("Demo") ? [lot.source] : []),
              ].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Category">
            <select
              value={lot.category}
              onChange={(e) => set("category", e.target.value)}
            >
              {[
                "Electronics",
                "Tools",
                "Gaming",
                "Collectibles",
                "Furniture",
                "Other",
              ].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Pickup location">
            <input
              value={lot.location}
              onChange={(e) => set("location", e.target.value)}
            />
          </Field>
          <Field label="Ends at (your local time)">
            <input
              type="datetime-local"
              required
              value={localDate}
              onChange={(e) => {
                if (e.target.value)
                  set("endsAt", new Date(e.target.value).toISOString());
              }}
            />
          </Field>
          <Amount
            label="Current hammer bid"
            value={lot.bidCents}
            onChange={(v) => set("bidCents", v)}
          />
          <Amount
            label="Manual resale estimate"
            value={lot.estimateCents}
            onChange={(v) => set("estimateCents", v)}
          />
          <div className="wide">
            <Field label="Condition / testing status">
              <input
                value={lot.condition}
                onChange={(e) => set("condition", e.target.value)}
              />
            </Field>
          </div>
          <div className="wide">
            <Field label="Notes, pickup terms & risks">
              <textarea
                rows={3}
                value={lot.notes}
                onChange={(e) => set("notes", e.target.value)}
              />
            </Field>
          </div>
        </div>
      </div>
      <div
        data-form-tab="Costs & assumptions"
        hidden={tab !== "Costs & assumptions"}
      >
        <p className="form-note">
          Verify fees against this lot’s terms. Rates start at zero except an
          illustrative 5% returns reserve. Tax applies to bid + premium; payment
          surcharge applies after tax. Travel and prep count toward invested
          capital.
        </p>
        <div className="form-grid">
          {costFields.map(([key, label, rate]) => (
            <Amount
              key={key}
              label={label}
              rate={rate}
              value={lot.costs[key]}
              onChange={(v) => cost(key, v)}
            />
          ))}
        </div>
        <p className="form-note">
          Marketplace fees and reserve apply to total resale proceeds, including
          buyer-paid shipping. Avoid counting payment fees twice.
        </p>
      </div>
      <div
        data-form-tab="Comparable evidence"
        hidden={tab !== "Comparable evidence"}
      >
        <p className="form-note">
          Only sales marked “Sold” and “Include” determine resale value. The
          model uses their median price + shipping. Verify model, condition,
          sale date and final price; active listings are retained as context
          only.
        </p>
        {lot.comparables.map((c, i) => (
          <div className="comp-card" key={i}>
            <div className="comp-heading">
              <b>Comparable {i + 1}</b>
              <button
                type="button"
                aria-label={`Remove comparable ${i + 1}`}
                onClick={() =>
                  set(
                    "comparables",
                    lot.comparables.filter((_, n) => n !== i),
                  )
                }
              >
                <X size={15} />
              </button>
            </div>
            <div className="form-grid">
              <Field label="Comparable title">
                <input
                  required
                  value={c.title}
                  onChange={(e) => comp(i, "title", e.target.value)}
                />
              </Field>
              <Field label="Evidence URL">
                <input
                  type="url"
                  required
                  value={c.url}
                  onChange={(e) => comp(i, "url", e.target.value)}
                />
              </Field>
              <Amount
                label="Sale / asking price"
                value={c.priceCents}
                onChange={(v) => comp(i, "priceCents", v)}
              />
              <Amount
                label="Buyer-paid shipping"
                value={c.shippingCents}
                onChange={(v) => comp(i, "shippingCents", v)}
              />
              <Field label="Sale / observation date">
                <input
                  type="date"
                  required
                  max={new Date().toISOString().slice(0, 10)}
                  value={c.soldOn}
                  onChange={(e) => comp(i, "soldOn", e.target.value)}
                />
              </Field>
              <Field label="Condition">
                <input
                  value={c.condition}
                  onChange={(e) => comp(i, "condition", e.target.value)}
                />
              </Field>
            </div>
            <div className="checks">
              <label>
                <input
                  type="checkbox"
                  checked={c.sold}
                  onChange={(e) => comp(i, "sold", e.target.checked)}
                />{" "}
                Sold (verified by me)
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={c.included}
                  onChange={(e) => comp(i, "included", e.target.checked)}
                />{" "}
                Include in valuation
              </label>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            set("comparables", [
              ...lot.comparables,
              {
                title: "",
                url: "",
                soldOn: new Date().toISOString().slice(0, 10),
                priceCents: 0,
                shippingCents: 0,
                condition: "",
                sold: true,
                included: true,
              },
            ])
          }
        >
          <Plus size={16} /> Add comparable
        </button>
      </div>
      <div className="form-actions">
        <span>Saved locally · no bid is placed</span>
        <button type="submit" className="primary" disabled={busy}>
          {busy ? "Saving…" : "Save & analyze"} <ArrowRight size={16} />
        </button>
      </div>
    </form>
  );
}
