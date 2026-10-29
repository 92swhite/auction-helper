use auction_core::Store;
use rusqlite::Connection;
use serde_json::{json, Value};
use std::path::Path;

const V1_SQL: &str = include_str!("fixtures/workspace-v1-published-594275a.sql");
const V1_BACKUP: &str = include_str!("fixtures/backup-v1-published-594275a.json");

fn fixture(path: &Path) -> (Store, Value, String) {
    let mut store = Store::open(path).unwrap();
    let review = store
        .dispatch("validate_backup", json!({"text":V1_BACKUP}))
        .unwrap();
    let snapshot = store.dispatch("restore_backup",json!({"text":V1_BACKUP,"expectedRevision":review["currentRevision"],"confirmReplace":true})).unwrap()["snapshot"].clone();
    let id = snapshot["inventory"]
        .as_array()
        .unwrap()
        .iter()
        .find(|item| item["soldAt"].is_null())
        .unwrap()["id"]
        .as_str()
        .unwrap()
        .to_owned();
    (store, snapshot, id)
}

fn backup(store: &mut Store) -> Value {
    store.dispatch("backup", Value::Null).unwrap()
}
fn stage(
    store: &mut Store,
    id: &str,
    stage: &str,
    revision: &Value,
) -> auction_core::Result<Value> {
    store.dispatch(
        "inventory_stage",
        json!({"id":id,"stage":stage,"expectedRevision":revision}),
    )
}
fn financial(snapshot: &Value) -> Value {
    json!({"inventory":snapshot["inventory"],"settings":snapshot["settings"],"lots":snapshot["lots"],"available":snapshot["availableCents"],"invested":snapshot["investedCents"],"realized":snapshot["realizedProfitCents"]})
}

#[test]
fn upgrade_copies_committed_wal_and_all_user_data_before_preserving_financial_records() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("legacy.db");
    let connection = Connection::open(&path).unwrap();
    connection.execute_batch(V1_SQL).unwrap();
    connection
        .pragma_update(None, "journal_mode", "WAL")
        .unwrap();
    connection
        .pragma_update(None, "wal_autocheckpoint", 0)
        .unwrap();
    connection.execute_batch("CREATE TABLE extra_history(note TEXT); INSERT INTO extra_history VALUES('Only committed in WAL 🦆');").unwrap();
    assert!(
        std::fs::metadata(path.with_extension("db-wal"))
            .unwrap()
            .len()
            > 0
    );
    let mut store = Store::open(&path).unwrap();
    let snapshot = store.dispatch("snapshot", Value::Null).unwrap();
    let recovery = Path::new(snapshot["upgradeRecoveryPath"].as_str().unwrap());
    let saved = Connection::open(recovery).unwrap();
    assert_eq!(
        saved
            .pragma_query_value(None, "user_version", |row| row.get::<_, i64>(0))
            .unwrap(),
        1
    );
    assert_eq!(
        saved
            .query_row("SELECT note FROM extra_history", [], |row| row
                .get::<_, String>(0))
            .unwrap(),
        "Only committed in WAL 🦆"
    );
    assert_eq!(
        saved
            .query_row("PRAGMA integrity_check", [], |row| row.get::<_, String>(0))
            .unwrap(),
        "ok"
    );
    assert_eq!(
        saved
            .query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |row| {
                row.get::<_, i64>(0)
            })
            .unwrap(),
        0
    );
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        assert_eq!(
            std::fs::metadata(recovery).unwrap().permissions().mode() & 0o777,
            0o600
        );
    }
    let actual = backup(&mut store);
    let expected: Value = serde_json::from_str(V1_BACKUP).unwrap();
    for key in ["settings", "lots", "inventory", "auditEvents"] {
        assert_eq!(actual[key], expected[key], "{key}");
    }
    assert!(actual["lifecycle"]
        .as_array()
        .unwrap()
        .iter()
        .all(|state| state["stage"] == "unreviewed"));
    assert_eq!(actual["stageEvents"], json!([]));
    assert_eq!(
        connection
            .pragma_query_value(None, "user_version", |row| row.get::<_, i64>(0))
            .unwrap(),
        2
    );
    drop(store);
    drop(saved);
    drop(connection);
    assert!(Store::open(&path)
        .unwrap()
        .snapshot()
        .unwrap()
        .upgrade_recovery_path
        .is_none());
    assert_eq!(
        std::fs::read_dir(dir.path().join("backups"))
            .unwrap()
            .count(),
        1
    );
}

