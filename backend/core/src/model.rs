use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Settings {
    pub capital_cents: i64,
    pub lot_cap_cents: i64,
    pub min_profit_cents: i64,
    pub min_roi_bps: i64,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            capital_cents: 100_000,
            lot_cap_cents: 25_000,
            min_profit_cents: 5_000,
            min_roi_bps: 4_000,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Costs {
    pub premium_bps: i64,
    pub tax_bps: i64,
    pub payment_bps: i64,
    pub inbound_cents: i64,
    pub travel_cents: i64,
    pub prep_cents: i64,
    pub selling_fee_bps: i64,
    pub reserve_bps: i64,
    pub outbound_cents: i64,
    pub fixed_selling_cents: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Comparable {
    pub title: String,
    pub url: String,
    pub sold_on: String,
    pub price_cents: i64,
    pub shipping_cents: i64,
    pub condition: String,
    pub sold: bool,
    pub included: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LotInput {
    pub id: Option<String>,
    pub title: String,
    pub url: String,
    pub source: String,
    pub category: String,
    pub location: String,
    pub ends_at: String,
    pub condition: String,
    pub notes: String,
    pub bid_cents: i64,
    pub estimate_cents: i64,
    pub costs: Costs,
    pub comparables: Vec<Comparable>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Breakdown {
    pub bid_cents: i64,
    pub premium_cents: i64,
    pub tax_cents: i64,
    pub payment_cents: i64,
    pub acquisition_cents: i64,
    pub selling_fee_cents: i64,
    pub reserve_cents: i64,
    pub total_cost_cents: i64,
    pub profit_cents: i64,
    pub roi_bps: Option<i64>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Analysis {
    pub sale_cents: i64,
    pub low_sale_cents: i64,
    pub high_sale_cents: i64,
    pub sold_count: usize,
    pub evidence: String,
    pub max_bid_cents: Option<i64>,
    pub meets_targets: bool,
    pub breakdown: Breakdown,
    pub low_profit_cents: i64,
    pub high_profit_cents: i64,
    pub reasons: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LotView {
    pub input: LotInput,
    pub watched: bool,
    pub updated_at: String,
    pub acquired: bool,
    pub analysis: Analysis,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InventoryItem {
    pub id: String,
    pub lot_id: String,
    pub title: String,
    pub acquisition_cents: i64,
    pub purchased_at: String,
    pub sale_net_cents: Option<i64>,
    pub sold_at: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub settings: Settings,
    pub lots: Vec<LotView>,
    pub inventory: Vec<InventoryItem>,
    pub available_cents: i64,
    pub invested_cents: i64,
    pub realized_profit_cents: i64,
}
