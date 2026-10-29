use auction_core::Store;
use rusqlite::Connection;
use serde_json::{json, Value};
use std::path::Path;

fn purchased(path: &Path) -> (Store, String, String) {
    let mut store = Store::open(path).unwrap();
    let result = store.dispatch("save_lot", json!({
        "id":null,"title":"Inspection fixture","url":"https://example.com/inspection","source":"Manual","category":"Tools","location":"Synthetic area","endsAt":"2030-01-01T00:00:00Z","condition":"Untested","notes":"Original source note","bidCents":1000,"estimateCents":30000,
        "costs":{"premiumBps":0,"taxBps":0,"paymentBps":0,"inboundCents":0,"travelCents":0,"prepCents":0,"sellingFeeBps":0,"reserveBps":0,"outboundCents":0,"fixedSellingCents":0},"comparables":[]
    })).unwrap();
    let lot_id = result["lots"][0]["input"]["id"]
        .as_str()
        .unwrap()
        .to_owned();
    let result = store
        .dispatch("purchase", json!({"id":lot_id,"acquisitionCents":5000}))
        .unwrap();
    let inventory_id = result["inventory"][0]["id"].as_str().unwrap().to_owned();
    (store, lot_id, inventory_id)
}

fn ledger(snapshot: &Value) -> Value {
    json!({"inventory":snapshot["inventory"],"available":snapshot["availableCents"],"invested":snapshot["investedCents"],"realized":snapshot["realizedProfitCents"]})
}

#[test]
fn inventory_notes_preserve_other_lot_edits_ledger_and_version_one_backup_round_trip() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("notes.db");
    let (mut store, lot_id, inventory_id) = purchased(&path);
    let before = store.dispatch("snapshot", Value::Null).unwrap();
    let mut other = Store::open(&path).unwrap();
    let mut latest = before["lots"][0]["input"].clone();
    latest["title"] = json!("Concurrent source title");
    other.dispatch("save_lot", latest).unwrap();
    let saved = store.dispatch("inventory_notes",json!({"id":inventory_id,"expectedNotes":"Original source note","notes":"Battery tested 🦆\nPickup planned."})).unwrap();
    assert_eq!(
        saved["lots"][0]["input"]["title"],
        "Concurrent source title"
    );
    assert_eq!(saved["lots"][0]["input"]["id"], lot_id);
    assert_eq!(ledger(&saved), ledger(&before));
    let backup = store.dispatch("backup", Value::Null).unwrap();
    assert_eq!(backup["formatVersion"], 1);
    assert_eq!(
        backup["auditEvents"].as_array().unwrap().last().unwrap()["action"],
        "save_lot"
    );
    drop(store);
    drop(other);
    let mut reopened = Store::open(&path).unwrap();
    assert_eq!(reopened.dispatch("backup", Value::Null).unwrap(), backup);
    let mut restored = Store::open(&directory.path().join("restored.db")).unwrap();
    let text = serde_json::to_string(&backup).unwrap();
    let preview = restored
        .dispatch("validate_backup", json!({"text":text}))
        .unwrap();
    let result = restored.dispatch("restore_backup",json!({"text":text,"expectedRevision":preview["currentRevision"],"confirmReplace":true})).unwrap();
    assert_eq!(
        result["snapshot"]["lots"][0]["input"]["notes"],
        "Battery tested 🦆\nPickup planned."
    );
    let sold = reopened
        .dispatch(
            "sell",
            json!({"id":inventory_id,"grossCents":9000,"expenseCents":1000}),
        )
        .unwrap();
    let edited = reopened.dispatch("inventory_notes",json!({"id":inventory_id,"expectedNotes":"Battery tested 🦆\nPickup planned.","notes":"Final inspection recorded after sale."})).unwrap();
    assert_eq!(ledger(&edited), ledger(&sold));
}

#[test]
fn stale_invalid_and_missing_inventory_note_requests_leave_data_and_history_unchanged() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("notes.db");
    let (mut store, lot_id, inventory_id) = purchased(&path);
    let mut other = Store::open(&path).unwrap();
    let mut latest = other.dispatch("snapshot", Value::Null).unwrap()["lots"][0]["input"].clone();
    latest["notes"] = json!("Another session's newer note");
    other.dispatch("save_lot", latest).unwrap();
    let before = store.dispatch("backup", Value::Null).unwrap();
    let error=store.dispatch("inventory_notes",json!({"id":inventory_id,"expectedNotes":"Original source note","notes":"Unsaved stale draft"})).unwrap_err();
    assert!(error.contains("changed since you opened"));
    for request in [
        json!({"id":inventory_id,"expectedNotes":"Another session's newer note","notes":"x".repeat(10001)}),
        json!({"id":inventory_id,"expectedNotes":"Another session's newer note","notes":"🦆".repeat(3000)}),
        json!({"id":inventory_id,"expectedNotes":"Another session's newer note","notes":"Attempt","acquisitionCents":1}),
        json!({"id":inventory_id,"notes":"Missing review value"}),
        json!({"id":lot_id,"expectedNotes":"Another session's newer note","notes":"Wrong target type"}),
    ] {
        assert!(store.dispatch("inventory_notes", request).is_err());
        assert_eq!(store.dispatch("backup", Value::Null).unwrap(), before);
    }
}

#[test]
fn failed_audit_write_rolls_back_the_inventory_note_update() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("notes.db");
    let (mut store, _, inventory_id) = purchased(&path);
    let before = store.dispatch("backup", Value::Null).unwrap();
    let connection = Connection::open(&path).unwrap();
    connection.execute_batch("CREATE TRIGGER refuse_note_audit BEFORE INSERT ON audit_events WHEN NEW.action='save_lot' BEGIN SELECT RAISE(ABORT,'Synthetic audit failure'); END;").unwrap();
    assert!(store.dispatch("inventory_notes",json!({"id":inventory_id,"expectedNotes":"Original source note","notes":"Must roll back"})).unwrap_err().contains("Synthetic audit failure"));
    assert_eq!(store.dispatch("backup", Value::Null).unwrap(), before);
}
