# Financial model, v0.1

All amounts are integer USD cents. Rates are integer basis points (100 bps = 1%). Each percentage expense is rounded **up** to the next cent. All amounts and rates are validated before calculation. A money field is capped at $1,000,000; rates are bounded to keep intermediate integer products within i64 limits.

For hammer bid `B`, resale proceeds `S`, and rate function `fee(x,r) = ceil(x*r/10000)`:

```text
premium    = fee(B, premium_bps)
tax        = fee(B + premium, tax_bps)
payment    = fee(B + premium + tax, payment_bps)
landed     = B + premium + tax + payment + inbound/removal + travel + prep
selling    = fee(S, selling_fee_bps) + fixed_selling + outbound/insurance
reserve    = fee(S, reserve_bps)
profit     = S - landed - selling - reserve
ROI        = profit / landed
```

ROI is undefined at zero landed cost and displayed as a dash. Internally, the ROI constraint uses integer cross multiplication, avoiding division and display rounding. Travel, preparation and labor estimates are treated as capital costs for conservative selection. If labor is only an opportunity cost, the user should account for that distinction when recording actual purchase costs.

## Bid ceiling

Find the greatest integer-cent hammer bid satisfying all of:

```text
landed <= per_lot_cap
landed <= available_capital
profit >= minimum_profit
profit * 10000 >= minimum_roi_bps * landed
```

Binary search evaluates the rounded expense model directly. Expenses increase monotonically with bid for the supported nonnegative rates, so the feasible set is contiguous. `null` means no feasible bid; a feasible zero-dollar ceiling is represented as zero, not confused with null. No capital produces no viable bid. Tests check that a returned maximum passes and one cent above it fails across 384 combinations of sale value, premium, available capital and ROI target.

The current hammer price is an observation, not a bid increment or guaranteed winning price. A maximum does not account for a source's next bid increment, competition or a late price change. It is a financial ceiling, conditional on the entered inputs; it is not an instruction to bid.

## Evidence and scenarios

- Included, user-verified sold comparables contribute `sale_price + buyer_paid_shipping` to the median. An even-sized median rounds down to a cent.
- New comparable forms start as Asking and require the user's deliberate Sold selection before contributing. Existing observations keep their stored classification.
- Active asking prices and excluded observations never affect the estimate. No automatic verification, condition normalization, recency weighting, matching or outlier filtering is claimed.
- Without eligible sales, the user's manual estimate is used and explicitly labeled.
- The profit range uses the lowest/highest included sale. Without sales, it uses ±20% of the manual estimate. This is a sensitivity range, not a statistical confidence interval.
- Comparable dates cannot be in the future. Old evidence is retained; its relevance is the user's responsibility in this milestone.
- Marketplace fee and reserve percentages apply to total proceeds, including shipping paid by the buyer. Sales tax collected by a marketplace is not modeled as seller revenue. Complex marketplace tax-inclusive fee bases, tiers and minimum fees are not modeled automatically; the user must account for them in assumptions.

## Capital accounting

```text
invested        = acquisition costs of unsold inventory
realized_profit = sum(net sale proceeds - acquisition cost) for sold inventory
available       = starting_capital + realized_profit - invested
net proceeds    = actual gross sale proceeds - actual selling expenses
```

Watching does not reserve capital. Each recommendation is evaluated independently against the current available balance; a set of individually affordable lots is not necessarily affordable together. Purchase transactions acquire a SQLite immediate write lock before checking the balance. Only one purchase per lot is permitted. Sale records are accepted once per inventory item, including loss-making sales and expenses larger than proceeds.

Actual purchases above a recommendation's per-lot cap may be recorded because bookkeeping must represent reality, but purchases cannot overdraw the available balance. Initial capital can be adjusted if funds were added. Acquisition costs are fixed when recorded and do not change if the analysis inputs are later edited. Income tax and unsold-inventory market value are not included in realized profit.

## Known follow-up work

Correction/reversal entries, returns, added expenses, inventory split lots, tax-base options and dated marketplace fee templates need explicit ledger design before implementation. Until then, record complete actual acquisition and selling costs, and keep independent records for corrections.