#[test]
fn recovery_failure_and_failed_migration_leave_v1_usable_and_complete() {
    for collision in [false, true] {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("legacy.db");
        let connection = Connection::open(&path).unwrap();
        connection.execute_batch(V1_SQL).unwrap();
        if collision {
            connection.execute_batch("CREATE TABLE inventory_stage_events(sentinel TEXT); INSERT INTO inventory_stage_events VALUES('Preserved extra user data');").unwrap();
        } else {
            std::fs::write(
                dir.path().join("backups"),
                "Synthetic blocked recovery directory",
            )
            .unwrap();
        }
        drop(connection);
        let before = std::fs::read(&path).unwrap();
        let error = Store::open(&path).err().unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), before);
        let connection = Connection::open(&path).unwrap();
        assert_eq!(
            connection
                .pragma_query_value(None, "user_version", |row| row.get::<_, i64>(0))
                .unwrap(),
            1
        );
        assert_eq!(
            connection
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_schema WHERE name='inventory_lifecycle'",
                    [],
                    |row| row.get::<_, i64>(0)
                )
                .unwrap(),
            0
        );
        if collision {
            assert!(
                error.contains("verified version-one recovery copy kept"),
                "{error}"
            );
            let files: Vec<_> = std::fs::read_dir(dir.path().join("backups"))
                .unwrap()
                .map(|item| item.unwrap().path())
                .collect();
            assert_eq!(files.len(), 1);
            let saved = Connection::open(&files[0]).unwrap();
            assert_eq!(
                saved
                    .query_row("SELECT sentinel FROM inventory_stage_events", [], |row| row
                        .get::<_, String>(0))
                    .unwrap(),
                "Preserved extra user data"
            );
        } else {
            assert!(error.contains("recovery directory"), "{error}");
        }
    }
}

#[test]
fn concurrent_v1_opens_make_one_recovery_and_upgrade_once() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("legacy.db");
    Connection::open(&path)
        .unwrap()
        .execute_batch(V1_SQL)
        .unwrap();
    let barrier = std::sync::Arc::new(std::sync::Barrier::new(2));
    let workers: Vec<_> = (0..2)
        .map(|_| {
            let path = path.clone();
            let barrier = barrier.clone();
            std::thread::spawn(move || {
                barrier.wait();
                Store::open(&path)
                    .unwrap()
                    .snapshot()
                    .unwrap()
                    .inventory
                    .len()
            })
        })
        .collect();
    for worker in workers {
        assert_eq!(worker.join().unwrap(), 2);
    }
    assert_eq!(
        std::fs::read_dir(dir.path().join("backups"))
            .unwrap()
            .count(),
        1
    );
}

#[test]
fn future_wal_schema_is_refused_before_a_writable_open_can_checkpoint_it() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("future.db");
    drop(Store::open(&path).unwrap());
    let connection = Connection::open(&path).unwrap();
    connection
        .pragma_update(None, "wal_autocheckpoint", 0)
        .unwrap();
    connection.execute_batch("CREATE TABLE future_sentinel(value TEXT); INSERT INTO future_sentinel VALUES('Committed future WAL data'); PRAGMA user_version=3;").unwrap();
    let before = std::fs::read(&path).unwrap();
    let wal = std::path::PathBuf::from(format!("{}-wal", path.display()));
    let before_wal = std::fs::read(&wal).unwrap();
    use std::{
        io::Write,
        process::{Command, Stdio},
    };
    let mut child = Command::new(env!("CARGO_BIN_EXE_auction-core"))
        .arg(&path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    child
        .stdin
        .take()
        .unwrap()
        .write_all(b"{\"action\":\"snapshot\"}")
        .unwrap();
    let output = child.wait_with_output().unwrap();
    assert!(!output.status.success());
    assert!(String::from_utf8(output.stdout)
        .unwrap()
        .contains("schema version 3"));
    assert_eq!(
        std::fs::read(&path).unwrap(),
        before,
        "Refusal must not checkpoint future data into the database"
    );
    assert_eq!(
        std::fs::read(&wal).unwrap(),
        before_wal,
        "Refusal must not truncate or rewrite future WAL data"
    );
    assert!(!dir.path().join("backups").exists());
}

