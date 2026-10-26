use crate::model::*;

pub const MAX_MONEY: i64 = 100_000_000;

pub fn money(value: i64) -> Result<(), String> {
    if !(0..=MAX_MONEY).contains(&value) {
        return Err("Money must be between $0 and $1,000,000.".into());
    }
    Ok(())
}
pub fn validate_settings(s: &Settings) -> Result<(), String> {
    for v in [s.capital_cents, s.lot_cap_cents, s.min_profit_cents] {
        money(v)?;
    }
    if !(0..=100_000).contains(&s.min_roi_bps) {
        return Err("ROI target must be between 0% and 1,000%.".into());
    }
    Ok(())
}
pub fn validate_url(value: &str) -> Result<(), String> {
    let url = url::Url::parse(value).map_err(|_| "Enter a full http or https URL.")?;
    if !["http", "https"].contains(&url.scheme())
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("Only http or https URLs without credentials are supported.".into());
    }
    Ok(())
}
pub fn validate_lot(lot: &LotInput) -> Result<(), String> {
    if lot.title.trim().is_empty() || lot.title.len() > 300 {
        return Err("A title of 1–300 characters is required.".into());
    }
    for text in [
        &lot.url,
        &lot.source,
        &lot.category,
        &lot.location,
        &lot.condition,
        &lot.notes,
    ] {
        if text.len() > 10_000 {
            return Err("Text field is too long.".into());
        }
    }
    validate_url(&lot.url)?;
    chrono::DateTime::parse_from_rfc3339(&lot.ends_at)
        .map_err(|_| "A valid auction end date is required.")?;
    let c = &lot.costs;
    for v in [
        lot.bid_cents,
        lot.estimate_cents,
        c.inbound_cents,
        c.travel_cents,
        c.prep_cents,
        c.outbound_cents,
        c.fixed_selling_cents,
    ] {
        money(v)?;
    }
    for v in [
        c.premium_bps,
        c.tax_bps,
        c.payment_bps,
        c.selling_fee_bps,
        c.reserve_bps,
    ] {
        if !(0..=10_000).contains(&v) {
            return Err("Fee rates must be between 0% and 100%.".into());
        }
    }
    if c.selling_fee_bps + c.reserve_bps >= 10_000 {
        return Err("Selling fees plus reserve must be less than 100%.".into());
    }
    if lot.comparables.len() > 100 {
        return Err("A lot supports at most 100 comparables.".into());
    }
    for comp in &lot.comparables {
        validate_url(&comp.url)?;
        money(comp.price_cents)?;
        money(comp.shipping_cents)?;
        let date = chrono::NaiveDate::parse_from_str(&comp.sold_on, "%Y-%m-%d")
            .map_err(|_| "Comparable date must be YYYY-MM-DD.")?;
        if date > chrono::Utc::now().date_naive() {
            return Err("Comparable dates cannot be in the future.".into());
        }
        if comp.title.trim().is_empty() || comp.title.len() > 300 || comp.condition.len() > 1000 {
            return Err("Comparable title and condition are invalid.".into());
        }
    }
    Ok(())
}

// Round each expense up to a cent; integer math throughout, never floating point.
fn fee(cents: i64, bps: i64) -> i64 {
    (cents * bps + 9_999) / 10_000
}

pub fn breakdown(bid: i64, sale: i64, c: &Costs) -> Breakdown {
    let premium = fee(bid, c.premium_bps);
    let tax = fee(bid + premium, c.tax_bps);
    let payment = fee(bid + premium + tax, c.payment_bps);
    let acquisition =
        bid + premium + tax + payment + c.inbound_cents + c.travel_cents + c.prep_cents;
    let selling = fee(sale, c.selling_fee_bps);
    let reserve = fee(sale, c.reserve_bps);
    let total = acquisition + selling + reserve + c.outbound_cents + c.fixed_selling_cents;
    let profit = sale - total;
    Breakdown {
        bid_cents: bid,
        premium_cents: premium,
        tax_cents: tax,
        payment_cents: payment,
        acquisition_cents: acquisition,
        selling_fee_cents: selling,
        reserve_cents: reserve,
        total_cost_cents: total,
        profit_cents: profit,
        roi_bps: if acquisition > 0 {
            Some(profit * 10_000 / acquisition)
        } else {
            None
        },
    }
}

fn qualifies(b: &Breakdown, s: &Settings, available: i64) -> bool {
    b.acquisition_cents <= s.lot_cap_cents.min(available)
        && b.profit_cents >= s.min_profit_cents
        && b.profit_cents * 10_000 >= s.min_roi_bps * b.acquisition_cents
}

pub fn analyze(lot: &LotInput, settings: &Settings, available: i64) -> Result<Analysis, String> {
    validate_lot(lot)?;
    validate_settings(settings)?;
    let mut prices: Vec<i64> = lot
        .comparables
        .iter()
        .filter(|c| c.sold && c.included)
        .map(|c| c.price_cents + c.shipping_cents)
        .collect();
    prices.sort();
    let n = prices.len();
    let sale = if n == 0 {
        lot.estimate_cents
    } else if n.is_multiple_of(2) {
        (prices[n / 2 - 1] + prices[n / 2]) / 2
    } else {
        prices[n / 2]
    };
    // Observed range, not a statistical confidence interval or a sale probability.
    let low = prices.first().copied().unwrap_or(sale * 80 / 100);
    let high = prices.last().copied().unwrap_or(sale * 120 / 100);
    let b = breakdown(lot.bid_cents, sale, &lot.costs);
    let feasible = |bid| qualifies(&breakdown(bid, sale, &lot.costs), settings, available);
    let max_bid = if available <= 0 || !feasible(0) {
        None
    } else {
        let (mut lo, mut hi) = (0, settings.lot_cap_cents.min(available));
        while lo < hi {
            let mid = lo + (hi - lo + 1) / 2;
            if feasible(mid) {
                lo = mid;
            } else {
                hi = mid - 1;
            }
        }
        Some(lo)
    };
    let mut reasons = Vec::new();
    if n == 0 {
        reasons.push("Manual estimate only; add verified sold comparables before acting.".into());
    } else if n < 3 {
        reasons.push("Fewer than three included sales; evidence is limited.".into());
    }
    if b.profit_cents < settings.min_profit_cents {
        reasons.push("Expected profit is below your minimum.".into());
    }
    if b.profit_cents * 10_000 < settings.min_roi_bps * b.acquisition_cents {
        reasons.push("Expected ROI is below your target.".into());
    }
    if b.acquisition_cents > settings.lot_cap_cents {
        reasons.push("Landed cost exceeds the per-lot capital limit.".into());
    }
    if b.acquisition_cents > available {
        reasons.push("Insufficient available capital.".into());
    }
    let meets = max_bid.is_some() && qualifies(&b, settings, available);
    Ok(Analysis {
        sale_cents: sale,
        low_sale_cents: low,
        high_sale_cents: high,
        sold_count: n,
        evidence: if n == 0 {
            "Manual estimate"
        } else if n < 3 {
            "Limited evidence"
        } else {
            "User-reviewed sales"
        }
        .into(),
        max_bid_cents: max_bid,
        meets_targets: meets,
        breakdown: b,
        low_profit_cents: breakdown(lot.bid_cents, low, &lot.costs).profit_cents,
        high_profit_cents: breakdown(lot.bid_cents, high, &lot.costs).profit_cents,
        reasons,
    })
}
