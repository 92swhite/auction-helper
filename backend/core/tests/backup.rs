use auction_core::{backup::MAX_BACKUP_BYTES, Store};
use serde_json::{json, Value};
use std::path::Path;

fn lot(title: &str) -> Value {
    json!({"id":null,"title":title,"url":"https://example.com/lot","source":"Manual","category":"Tools","location":"Coarse test area","endsAt":"2030-01-01T00:00:00Z","condition":"Tested","notes":"Fictional 🦆 café fixture",
        "bidCents":1000,"estimateCents":30000,"costs":{"premiumBps":0,"taxBps":0,"paymentBps":0,"inboundCents":0,"travelCents":0,"prepCents":0,"sellingFeeBps":0,"reserveBps":500,"outboundCents":0,"fixedSellingCents":0},
        "comparables":[{"title":"Comparable","url":"https://example.com/sold","soldOn":"2025-01-01","priceCents":30000,"shippingCents":0,"condition":"Tested","sold":true,"included":true}]})
}

fn add(store: &mut Store, title: &str) -> String {
    let snapshot = store.dispatch("save_lot", lot(title)).unwrap();
    snapshot["lots"]
        .as_array()
        .unwrap()
        .iter()
        .find(|l| l["input"]["title"] == title)
        .unwrap()["input"]["id"]
        .as_str()
        .unwrap()
        .into()
}

fn populated(path: &Path) -> Store {
    let mut store = Store::open(path).unwrap();
    store.dispatch("settings",json!({"capitalCents":200000,"lotCapCents":30000,"minProfitCents":6000,"minRoiBps":4500})).unwrap();
    let sold = add(&mut store, "Sold fixture");
    let held = add(&mut store, "Held fixture");
    let watched = add(&mut store, "Watched fixture");
    store
        .dispatch("watch", json!({"id":watched,"watched":true}))
        .unwrap();
    let snapshot = store
        .dispatch("purchase", json!({"id":sold,"acquisitionCents":10000}))
        .unwrap();
    let item = snapshot["inventory"][0]["id"].as_str().unwrap();
    store
        .dispatch(
            "sell",
            json!({"id":item,"grossCents":20000,"expenseCents":1500}),
        )
        .unwrap();
    store
        .dispatch("purchase", json!({"id":held,"acquisitionCents":5000}))
        .unwrap();
    store
}

fn backup(store: &mut Store) -> Value {
    store.dispatch("backup", Value::Null).unwrap()
}

fn fixture() -> Value {
    let dir = tempfile::tempdir().unwrap();
    backup(&mut populated(&dir.path().join("source.db")))
}

fn preview(store: &mut Store, value: &Value) -> Value {
    store
        .dispatch("validate_backup", json!({"text":value.to_string()}))
        .unwrap()
}

fn restore(store: &mut Store, value: &Value, revision: i64) -> auction_core::Result<Value> {
    store.dispatch(
        "restore_backup",
        json!({"text":value.to_string(),"expectedRevision":revision,"confirmReplace":true}),
    )
}

#[test]
fn full_round_trip_reopens_and_preserves_recoverable_previous_workspace() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("target.db");
    let source = fixture();
    let mut target = Store::open(&path).unwrap();
    add(&mut target, "Previous workspace");
    let prior = backup(&mut target);
    let review = preview(&mut target, &source);
    assert_eq!(review["lotCount"], 3);
    assert_eq!(review["inventoryCount"], 2);
    assert_eq!(review["soldCount"], 1);
    assert_eq!(review["availableCents"], 203500);
    let result = restore(
        &mut target,
        &source,
        review["currentRevision"].as_i64().unwrap(),
    )
    .unwrap();
    assert_eq!(result["snapshot"]["availableCents"], 203500);
    let recovery_path = Path::new(result["recoveryPath"].as_str().unwrap());
    let recovered: Value = serde_json::from_slice(&std::fs::read(recovery_path).unwrap()).unwrap();
    assert_eq!(recovered, prior);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        assert_eq!(
            std::fs::metadata(recovery_path)
                .unwrap()
                .permissions()
                .mode()
                & 0o777,
            0o600
        );
    }
    drop(target);
    let mut reopened = Store::open(&path).unwrap();
    let actual = backup(&mut reopened);
    for key in ["settings", "lots", "inventory"] {
        assert_eq!(actual[key], source[key]);
    }
    let events = actual["auditEvents"].as_array().unwrap();
    let original = source["auditEvents"].as_array().unwrap();
    assert_eq!(&events[..original.len()], original);
    assert_eq!(events.last().unwrap()["action"], "restore_backup");
    assert_eq!(
        result["snapshot"],
        reopened.dispatch("snapshot", Value::Null).unwrap()
    );
    let other = tempfile::tempdir().unwrap();
    let mut recovery_target = Store::open(&other.path().join("recovered.db")).unwrap();
    restore(&mut recovery_target, &recovered, 0).unwrap();
    assert_eq!(
        recovery_target.dispatch("snapshot", Value::Null).unwrap()["lots"][0]["input"]["title"],
        "Previous workspace"
    );
}

