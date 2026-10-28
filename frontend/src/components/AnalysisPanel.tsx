import {
  ArrowUpRight,
  ExternalLink,
  Plus,
  SlidersHorizontal,
} from "lucide-react";
import type { LotView } from "../../../schemas/domain";
import { money } from "../format";
import { ComparableEvidence } from "./ComparableEvidence";

export function Detail({
  lot,
  onEdit,
  onOpen,
  onPurchase,
  busy,
}: {
  lot: LotView;
  onEdit: () => void;
  onOpen: () => void;
  onPurchase: () => void;
  busy: boolean;
}) {
  const a = lot.analysis,
    b = a.breakdown,
    c = lot.input.costs;
  const rows = [
    ["Current bid", b.bidCents],
    ["Buyer’s premium", b.premiumCents],
    ["Sales tax", b.taxCents],
    ["Payment fee", b.paymentCents],
    ["Inbound / removal", c.inboundCents],
    ["Travel + preparation", c.travelCents + c.prepCents],
    ["Selling fees", b.sellingFeeCents + c.fixedSellingCents],
    ["Outbound / insurance", c.outboundCents],
    ["Returns reserve", b.reserveCents],
  ] as const;
  return (
    <aside className="analysis panel">
      <div className="analysis-heading">
        <span className="eyebrow">THE NUMBERS BEHIND THE LOT</span>
        <button
          className="icon-button"
          aria-label="Edit selected auction"
          onClick={onEdit}
        >
          <SlidersHorizontal size={16} />
        </button>
      </div>
      <h2>{lot.input.title}</h2>
      <span className="evidence">
        <span className="amber-dot" />
        {a.evidence} · {a.soldCount} included sales
      </span>
      <ComparableEvidence key={lot.input.id} lot={lot.input} />
      <div className="max-bid">
        <span>Maximum hammer bid</span>
        <strong>
          {a.maxBidCents === null ? "No viable bid" : money(a.maxBidCents)}
        </strong>
        <small>Within your profit, ROI, and capital limits</small>
      </div>
      <div className="analysis-pair">
        <div>
          <small>Expected resale</small>
          <b>{money(a.saleCents)}</b>
        </div>
        <div>
          <small>Expected net profit</small>
          <b className={b.profitCents > 0 ? "positive" : ""}>
            {money(b.profitCents)}
          </b>
        </div>
      </div>
      <div className="cost-title">
        COST BREAKDOWN <span>USD</span>
      </div>
      <dl className="costs">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{money(value)}</dd>
          </div>
        ))}
        <div className="cost-total">
          <dt>Total expected cost</dt>
          <dd>{money(b.totalCostCents)}</dd>
        </div>
      </dl>
      <div className="scenario">
        <span>Profit range</span>
        <b>
          {money(a.lowProfitCents)} — {money(a.highProfitCents)}
        </b>
        <small>
          {a.soldCount
            ? "Using the lowest and highest included sales"
            : "Sensitivity at ±20% of your manual resale estimate"}
        </small>
      </div>
      {a.reasons.length > 0 && (
        <div className="reason">
          {a.reasons.map((r) => (
            <p key={r}>{r}</p>
          ))}
        </div>
      )}
      <button className="primary full" onClick={onOpen}>
        Open auction for manual bidding <ExternalLink size={15} />
      </button>
      <p className="manual-note">
        Opens the source page. No bid is placed by this app.
      </p>
      <button className="full" onClick={onPurchase} disabled={busy}>
        Record purchase <Plus size={15} />
      </button>
      <div className="analysis-bottom">
        <button onClick={onEdit}>
          Edit costs & comparable evidence <ArrowUpRight size={14} />
        </button>
        <small>
          Last entered {new Date(lot.updatedAt).toLocaleString()}
          <br />
          Prices are not refreshed automatically.
        </small>
      </div>
    </aside>
  );
}