#[test]
fn stage_corrections_persist_with_complete_history_and_do_not_change_finances() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("lifecycle.db");
    let (mut store, mut snapshot, id) = fixture(&path);
    let before = financial(&snapshot);
    for value in [
        "needs_pickup",
        "testing",
        "ready_to_list",
        "listed",
        "testing",
        "unreviewed",
    ] {
        snapshot = stage(&mut store, &id, value, &snapshot["revision"]).unwrap();
        assert_eq!(financial(&snapshot), before);
    }
    assert_eq!(snapshot["stageHistory"].as_array().unwrap().len(), 6);
    let exported = backup(&mut store);
    assert_eq!(
        exported["auditEvents"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|entry| entry["action"] == "inventory_stage")
            .count(),
        6
    );
    drop(store);
    let mut reopened = Store::open(&path).unwrap();
    assert_eq!(backup(&mut reopened), exported);
    let mut restored = Store::open(&dir.path().join("restored.db")).unwrap();
    let text = exported.to_string();
    let preview = restored
        .dispatch("validate_backup", json!({"text":text}))
        .unwrap();
    assert_eq!(preview["stagesResetToUnreviewed"], false);
    let result=restored.dispatch("restore_backup",json!({"text":text,"expectedRevision":preview["currentRevision"],"confirmReplace":true})).unwrap();
    assert_eq!(result["snapshot"]["lifecycle"], snapshot["lifecycle"]);
    assert_eq!(result["snapshot"]["stageHistory"], snapshot["stageHistory"]);
    assert_eq!(financial(&result["snapshot"]), before);
}

#[test]
fn new_purchase_begins_unreviewed_and_failed_restore_keeps_complete_stage_history() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("lifecycle.db");
    let (mut store, initial, id) = fixture(&path);
    let listed = stage(&mut store, &id, "listed", &initial["revision"]).unwrap();
    let opportunity = listed["lots"]
        .as_array()
        .unwrap()
        .iter()
        .find(|lot| lot["acquired"] == false)
        .unwrap()["input"]["id"]
        .clone();
    let purchased = store
        .dispatch(
            "purchase",
            json!({"id":opportunity,"acquisitionCents":1000}),
        )
        .unwrap();
    let item = purchased["inventory"]
        .as_array()
        .unwrap()
        .iter()
        .find(|item| item["lotId"] == opportunity)
        .unwrap();
    assert_eq!(
        purchased["lifecycle"]
            .as_array()
            .unwrap()
            .iter()
            .find(|state| state["inventoryId"] == item["id"])
            .unwrap()["stage"],
        "unreviewed"
    );
    let original = backup(&mut store);
    Connection::open(&path).unwrap().execute_batch("CREATE TRIGGER refuse_restore BEFORE INSERT ON audit_events WHEN NEW.action='restore_backup' BEGIN SELECT RAISE(ABORT,'Synthetic restore audit failure'); END;").unwrap();
    let preview = store
        .dispatch("validate_backup", json!({"text":V1_BACKUP}))
        .unwrap();
    let error=store.dispatch("restore_backup",json!({"text":V1_BACKUP,"expectedRevision":preview["currentRevision"],"confirmReplace":true})).unwrap_err();
    assert!(error.contains("Synthetic restore audit failure"));
    assert_eq!(backup(&mut store), original);
    let files: Vec<_> = std::fs::read_dir(dir.path().join("backups"))
        .unwrap()
        .map(|entry| entry.unwrap().path())
        .collect();
    assert!(files.iter().any(|path| serde_json::from_slice::<Value>(
        &std::fs::read(path).unwrap()
    )
    .unwrap()
        == original));
}

