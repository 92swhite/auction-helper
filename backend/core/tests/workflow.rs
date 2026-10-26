use auction_core::{model::*, valuation::*, Store};
use serde_json::json;

fn lot() -> LotInput {
    serde_json::from_value(json!({
        "id":null,"title":"Test console","url":"https://example.com/lot/1","source":"Manual","category":"Gaming","location":"Denver, CO","endsAt":"2030-01-01T00:00:00Z","condition":"Tested","notes":"", "bidCents":10000,"estimateCents":30000,
        "costs":{"premiumBps":1300,"taxBps":900,"paymentBps":200,"inboundCents":500,"travelCents":1000,"prepCents":500,"sellingFeeBps":1300,"reserveBps":500,"outboundCents":1500,"fixedSellingCents":30},"comparables":[]
    })).unwrap()
}

#[test]
fn hand_calculated_cost_breakdown_and_maximum() {
    let l = lot();
    let a = analyze(&l, &Settings::default(), 100000).unwrap();
    let b = a.breakdown;
    assert_eq!(b.premium_cents, 1300);
    assert_eq!(b.tax_cents, 1017);
    assert_eq!(b.payment_cents, 247); // round 246.34 cents upward
    assert_eq!(b.acquisition_cents, 14564);
    assert_eq!(b.selling_fee_cents, 3900);
    assert_eq!(b.reserve_cents, 1500);
    assert_eq!(b.total_cost_cents, 21494);
    assert_eq!(b.profit_cents, 8506);
    assert_eq!(a.max_bid_cents, Some(11523));
    assert!(a.meets_targets);
}

#[test]
fn maximum_bid_is_feasible_and_one_cent_more_is_not_across_cost_scenarios() {
    let mut l = lot();
    for sale in [0, 5000, 10000, 25000, 50000, 100000] {
        for premium in [0, 1300, 2500, 10000] {
            for capital in [0, 1000, 10000, 100000] {
                for roi in [0, 4000, 10000, 100000] {
                    l.estimate_cents = sale;
                    l.costs.premium_bps = premium;
                    let settings = Settings {
                        min_roi_bps: roi,
                        ..Settings::default()
                    };
                    let a = analyze(&l, &settings, capital).unwrap();
                    let passes = |bid| {
                        let b = breakdown(bid, sale, &l.costs);
                        b.acquisition_cents <= settings.lot_cap_cents.min(capital)
                            && b.profit_cents >= settings.min_profit_cents
                            && b.profit_cents * 10000 >= roi * b.acquisition_cents
                    };
                    if let Some(max) = a.max_bid_cents {
                        assert!(passes(max));
                        assert!(!passes(max + 1));
                    } else {
                        assert!(capital == 0 || !passes(0));
                    }
                }
            }
        }
    }
}

#[test]
fn sold_evidence_uses_median_shipping_and_excludes_asking_and_excluded_prices() {
    let mut l = lot();
    for (price, shipping, sold, included) in [
        (20000, 1000, true, true),
        (30000, 1000, true, true),
        (90000, 0, false, true),
        (100000, 0, true, false),
    ] {
        l.comparables.push(Comparable {
            title: "Console".into(),
            url: "https://example.com/comp".into(),
            sold_on: "2026-01-01".into(),
            price_cents: price,
            shipping_cents: shipping,
            condition: "Used".into(),
            sold,
            included,
        });
    }
    let a = analyze(&l, &Settings::default(), 100000).unwrap();
    assert_eq!(a.sale_cents, 26000);
    assert_eq!(a.sold_count, 2);
    assert_eq!(a.low_sale_cents, 21000);
    assert_eq!(a.high_sale_cents, 31000);
}

#[test]
fn invalid_inputs_are_rejected_and_zero_investment_has_no_roi() {
    let mut l = lot();
    l.costs.selling_fee_bps = 9500;
    assert!(analyze(&l, &Settings::default(), 100000).is_err());
    l = lot();
    l.bid_cents = -1;
    assert!(validate_lot(&l).is_err());
    l = lot();
    l.estimate_cents = MAX_MONEY + 1;
    assert!(validate_lot(&l).is_err());
    assert!(validate_url("javascript:alert(1)").is_err());
    assert!(validate_url("file:///etc/passwd").is_err());
    assert!(validate_url("https://user:password@example.com").is_err());
    l = lot();
    l.costs.inbound_cents = 0;
    l.costs.travel_cents = 0;
    l.costs.prep_cents = 0;
    assert_eq!(breakdown(0, 30000, &l.costs).roi_bps, None);
}

