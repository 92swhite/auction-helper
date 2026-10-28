pub mod backup;
mod migrations;
pub mod model;
pub mod valuation;

use chrono::Utc;
use model::*;
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::Value;
use std::path::{Path, PathBuf};
use valuation::*;

pub type Result<T> = std::result::Result<T, String>;

pub struct Store {
    conn: Connection,
    path: PathBuf,
}

impl Store {
    pub fn open(path: &Path) -> Result<Self> {
        if let Some(parent) = path.parent().filter(|p| !p.as_os_str().is_empty()) {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut conn = Connection::open(path).map_err(|e| e.to_string())?;
        conn.busy_timeout(std::time::Duration::from_secs(5))
            .map_err(|e| e.to_string())?;
        migrations::initialize(&mut conn)?;
        conn.pragma_update(None, "journal_mode", "WAL")
            .map_err(|e| e.to_string())?;
        Ok(Self {
            conn,
            path: path.to_path_buf(),
        })
    }

    pub fn snapshot(&self) -> Result<Snapshot> {
        let raw: String = self
            .conn
            .query_row("SELECT payload FROM settings WHERE id=1", [], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        let settings: Settings = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
        let mut stmt = self.conn.prepare("SELECT id, lot_id, title, acquisition_cents, purchased_at, sale_net_cents, sold_at FROM inventory ORDER BY purchased_at DESC, id").map_err(|e| e.to_string())?;
        let inventory = stmt
            .query_map([], |r| {
                Ok(InventoryItem {
                    id: r.get(0)?,
                    lot_id: r.get(1)?,
                    title: r.get(2)?,
                    acquisition_cents: r.get(3)?,
                    purchased_at: r.get(4)?,
                    sale_net_cents: r.get(5)?,
                    sold_at: r.get(6)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        let invested: i64 = inventory
            .iter()
            .filter(|i| i.sale_net_cents.is_none())
            .map(|i| i.acquisition_cents)
            .sum();
        let realized: i64 = inventory
            .iter()
            .filter_map(|i| i.sale_net_cents.map(|net| net - i.acquisition_cents))
            .sum();
        let available = settings.capital_cents + realized - invested;
        let mut stmt = self
            .conn
            .prepare("SELECT payload, watched, updated_at FROM lots ORDER BY created_at DESC, id")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, bool>(1)?,
                    r.get::<_, String>(2)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        let mut lots = Vec::new();
        for row in rows {
            let (raw, watched, updated_at) = row.map_err(|e| e.to_string())?;
            let input: LotInput = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
            let acquired = inventory
                .iter()
                .any(|i| Some(&i.lot_id) == input.id.as_ref());
            let analysis = analyze(&input, &settings, available.max(0))?;
            lots.push(LotView {
                input,
                watched,
                updated_at,
                acquired,
                analysis,
            });
        }
        Ok(Snapshot {
            settings,
            lots,
            inventory,
            available_cents: available,
            invested_cents: invested,
            realized_profit_cents: realized,
        })
    }

    // Every mutation and its audit record commit atomically. IMMEDIATE prevents
    // concurrent purchases from spending the same available capital.
    pub fn dispatch(&mut self, action: &str, payload: Value) -> Result<Value> {
        match action {
            "backup" => {
                return serde_json::to_value(self.create_backup()?).map_err(|e| e.to_string())
            }
            "validate_backup" => return self.preview_backup(payload),
            "restore_backup" => return self.restore_backup(payload),
            _ => {}
        }
        if action == "snapshot" {
            return serde_json::to_value(self.snapshot()?).map_err(|e| e.to_string());
        }
        if action == "analyze" {
            let lot: LotInput = serde_json::from_value(payload).map_err(|e| e.to_string())?;
            let snap = self.snapshot()?;
            return serde_json::to_value(analyze(
                &lot,
                &snap.settings,
                snap.available_cents.max(0),
            )?)
            .map_err(|e| e.to_string());
        }
        self.conn
            .execute_batch("BEGIN IMMEDIATE")
            .map_err(|e| e.to_string())?;
        let result = self.mutate(action, payload);
        match result {
            Ok(()) => {
                self.conn
                    .execute_batch("COMMIT")
                    .map_err(|e| e.to_string())?;
                serde_json::to_value(self.snapshot()?).map_err(|e| e.to_string())
            }
            Err(err) => {
                let _ = self.conn.execute_batch("ROLLBACK");
                Err(err)
            }
        }
    }

    fn mutate(&self, action: &str, payload: Value) -> Result<()> {
        let now = Utc::now().to_rfc3339();
        let id = payload
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let subject: String;
        match action {
            "save_lot" => {
                let mut lot: LotInput =
                    serde_json::from_value(payload).map_err(|e| e.to_string())?;
                validate_lot(&lot)?;
                if let Some(id) = &lot.id {
                    if !self.exists("lots", id)? {
                        return Err("Lot no longer exists.".into());
                    }
                }
                subject = lot
                    .id
                    .clone()
                    .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
                lot.id = Some(subject.clone());
                self.conn.execute("INSERT INTO lots(id,payload,created_at,updated_at) VALUES(?1,?2,?3,?3) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at", params![subject, serde_json::to_string(&lot).map_err(|e| e.to_string())?, now]).map_err(|e| e.to_string())?;
            }
            "watch" => {
                let watched = payload
                    .get("watched")
                    .and_then(Value::as_bool)
                    .ok_or("Missing watch state.")?;
                if self
                    .conn
                    .execute(
                        "UPDATE lots SET watched=?1 WHERE id=?2",
                        params![watched, id],
                    )
                    .map_err(|e| e.to_string())?
                    == 0
                {
                    return Err("Lot not found.".into());
                }
                subject = id.into();
            }
            "settings" => {
                let settings: Settings =
                    serde_json::from_value(payload).map_err(|e| e.to_string())?;
                validate_settings(&settings)?;
                self.conn
                    .execute(
                        "UPDATE settings SET payload=?1 WHERE id=1",
                        [serde_json::to_string(&settings).unwrap()],
                    )
                    .map_err(|e| e.to_string())?;
                subject = "settings".into();
            }
            "purchase" => {
                let cost = payload
                    .get("acquisitionCents")
                    .and_then(Value::as_i64)
                    .ok_or("Enter the total actual acquisition cost.")?;
                money(cost)?;
                if cost == 0 {
                    return Err("Purchase cost must be positive.".into());
                }
                let snap = self.snapshot()?;
                if cost > snap.available_cents {
                    return Err("Purchase exceeds available capital. Update capital or correct the cost first.".into());
                }
                let lot = snap
                    .lots
                    .iter()
                    .find(|l| l.input.id.as_deref() == Some(id))
                    .ok_or("Lot not found.")?;
                if lot.acquired {
                    return Err("This lot is already in inventory.".into());
                }
                subject = uuid::Uuid::new_v4().to_string();
                // Recording an actual purchase is allowed above the recommendation cap.
                self.conn.execute("INSERT INTO inventory(id,lot_id,title,acquisition_cents,purchased_at) VALUES(?1,?2,?3,?4,?5)", params![subject,id,lot.input.title,cost,now]).map_err(|e| e.to_string())?;
                self.conn
                    .execute("UPDATE lots SET watched=0 WHERE id=?1", [id])
                    .map_err(|e| e.to_string())?;
            }
            "sell" => {
                let gross = payload
                    .get("grossCents")
                    .and_then(Value::as_i64)
                    .ok_or("Enter sale proceeds.")?;
                let expense = payload
                    .get("expenseCents")
                    .and_then(Value::as_i64)
                    .ok_or("Enter actual selling expenses.")?;
                money(gross)?;
                money(expense)?;
                if self.conn.execute("UPDATE inventory SET sale_net_cents=?1,sold_at=?2 WHERE id=?3 AND sold_at IS NULL", params![gross-expense, now, id]).map_err(|e| e.to_string())? == 0 { return Err("Inventory item is missing or already sold.".into()); }
                subject = id.into();
            }
            _ => return Err("Unknown action.".into()),
        }
        self.conn
            .execute(
                "INSERT INTO audit_events(action,subject_id,created_at) VALUES(?1,?2,?3)",
                params![action, subject, now],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    fn exists(&self, table: &str, id: &str) -> Result<bool> {
        // Table is an internal constant, never request input.
        self.conn
            .query_row(&format!("SELECT 1 FROM {table} WHERE id=?1"), [id], |_| {
                Ok(())
            })
            .optional()
            .map(|v| v.is_some())
            .map_err(|e| e.to_string())
    }
}