#[test]
fn invalid_files_are_rejected_before_any_workspace_or_recovery_write() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = populated(&dir.path().join("target.db"));
    let original = backup(&mut store);
    let source = fixture();
    let mut cases = Vec::new();
    let mut v = source.clone();
    v["formatVersion"] = json!(2);
    cases.push(v);
    let mut v = source.clone();
    v["unexpected"] = json!(true);
    cases.push(v);
    let mut v = source.clone();
    let duplicate = v["lots"][0].clone();
    v["lots"].as_array_mut().unwrap().push(duplicate);
    cases.push(v);
    let mut v = source.clone();
    v["inventory"][0]["lotId"] = json!(uuid::Uuid::new_v4().to_string());
    cases.push(v);
    let mut v = source.clone();
    v["inventory"][1]["id"] = v["inventory"][0]["id"].clone();
    cases.push(v);
    let mut v = source.clone();
    v["inventory"][0]["acquisitionCents"] = json!(-1);
    cases.push(v);
    let mut v = source.clone();
    v["inventory"][0]["saleNetCents"] = json!(99);
    v["inventory"][0]["soldAt"] = Value::Null;
    cases.push(v);
    let mut v = source.clone();
    v["inventory"][0]["saleNetCents"] = json!(i64::MAX);
    v["inventory"][0]["soldAt"] = json!("2031-01-01T00:00:00Z");
    cases.push(v);
    let mut v = source.clone();
    v["lots"][0]["createdAt"] = json!("9999-01-01T00:00:00Z");
    cases.push(v);
    let mut v = source.clone();
    v["lots"][0]["input"]["url"] = json!("file:///etc/passwd");
    cases.push(v);
    let mut v = source.clone();
    v["lots"][0]["input"]["id"] = Value::Null;
    cases.push(v);
    let mut v = source.clone();
    v["auditEvents"][0]["action"] = json!("execute_sql");
    cases.push(v);
    let mut v = source.clone();
    v["auditEvents"][1]["id"] = v["auditEvents"][0]["id"].clone();
    cases.push(v);
    let mut v = source.clone();
    v["auditEvents"][0]["id"] = json!(i64::MAX);
    cases.push(v);
    let mut v = source.clone();
    v["settings"]["capitalCents"] = json!(i64::MAX);
    cases.push(v);
    for value in cases {
        assert!(store
            .dispatch("validate_backup", json!({"text":value.to_string()}))
            .is_err());
        assert!(restore(
            &mut store,
            &value,
            original["auditEvents"].as_array().unwrap().len() as i64
        )
        .is_err());
        assert_eq!(backup(&mut store), original);
    }
    for text in [
        "not json".to_string(),
        " ".repeat(MAX_BACKUP_BYTES + 1),
        source
            .to_string()
            .replacen("\"app\":", "\"app\":\"auction-helper\",\"app\":", 1),
    ] {
        assert!(store
            .dispatch("validate_backup", json!({"text":text}))
            .is_err());
    }
    assert!(!dir.path().join("backups").exists());
}

#[test]
fn confirmation_and_stale_preview_are_enforced_with_monotonic_revision() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("target.db");
    let mut target = Store::open(&path).unwrap();
    let id = add(&mut target, "Current");
    let incoming = fixture();
    let review = preview(&mut target, &incoming);
    assert!(target
        .dispatch(
            "restore_backup",
            json!({"text":incoming.to_string(),"expectedRevision":1,"confirmReplace":false})
        )
        .is_err());
    let mut another = Store::open(&path).unwrap();
    for n in 0..12 {
        another
            .dispatch("watch", json!({"id":id,"watched":n%2==0}))
            .unwrap();
    }
    let changed = backup(&mut target);
    assert!(restore(
        &mut target,
        &incoming,
        review["currentRevision"].as_i64().unwrap()
    )
    .unwrap_err()
    .contains("changed since preview"));
    assert_eq!(backup(&mut target), changed);
    assert!(!dir.path().join("backups").exists());
    let review = preview(&mut target, &incoming);
    let old = review["currentRevision"].as_i64().unwrap();
    restore(&mut target, &incoming, old).unwrap();
    assert!(
        preview(&mut target, &incoming)["currentRevision"]
            .as_i64()
            .unwrap()
            > old
    );
    assert!(restore(&mut target, &incoming, old).is_err());
}