#[test]
fn monotonic_review_detects_aba_and_restores_without_overwriting_other_sessions() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("lifecycle.db");
    let (mut first, initial, id) = fixture(&path);
    let mut second = Store::open(&path).unwrap();
    let listed = stage(&mut second, &id, "listed", &initial["revision"]).unwrap();
    stage(&mut second, &id, "unreviewed", &listed["revision"]).unwrap();
    let before = backup(&mut first);
    assert!(stage(&mut first, &id, "testing", &initial["revision"])
        .unwrap_err()
        .contains("changed since"));
    assert_eq!(backup(&mut first), before);
    let current = first.dispatch("snapshot", Value::Null).unwrap();
    let preview = first
        .dispatch("validate_backup", json!({"text":V1_BACKUP}))
        .unwrap();
    let restored=first.dispatch("restore_backup",json!({"text":V1_BACKUP,"expectedRevision":preview["currentRevision"],"confirmReplace":true})).unwrap();
    assert!(
        restored["snapshot"]["revision"].as_i64().unwrap() > current["revision"].as_i64().unwrap()
    );
    assert!(stage(&mut second, &id, "testing", &current["revision"])
        .unwrap_err()
        .contains("changed since"));
}

#[test]
fn sale_freezes_last_stage_and_invalid_requests_cannot_change_history() {
    let dir = tempfile::tempdir().unwrap();
    let (mut store, initial, id) = fixture(&dir.path().join("lifecycle.db"));
    let listed = stage(&mut store, &id, "listed", &initial["revision"]).unwrap();
    let sold = store
        .dispatch(
            "sell",
            json!({"id":id,"grossCents":10000,"expenseCents":1000}),
        )
        .unwrap();
    assert_eq!(sold["lifecycle"], listed["lifecycle"]);
    assert_eq!(sold["stageHistory"], listed["stageHistory"]);
    let before = backup(&mut store);
    assert!(stage(&mut store, &id, "testing", &sold["revision"])
        .unwrap_err()
        .contains("Sold"));
    for request in [
        json!({"id":id,"stage":"unknown","expectedRevision":sold["revision"]}),
        json!({"id":id,"stage":"testing"}),
        json!({"id":id,"stage":"testing","expectedRevision":sold["revision"],"saleNetCents":1}),
        json!({"id":id,"stage":"testing","expectedRevision":0.5}),
    ] {
        assert!(store.dispatch("inventory_stage", request).is_err());
        assert_eq!(backup(&mut store), before);
    }
}

#[test]
fn stage_audit_or_detail_failure_rolls_back_state_and_both_histories() {
    for table in ["audit_events", "inventory_stage_events"] {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("lifecycle.db");
        let (mut store, initial, id) = fixture(&path);
        let before = backup(&mut store);
        let when = if table == "audit_events" {
            "WHEN NEW.action='inventory_stage'"
        } else {
            ""
        };
        Connection::open(&path).unwrap().execute_batch(&format!("CREATE TRIGGER refuse_stage BEFORE INSERT ON {table} {when} BEGIN SELECT RAISE(ABORT,'Synthetic stage write failure'); END;")).unwrap();
        assert!(stage(&mut store, &id, "testing", &initial["revision"])
            .unwrap_err()
            .contains("Synthetic stage write failure"));
        assert_eq!(backup(&mut store), before);
    }
}

