use crate::{model::*, Result};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Deserialize;
use serde_json::Value;

pub(crate) fn revision(connection: &Connection) -> Result<i64> {
    connection
        .query_row("SELECT COALESCE(MAX(id),0) FROM audit_events", [], |row| {
            row.get(0)
        })
        .map_err(|error| error.to_string())
}

fn stage(value: String) -> rusqlite::Result<InventoryStage> {
    serde_json::from_value(Value::String(value)).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(error))
    })
}

pub(crate) fn states(connection: &Connection) -> Result<Vec<LifecycleState>> {
    let mut statement = connection
        .prepare("SELECT inventory_id,stage FROM inventory_lifecycle ORDER BY inventory_id")
        .map_err(|error| error.to_string())?;
    let result = statement
        .query_map([], |row| {
            Ok(LifecycleState {
                inventory_id: row.get(0)?,
                stage: stage(row.get(1)?)?,
            })
        })
        .map_err(|error| error.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|error| error.to_string());
    result
}

pub(crate) fn history(connection: &Connection) -> Result<Vec<StageHistoryEntry>> {
    let mut statement = connection.prepare("SELECT s.audit_id,s.inventory_id,s.from_stage,s.to_stage,a.created_at FROM inventory_stage_events s JOIN audit_events a ON a.id=s.audit_id ORDER BY s.audit_id").map_err(|error| error.to_string())?;
    let result = statement
        .query_map([], |row| {
            Ok(StageHistoryEntry {
                event: StageEvent {
                    audit_id: row.get(0)?,
                    inventory_id: row.get(1)?,
                    from_stage: stage(row.get(2)?)?,
                    to_stage: stage(row.get(3)?)?,
                },
                created_at: row.get(4)?,
            })
        })
        .map_err(|error| error.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|error| error.to_string());
    result
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct StageRequest {
    id: String,
    expected_revision: i64,
    stage: InventoryStage,
}

// Called inside Store's IMMEDIATE transaction. History, current stage and the
// audit revision commit together. A workspace restore also advances this token.
pub(crate) fn set_stage(connection: &Connection, payload: Value, now: &str) -> Result<()> {
    let request: StageRequest =
        serde_json::from_value(payload).map_err(|error| error.to_string())?;
    let existing: Option<(String, Option<String>)> = connection.query_row("SELECT l.stage,i.sold_at FROM inventory_lifecycle l JOIN inventory i ON i.id=l.inventory_id WHERE i.id=?1", [&request.id], |row| Ok((row.get(0)?, row.get(1)?))).optional().map_err(|error| error.to_string())?;
    let (previous, sold_at) = existing.ok_or("Inventory item or its stage no longer exists.")?;
    if sold_at.is_some() {
        return Err(
            "This item is Sold. Its last operational stage and history are read-only.".into(),
        );
    }
    if revision(connection)? != request.expected_revision {
        return Err("Workspace changed since you opened this stage. Keep your draft, then reopen to review the latest item and history.".into());
    }
    if previous == request.stage.as_str() {
        return Err("Choose a different stage before saving.".into());
    }
    connection
        .execute(
            "UPDATE inventory_lifecycle SET stage=?1 WHERE inventory_id=?2",
            params![request.stage.as_str(), request.id],
        )
        .map_err(|error| error.to_string())?;
    connection.execute("INSERT INTO audit_events(action,subject_id,created_at) VALUES('inventory_stage',?1,?2)", params![request.id,now]).map_err(|error| error.to_string())?;
    let audit_id = connection.last_insert_rowid();
    connection.execute("INSERT INTO inventory_stage_events(audit_id,inventory_id,from_stage,to_stage) VALUES(?1,?2,?3,?4)", params![audit_id,request.id,previous,request.stage.as_str()]).map_err(|error| error.to_string())?;
    Ok(())
}

#[cfg(test)]
mod review_tests {
    use super::*;
    use crate::Store;
    use serde_json::json;

    #[test]
    fn failed_commit_rolls_back_before_snapshot_and_retry_in_a_persistent_store() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("commit-failure.db");
        let mut store = Store::open(&path).unwrap();
        let text = include_str!("../tests/fixtures/backup-v1-published-594275a.json");
        store
            .dispatch(
                "restore_backup",
                json!({"text":text,"expectedRevision":0,"confirmReplace":true}),
            )
            .unwrap();
        // A real rollback-journal reader permits BEGIN IMMEDIATE and the writes,
        // but prevents COMMIT from obtaining the exclusive lock it needs.
        store
            .conn
            .pragma_update(None, "journal_mode", "DELETE")
            .unwrap();
        store.conn.busy_timeout(std::time::Duration::ZERO).unwrap();
        let before = store.dispatch("snapshot", Value::Null).unwrap();
        let item = before["inventory"]
            .as_array()
            .unwrap()
            .iter()
            .find(|item| item["soldAt"].is_null())
            .unwrap();
        let payload =
            json!({"id":item["id"],"stage":"testing","expectedRevision":before["revision"]});
        let reader = Connection::open(&path).unwrap();
        reader
            .execute_batch("BEGIN; SELECT COUNT(*) FROM inventory;")
            .unwrap();
        let error = store
            .dispatch("inventory_stage", payload.clone())
            .unwrap_err();
        assert!(error.contains("locked"), "{error}");
        assert!(store.conn.is_autocommit(),"A failed COMMIT must not leave uncommitted stage/history visible in the persistent store");
        assert_eq!(store.dispatch("snapshot", Value::Null).unwrap(), before);
        reader.execute_batch("ROLLBACK").unwrap();
        let saved = store.dispatch("inventory_stage", payload).unwrap();
        assert_eq!(saved["stageHistory"].as_array().unwrap().len(), 1);
        drop(store);
        let reopened = Store::open(&path).unwrap();
        assert_eq!(reopened.snapshot().unwrap().stage_history.len(), 1);
    }
}