#[test]
fn persistence_purchase_sale_and_duplicate_protection() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("test.db");
    let mut store = Store::open(&path).unwrap();
    let saved = store
        .dispatch("save_lot", serde_json::to_value(lot()).unwrap())
        .unwrap();
    let id = saved["lots"][0]["input"]["id"].as_str().unwrap().to_owned();
    store
        .dispatch("watch", json!({"id":id,"watched":true}))
        .unwrap();
    drop(store);
    let mut store = Store::open(&path).unwrap();
    assert!(store.snapshot().unwrap().lots[0].watched);
    assert!(store
        .dispatch("purchase", json!({"id":id,"acquisitionCents":100001}))
        .is_err());
    assert_eq!(store.snapshot().unwrap().available_cents, 100000);
    let bought = store
        .dispatch("purchase", json!({"id":id,"acquisitionCents":14000}))
        .unwrap();
    assert_eq!(bought["availableCents"], 86000);
    assert_eq!(bought["investedCents"], 14000);
    assert_eq!(bought["lots"][0]["watched"], false);
    assert!(store
        .dispatch("purchase", json!({"id":id,"acquisitionCents":14000}))
        .is_err());
    let item = bought["inventory"][0]["id"].as_str().unwrap();
    let sold = store
        .dispatch(
            "sell",
            json!({"id":item,"grossCents":30000,"expenseCents":5000}),
        )
        .unwrap();
    assert_eq!(sold["availableCents"], 111000);
    assert_eq!(sold["investedCents"], 0);
    assert_eq!(sold["realizedProfitCents"], 11000);
    assert!(store
        .dispatch(
            "sell",
            json!({"id":item,"grossCents":30000,"expenseCents":5000})
        )
        .is_err());
}

#[test]
fn losses_and_invalid_mutations_do_not_corrupt_ledger() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = Store::open(&dir.path().join("test.db")).unwrap();
    let saved = store
        .dispatch("save_lot", serde_json::to_value(lot()).unwrap())
        .unwrap();
    let id = saved["lots"][0]["input"]["id"].as_str().unwrap();
    let bought = store
        .dispatch("purchase", json!({"id":id,"acquisitionCents":20000}))
        .unwrap();
    let item = bought["inventory"][0]["id"].as_str().unwrap();
    let sold = store
        .dispatch(
            "sell",
            json!({"id":item,"grossCents":5000,"expenseCents":6000}),
        )
        .unwrap();
    assert_eq!(sold["availableCents"], 79000);
    assert_eq!(sold["realizedProfitCents"], -21000);
    assert!(store
        .dispatch("watch", json!({"id":"missing","watched":true}))
        .is_err());
    assert!(store
        .dispatch(
            "settings",
            json!({"capitalCents":-1,"lotCapCents":25000,"minProfitCents":5000,"minRoiBps":4000})
        )
        .is_err());
    assert_eq!(store.snapshot().unwrap().settings.capital_cents, 100000);
}

#[test]
fn concurrent_purchases_cannot_overspend_available_capital() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("test.db");
    let mut store = Store::open(&path).unwrap();
    let mut ids = Vec::new();
    for _ in 0..2 {
        store
            .dispatch("save_lot", serde_json::to_value(lot()).unwrap())
            .unwrap();
        ids = store
            .snapshot()
            .unwrap()
            .lots
            .iter()
            .map(|l| l.input.id.clone().unwrap())
            .collect();
    }
    let barrier = std::sync::Arc::new(std::sync::Barrier::new(2));
    let threads: Vec<_> = ids
        .into_iter()
        .map(|id| {
            let path = path.clone();
            let barrier = barrier.clone();
            std::thread::spawn(move || {
                let mut store = Store::open(&path).unwrap();
                barrier.wait();
                store
                    .dispatch("purchase", json!({"id":id,"acquisitionCents":60000}))
                    .is_ok()
            })
        })
        .collect();
    let successes = threads
        .into_iter()
        .filter_map(|t| t.join().ok())
        .filter(|ok| *ok)
        .count();
    assert_eq!(successes, 1);
    assert_eq!(store.snapshot().unwrap().available_cents, 40000);
}
