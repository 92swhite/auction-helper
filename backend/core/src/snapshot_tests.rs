use super::*;
use rusqlite::ffi;
use serde_json::json;
use std::{
    cell::RefCell,
    ffi::{c_void, CStr},
};

struct ConcurrentWriter {
    store: Store,
    lot: Value,
    result: RefCell<Option<Result<()>>>,
}

// Pause at the actual lot SELECT, after the inventory SELECT has finished.
// The callback is test-only and writes through a separate real SQLite connection.
unsafe extern "C" fn between_reads(
    event: u32,
    context: *mut c_void,
    statement: *mut c_void,
    _sql: *mut c_void,
) -> i32 {
    if event != ffi::SQLITE_TRACE_STMT {
        return 0;
    }
    let writer = unsafe { &mut *context.cast::<ConcurrentWriter>() };
    if writer.result.borrow().is_some() {
        return 0;
    }
    let sql = unsafe { ffi::sqlite3_sql(statement.cast()) };
    if sql.is_null() {
        return 0;
    }
    let sql = unsafe { CStr::from_ptr(sql) }.to_string_lossy();
    if !sql.starts_with("SELECT payload, watched, updated_at FROM lots") {
        return 0;
    }
    let result = (|| {
        writer.store.dispatch(
            "purchase",
            json!({"id":writer.lot["id"],"acquisitionCents":5000}),
        )?;
        writer.lot["notes"] = json!("Committed after purchase");
        writer.store.dispatch("save_lot", writer.lot.clone())?;
        Ok(())
    })();
    *writer.result.borrow_mut() = Some(result);
    0
}

#[test]
fn snapshot_is_one_committed_view_when_a_purchase_lands_between_reads() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("snapshot.db");
    let mut reader = Store::open(&path).unwrap();
    let saved = reader.dispatch("save_lot", json!({
        "id":null,"title":"Concurrent read fixture","url":"https://example.com/snapshot","source":"Manual","category":"Tools","location":"Synthetic area","endsAt":"2030-01-01T00:00:00Z","condition":"Untested","notes":"Before purchase","bidCents":1000,"estimateCents":30000,
        "costs":{"premiumBps":0,"taxBps":0,"paymentBps":0,"inboundCents":0,"travelCents":0,"prepCents":0,"sellingFeeBps":0,"reserveBps":0,"outboundCents":0,"fixedSellingCents":0},"comparables":[]
    })).unwrap();
    let mut writer = ConcurrentWriter {
        store: Store::open(&path).unwrap(),
        lot: saved["lots"][0]["input"].clone(),
        result: RefCell::new(None),
    };
    // The context stays alive until tracing is removed, including on a read error.
    let attached = unsafe {
        ffi::sqlite3_trace_v2(
            reader.conn.handle(),
            ffi::SQLITE_TRACE_STMT,
            Some(between_reads),
            (&mut writer as *mut ConcurrentWriter).cast(),
        )
    };
    assert_eq!(attached, ffi::SQLITE_OK);
    let first = reader.snapshot();
    unsafe {
        ffi::sqlite3_trace_v2(reader.conn.handle(), 0, None, std::ptr::null_mut());
    }
    assert!(writer
        .result
        .borrow()
        .as_ref()
        .expect("Write callback must run")
        .is_ok());
    let first = first.unwrap();
    assert!(first.inventory.is_empty());
    assert_eq!(first.available_cents, 100_000);
    assert!(!first.lots[0].acquired);
    assert_eq!(first.lots[0].input.notes, "Before purchase");
    let next = reader.snapshot().unwrap();
    assert_eq!(next.inventory.len(), 1);
    assert_eq!(next.available_cents, 95_000);
    assert!(next.lots[0].acquired);
    assert_eq!(next.lots[0].input.notes, "Committed after purchase");
    assert!(reader.conn.is_autocommit());
}

#[test]
fn snapshot_preserves_a_callers_transaction_and_releases_its_own_on_error() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("read-errors.db");
    let store = Store::open(&path).unwrap();
    store.conn.execute_batch("BEGIN IMMEDIATE").unwrap();
    store.snapshot().unwrap();
    assert!(!store.conn.is_autocommit());
    store.conn.execute_batch("ROLLBACK").unwrap();
    store.conn.execute("INSERT INTO lots(id,payload,created_at,updated_at) VALUES('fixture','invalid JSON','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')", []).unwrap();
    assert!(store.snapshot().is_err());
    assert!(store.conn.is_autocommit());
    let other = Store::open(&path).unwrap();
    other
        .conn
        .execute_batch("BEGIN IMMEDIATE; ROLLBACK;")
        .unwrap();
}
