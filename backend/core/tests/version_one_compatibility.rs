use auction_core::Store;
use serde_json::{json, Value};

const BACKUP: &str = include_str!("fixtures/backup-v1-published-594275a.json");
const WORKSPACE: &str = include_str!("fixtures/workspace-v1-published-594275a.sql");

fn records_equal(actual: &Value, expected: &Value) {
    for key in ["settings", "lots", "inventory"] {
        assert_eq!(actual[key], expected[key], "{key}");
    }
}

#[test]
fn published_version_one_workspace_reopens_without_changing_existing_records() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("published.db");
    let connection = rusqlite::Connection::open(&path).unwrap();
    connection.execute_batch(WORKSPACE).unwrap();
    drop(connection);
    let expected: Value = serde_json::from_str(BACKUP).unwrap();
    let mut store = Store::open(&path).unwrap();
    assert_eq!(store.dispatch("backup", Value::Null).unwrap(), expected);
    let snapshot = store.dispatch("snapshot", Value::Null).unwrap();
    assert_eq!(snapshot["availableCents"], 184000);
    assert_eq!(snapshot["settings"]["minProfitCents"], 6500);
    assert_eq!(snapshot["inventory"].as_array().unwrap().len(), 2);
    assert_eq!(
        snapshot["lots"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|lot| lot["watched"] == true)
            .count(),
        1
    );
    assert!(snapshot["lots"]
        .as_array()
        .unwrap()
        .iter()
        .all(|lot| lot["input"]["source"] == "Community auction 🦆"));
}

#[test]
fn published_version_one_backup_restores_and_note_edits_keep_its_contract() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("restored.db");
    let expected: Value = serde_json::from_str(BACKUP).unwrap();
    let mut store = Store::open(&path).unwrap();
    let preview = store
        .dispatch("validate_backup", json!({"text": BACKUP}))
        .unwrap();
    assert_eq!(preview["availableCents"], 184000);
    store.dispatch("restore_backup", json!({"text": BACKUP, "expectedRevision":preview["currentRevision"],"confirmReplace":true})).unwrap();
    let restored = store.dispatch("backup", Value::Null).unwrap();
    records_equal(&restored, &expected);
    let original_history = expected["auditEvents"].as_array().unwrap();
    assert_eq!(
        &restored["auditEvents"].as_array().unwrap()[..original_history.len()],
        original_history
    );
    let item = expected["inventory"]
        .as_array()
        .unwrap()
        .iter()
        .find(|item| item["saleNetCents"].is_null())
        .unwrap();
    let lot = expected["lots"]
        .as_array()
        .unwrap()
        .iter()
        .find(|lot| lot["input"]["id"] == item["lotId"])
        .unwrap();
    store.dispatch("inventory_notes", json!({"id":item["id"],"expectedNotes":lot["input"]["notes"],"notes":"Inspected 🦆; pickup remains unverified."})).unwrap();
    let edited = store.dispatch("backup", Value::Null).unwrap();
    assert_eq!(edited["formatVersion"], 1);
    assert_eq!(edited["inventory"], expected["inventory"]);
    assert_eq!(edited["settings"], expected["settings"]);
    assert_eq!(
        edited["auditEvents"].as_array().unwrap().last().unwrap()["action"],
        "save_lot"
    );
    for original in expected["lots"].as_array().unwrap() {
        let actual = edited["lots"]
            .as_array()
            .unwrap()
            .iter()
            .find(|row| row["input"]["id"] == original["input"]["id"])
            .unwrap();
        assert_eq!(
            actual["input"]["comparables"],
            original["input"]["comparables"]
        );
        assert_eq!(actual["watched"], original["watched"]);
    }
    drop(store);
    let mut reopened = Store::open(&path).unwrap();
    assert_eq!(reopened.dispatch("backup", Value::Null).unwrap(), edited);
}