#[test]
fn invalid_lifecycle_backups_are_refused_before_recovery_or_data_writes() {
    let dir = tempfile::tempdir().unwrap();
    let (mut store, initial, id) = fixture(&dir.path().join("lifecycle.db"));
    stage(&mut store, &id, "listed", &initial["revision"]).unwrap();
    let original = backup(&mut store);
    let recovery_count = std::fs::read_dir(dir.path().join("backups"))
        .unwrap()
        .count();
    let mut cases = Vec::new();
    let mut v = original.clone();
    v["formatVersion"] = json!(3);
    cases.push(v);
    let mut v = original.clone();
    v.as_object_mut().unwrap().remove("lifecycle");
    cases.push(v);
    let mut v = original.clone();
    v["lifecycle"][0]["stage"] = json!("unknown");
    cases.push(v);
    let mut v = original.clone();
    v["lifecycle"][0]["unrecognized"] = json!(true);
    cases.push(v);
    let mut v = original.clone();
    let duplicate = v["lifecycle"][0].clone();
    v["lifecycle"].as_array_mut().unwrap().push(duplicate);
    cases.push(v);
    let mut v = original.clone();
    v["stageEvents"][0]["fromStage"] = json!("testing");
    cases.push(v);
    let mut v = original.clone();
    v["stageEvents"] = json!([]);
    cases.push(v);
    let mut v: Value = serde_json::from_str(V1_BACKUP).unwrap();
    v["lifecycle"] = Value::Null;
    cases.push(v);
    for value in cases {
        let text = value.to_string();
        assert!(store
            .dispatch("validate_backup", json!({"text":text}))
            .is_err());
        assert!(store.dispatch("restore_backup",json!({"text":text,"expectedRevision":store.snapshot().unwrap().revision,"confirmReplace":true})).is_err());
        assert_eq!(backup(&mut store), original);
        assert_eq!(
            std::fs::read_dir(dir.path().join("backups"))
                .unwrap()
                .count(),
            recovery_count
        );
    }
}

#[test]
fn generated_version_two_fixture_restores_corrections_and_sold_read_only_history() {
    let text = include_str!("fixtures/backup-v2-lifecycle.json");
    let expected: Value = serde_json::from_str(text).unwrap();
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("fixture.db");
    let mut store = Store::open(&path).unwrap();
    let preview = store
        .dispatch("validate_backup", json!({"text":text}))
        .unwrap();
    assert_eq!(preview["sourceFormatVersion"], 2);
    let restored=store.dispatch("restore_backup",json!({"text":text,"expectedRevision":preview["currentRevision"],"confirmReplace":true})).unwrap();
    let actual = backup(&mut store);
    for key in ["settings", "lots", "inventory", "lifecycle", "stageEvents"] {
        assert_eq!(actual[key], expected[key], "{key}");
    }
    let event = &expected["stageEvents"][1];
    assert_eq!(event["fromStage"], "listed");
    assert_eq!(event["toStage"], "testing");
    assert!(stage(
        &mut store,
        event["inventoryId"].as_str().unwrap(),
        "listed",
        &restored["snapshot"]["revision"]
    )
    .unwrap_err()
    .contains("Sold"));
    drop(store);
    assert_eq!(backup(&mut Store::open(&path).unwrap()), actual);
}

#[cfg(unix)]
#[test]
fn upgrade_refuses_recovery_symlink_without_writing_the_destination() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("legacy.db");
    Connection::open(&path)
        .unwrap()
        .execute_batch(V1_SQL)
        .unwrap();
    let destination = tempfile::tempdir().unwrap();
    std::os::unix::fs::symlink(destination.path(), dir.path().join("backups")).unwrap();
    let before = std::fs::read(&path).unwrap();
    assert!(Store::open(&path).err().unwrap().contains("real directory"));
    assert_eq!(std::fs::read(&path).unwrap(), before);
    assert_eq!(std::fs::read_dir(destination.path()).unwrap().count(), 0);
}