#[test]
fn failed_recovery_creation_preserves_current_database() {
    let dir = tempfile::tempdir().unwrap();
    let mut target = populated(&dir.path().join("target.db"));
    let before = backup(&mut target);
    let incoming = fixture();
    let review = preview(&mut target, &incoming);
    std::fs::write(dir.path().join("backups"), b"Do not overwrite").unwrap();
    assert!(restore(
        &mut target,
        &incoming,
        review["currentRevision"].as_i64().unwrap()
    )
    .is_err());
    assert_eq!(backup(&mut target), before);
    assert_eq!(
        std::fs::read(dir.path().join("backups")).unwrap(),
        b"Do not overwrite"
    );
}

#[test]
fn sql_failure_after_replacement_starts_rolls_back_every_record() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("target.db");
    let mut target = populated(&path);
    let before = backup(&mut target);
    let incoming = fixture();
    let review = preview(&mut target, &incoming);
    let connection = rusqlite::Connection::open(&path).unwrap();
    connection.execute_batch("CREATE TRIGGER fail_restore BEFORE INSERT ON lots BEGIN SELECT RAISE(ABORT,'injected failure'); END;").unwrap();
    assert!(restore(
        &mut target,
        &incoming,
        review["currentRevision"].as_i64().unwrap()
    )
    .unwrap_err()
    .contains("injected failure"));
    assert_eq!(backup(&mut target), before);
    let paths = std::fs::read_dir(dir.path().join("backups"))
        .unwrap()
        .collect::<std::result::Result<Vec<_>, _>>()
        .unwrap();
    assert_eq!(paths.len(), 1);
    let recovery: Value = serde_json::from_slice(&std::fs::read(paths[0].path()).unwrap()).unwrap();
    assert_eq!(recovery, before);
}

#[test]
fn losses_negative_available_capital_and_empty_workspaces_round_trip() {
    let dir = tempfile::tempdir().unwrap();
    let mut source = Store::open(&dir.path().join("source.db")).unwrap();
    let id = add(&mut source, "Loss fixture");
    let snapshot = source
        .dispatch("purchase", json!({"id":id,"acquisitionCents":1000}))
        .unwrap();
    let item = snapshot["inventory"][0]["id"].as_str().unwrap();
    source
        .dispatch(
            "sell",
            json!({"id":item,"grossCents":0,"expenseCents":2000}),
        )
        .unwrap();
    source
        .dispatch(
            "settings",
            json!({"capitalCents":0,"lotCapCents":25000,"minProfitCents":5000,"minRoiBps":4000}),
        )
        .unwrap();
    let saved = backup(&mut source);
    let mut target = Store::open(&dir.path().join("target.db")).unwrap();
    assert_eq!(preview(&mut target, &saved)["availableCents"], -3000);
    assert_eq!(
        restore(&mut target, &saved, 0).unwrap()["snapshot"]["availableCents"],
        -3000
    );
    let mut empty = Store::open(&dir.path().join("empty.db")).unwrap();
    let blank = backup(&mut empty);
    let review = preview(&mut target, &blank);
    let result = restore(
        &mut target,
        &blank,
        review["currentRevision"].as_i64().unwrap(),
    )
    .unwrap();
    assert!(result["snapshot"]["lots"].as_array().unwrap().is_empty());
    assert!(result["snapshot"]["inventory"]
        .as_array()
        .unwrap()
        .is_empty());
    assert_eq!(result["snapshot"]["availableCents"], 100000);
}

#[cfg(unix)]
#[test]
fn recovery_directory_symlinks_are_rejected_without_writing_the_destination() {
    let dir = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    let mut target = populated(&dir.path().join("target.db"));
    let before = backup(&mut target);
    let incoming = fixture();
    let review = preview(&mut target, &incoming);
    std::os::unix::fs::symlink(outside.path(), dir.path().join("backups")).unwrap();
    assert!(restore(
        &mut target,
        &incoming,
        review["currentRevision"].as_i64().unwrap()
    )
    .is_err());
    assert_eq!(backup(&mut target), before);
    assert_eq!(std::fs::read_dir(outside.path()).unwrap().count(), 0);
}
