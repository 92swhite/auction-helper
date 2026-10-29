use auction_core::Store;
use rusqlite::Connection;

fn assert_refused_without_writes(sql: &str) {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("isolated.db");
    let connection = Connection::open(&path).unwrap();
    connection.execute_batch(sql).unwrap();
    drop(connection);
    let before = std::fs::read(&path).unwrap();
    assert!(
        Store::open(&path).is_err(),
        "Startup must refuse an unrecognized database"
    );
    assert_eq!(
        std::fs::read(&path).unwrap(),
        before,
        "Refusal must not rewrite the database"
    );
}

#[test]
fn newer_schema_is_refused_without_resetting_its_version_or_contents() {
    assert_refused_without_writes("CREATE TABLE future_data(value TEXT); INSERT INTO future_data VALUES ('Synthetic future sentinel'); PRAGMA user_version=9;");
}

#[test]
fn nonempty_unversioned_database_is_not_initialized_over_existing_data() {
    assert_refused_without_writes("CREATE TABLE user_notes(value TEXT); INSERT INTO user_notes VALUES ('Synthetic unrelated sentinel');");
    assert_refused_without_writes("CREATE TABLE sqliteXnotes(value TEXT); INSERT INTO sqliteXnotes VALUES ('Synthetic prefix sentinel');");
}

#[test]
fn unrecognized_version_one_schema_is_not_silently_repaired() {
    assert_refused_without_writes("CREATE TABLE user_notes(value TEXT); INSERT INTO user_notes VALUES ('Synthetic mismatched sentinel'); PRAGMA user_version=1;");
}

#[test]
fn version_one_missing_settings_is_not_replaced_with_defaults() {
    assert_refused_without_writes(include_str!("../../../migrations/001_initial.sql"));
}

#[test]
fn version_two_schema_comparison_preserves_case_sensitive_check_literals() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("mismatched-literals.db");
    let connection = Connection::open(&path).unwrap();
    connection
        .execute_batch(include_str!("../../../migrations/001_initial.sql"))
        .unwrap();
    connection
        .execute(
            "INSERT INTO settings VALUES(1,?1)",
            [serde_json::to_string(&auction_core::model::Settings::default()).unwrap()],
        )
        .unwrap();
    let incompatible = include_str!("../../../migrations/002_inventory_lifecycle.sql")
        .replace("'listed'", "'LISTED'");
    connection.execute_batch(&incompatible).unwrap();
    drop(connection);
    let before = std::fs::read(&path).unwrap();
    assert!(
        Store::open(&path).is_err(),
        "Different case-sensitive stage CHECK literals are not the supported schema"
    );
    assert_eq!(std::fs::read(&path).unwrap(), before);
}

#[test]
fn populated_legacy_version_one_reopens_without_reseeding_or_dropping_extra_data() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("legacy.db");
    let connection = Connection::open(&path).unwrap();
    connection
        .execute_batch(include_str!("../../../migrations/001_initial.sql"))
        .unwrap();
    let settings = auction_core::model::Settings {
        capital_cents: 777_777,
        min_profit_cents: 1_234,
        ..Default::default()
    };
    let payload = serde_json::to_string(&settings).unwrap();
    connection
        .execute("INSERT INTO settings VALUES(1,?1)", [&payload])
        .unwrap();
    connection.execute_batch("INSERT INTO audit_events VALUES(7,'settings','criteria','2030-01-01T00:00:00Z'); CREATE TABLE optional_notes(value TEXT); INSERT INTO optional_notes VALUES('Synthetic retained note');").unwrap();
    drop(connection);
    for _ in 0..2 {
        let store = Store::open(&path).unwrap();
        assert_eq!(
            serde_json::to_value(store.snapshot().unwrap().settings).unwrap(),
            serde_json::to_value(&settings).unwrap()
        );
    }
    let connection = Connection::open(&path).unwrap();
    assert_eq!(
        connection
            .pragma_query_value(None, "user_version", |r| r.get::<_, i64>(0))
            .unwrap(),
        2
    );
    assert_eq!(
        connection
            .query_row("SELECT payload FROM settings WHERE id=1", [], |r| r
                .get::<_, String>(0))
            .unwrap(),
        payload
    );
    assert_eq!(
        connection
            .query_row("SELECT COUNT(*) FROM audit_events WHERE id=7", [], |r| r
                .get::<_, i64>(0))
            .unwrap(),
        1
    );
    assert_eq!(
        connection
            .query_row("SELECT value FROM optional_notes", [], |r| r
                .get::<_, String>(0))
            .unwrap(),
        "Synthetic retained note"
    );
}

#[test]
fn concurrent_first_opens_initialize_one_complete_database() {
    use std::sync::{Arc, Barrier};
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("new.db");
    let barrier = Arc::new(Barrier::new(3));
    let workers: Vec<_> = (0..3)
        .map(|_| {
            let path = path.clone();
            let barrier = barrier.clone();
            std::thread::spawn(move || {
                barrier.wait();
                Store::open(&path)
                    .unwrap()
                    .snapshot()
                    .unwrap()
                    .available_cents
            })
        })
        .collect();
    for worker in workers {
        assert_eq!(
            worker.join().unwrap(),
            auction_core::model::Settings::default().capital_cents
        );
    }
    let connection = Connection::open(&path).unwrap();
    assert_eq!(
        connection
            .pragma_query_value(None, "user_version", |r| r.get::<_, i64>(0))
            .unwrap(),
        2
    );
    assert_eq!(
        connection
            .query_row("SELECT COUNT(*) FROM settings", [], |r| r.get::<_, i64>(0))
            .unwrap(),
        1
    );
    assert_eq!(
        connection
            .query_row("PRAGMA integrity_check", [], |r| r.get::<_, String>(0))
            .unwrap(),
        "ok"
    );
}