#[test]
fn concurrent_stage_and_sale_writers_preserve_sale_precedence_and_audit_order() {
    use std::sync::{Arc, Barrier};
    let mut stage_first = 0;
    let mut sale_first = 0;
    for index in 0..8 {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("race.db");
        let (mut first, initial, id) = fixture(&path);
        let mut second = Store::open(&path).unwrap();
        let stage_id = id.clone();
        let sale_id = id.clone();
        let revision = initial["revision"].clone();
        let gate = Arc::new(Barrier::new(3));
        let stage_gate = gate.clone();
        let sale_gate = gate.clone();
        let stage_writer = std::thread::spawn(move || {
            stage_gate.wait();
            if index % 2 == 0 {
                std::thread::sleep(std::time::Duration::from_millis(2));
            }
            stage(&mut first, &stage_id, "testing", &revision)
        });
        let sale_writer = std::thread::spawn(move || {
            sale_gate.wait();
            if index % 2 == 1 {
                std::thread::sleep(std::time::Duration::from_millis(2));
            }
            second.dispatch(
                "sell",
                json!({"id":sale_id,"grossCents":10000,"expenseCents":1000}),
            )
        });
        gate.wait();
        let stage_result = stage_writer.join().unwrap();
        sale_writer.join().unwrap().unwrap();
        let mut reopened = Store::open(&path).unwrap();
        let actual = backup(&mut reopened);
        let item = actual["inventory"]
            .as_array()
            .unwrap()
            .iter()
            .find(|item| item["id"] == id)
            .unwrap();
        assert_eq!(item["saleNetCents"], 9000);
        assert!(item["soldAt"].is_string());
        if let Err(error) = stage_result {
            sale_first += 1;
            assert!(error.contains("Sold"));
            assert!(actual["stageEvents"].as_array().unwrap().is_empty());
        } else {
            stage_first += 1;
            assert_eq!(actual["stageEvents"].as_array().unwrap().len(), 1);
            let audit = &actual["stageEvents"][0]["auditId"];
            let sale = actual["auditEvents"]
                .as_array()
                .unwrap()
                .iter()
                .find(|event| event["action"] == "sell" && event["subjectId"] == id)
                .unwrap();
            assert!(audit.as_i64().unwrap() < sale["id"].as_i64().unwrap());
        }
        let current = reopened.dispatch("snapshot", Value::Null).unwrap();
        assert!(stage(&mut reopened, &id, "listed", &current["revision"])
            .unwrap_err()
            .contains("Sold"));
        assert_eq!(backup(&mut reopened), actual);
    }
    println!("Observed eight actual two-writer races: stage-first={stage_first}, sale-first={sale_first}. Delays vary launch ordering; they are not response-time criteria.");
}

#[test]
fn malformed_stage_audit_chains_are_refused_without_recovery_or_record_writes() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = Store::open(&dir.path().join("malformed.db")).unwrap();
    let before = backup(&mut store);
    let source: Value =
        serde_json::from_str(include_str!("fixtures/backup-v2-lifecycle.json")).unwrap();
    let mut cases = Vec::new();
    let mut value = source.clone();
    value["stageEvents"][0]["toStage"] = json!("unknown");
    cases.push(value);
    let mut value = source.clone();
    let duplicate = value["stageEvents"][0].clone();
    value["stageEvents"].as_array_mut().unwrap().push(duplicate);
    cases.push(value);
    let mut value = source.clone();
    value["stageEvents"][0]["auditId"] = json!(1);
    cases.push(value);
    let mut value = source.clone();
    value["stageEvents"][0]["inventoryId"] = json!(uuid::Uuid::new_v4().to_string());
    cases.push(value);
    let mut value = source.clone();
    value["stageEvents"][0]["unexpected"] = json!(true);
    cases.push(value);
    let mut value = source.clone();
    value["lifecycle"] = Value::Null;
    cases.push(value);
    let mut value = source.clone();
    let old_id = value["stageEvents"][1]["auditId"].clone();
    value["stageEvents"][1]["auditId"] = json!(1000);
    let audit = value["auditEvents"]
        .as_array_mut()
        .unwrap()
        .iter_mut()
        .find(|event| event["id"] == old_id)
        .unwrap();
    audit["id"] = json!(1000);
    let late = value.clone();
    cases.push(value);
    for value in cases {
        let text = value.to_string();
        assert!(store
            .dispatch("validate_backup", json!({"text":text}))
            .is_err());
        assert!(store
            .dispatch(
                "restore_backup",
                json!({"text":text,"expectedRevision":0,"confirmReplace":true})
            )
            .is_err());
        assert_eq!(backup(&mut store), before);
        assert!(!dir.path().join("backups").exists());
    }
    assert!(store
        .dispatch("validate_backup", json!({"text":late.to_string()}))
        .unwrap_err()
        .contains("after a recorded sale"));
    let duplicate_field = source.to_string().replacen(
        "\"toStage\":\"listed\"",
        "\"toStage\":\"listed\",\"toStage\":\"listed\"",
        1,
    );
    assert_ne!(duplicate_field, source.to_string());
    assert!(store
        .dispatch("validate_backup", json!({"text":duplicate_field}))
        .is_err());
    assert_eq!(backup(&mut store), before);
}
