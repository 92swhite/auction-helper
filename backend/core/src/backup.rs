use crate::{model::*, valuation::*, Result, Store};
use chrono::DateTime;
use rusqlite::{params, Connection, TransactionBehavior};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashSet,
    fs::OpenOptions,
    io::Write,
    path::{Path, PathBuf},
};

pub const MAX_BACKUP_BYTES: usize = 1_000_000;
const MAX_RECORDS: usize = 5_000;
const MAX_REVISION: i64 = 1_000_000_000_000;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Backup {
    app: String,
    format_version: u32,
    settings: Settings,
    lots: Vec<BackupLot>,
    inventory: Vec<InventoryItem>,
    audit_events: Vec<AuditEvent>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct BackupLot {
    input: LotInput,
    watched: bool,
    created_at: String,
    updated_at: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AuditEvent {
    id: i64,
    action: String,
    subject_id: String,
    created_at: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct BackupRequest {
    text: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RestoreRequest {
    text: String,
    expected_revision: i64,
    confirm_replace: bool,
}

fn timestamp(value: &str) -> Result<chrono::DateTime<chrono::FixedOffset>> {
    DateTime::parse_from_rfc3339(value).map_err(|_| "Backup contains an invalid timestamp.".into())
}

fn valid_id(value: &str) -> Result<()> {
    uuid::Uuid::parse_str(value)
        .map(|_| ())
        .map_err(|_| "Backup contains an invalid record ID.".into())
}

fn revision(conn: &Connection) -> Result<i64> {
    conn.query_row("SELECT COALESCE(MAX(id),0) FROM audit_events", [], |r| {
        r.get(0)
    })
    .map_err(|e| e.to_string())
}

fn parse(text: &str) -> Result<Backup> {
    if text.len() > MAX_BACKUP_BYTES {
        return Err("Backup exceeds the 1 MB limit.".into());
    }
    let backup: Backup =
        serde_json::from_str(text).map_err(|e| format!("Invalid backup JSON: {e}"))?;
    validate(&backup)?;
    Ok(backup)
}

fn validate(backup: &Backup) -> Result<i64> {
    if backup.app != "auction-helper" || backup.format_version != 1 {
        return Err(
            "Unsupported backup format. Choose an Auction Helper version-one backup.".into(),
        );
    }
    if backup.lots.len() > MAX_RECORDS
        || backup.inventory.len() > MAX_RECORDS
        || backup.audit_events.len() > MAX_RECORDS
    {
        return Err("Backup contains too many records.".into());
    }
    validate_settings(&backup.settings)?;
    let mut lots = HashSet::new();
    for lot in &backup.lots {
        validate_lot(&lot.input)?;
        let id = lot.input.id.as_deref().ok_or("Backup lot ID is missing.")?;
        valid_id(id)?;
        if !lots.insert(id) {
            return Err("Backup contains duplicate lot IDs.".into());
        }
        if timestamp(&lot.created_at)? > timestamp(&lot.updated_at)? {
            return Err("Backup lot timestamps are out of order.".into());
        }
    }
    let mut inventory = HashSet::new();
    let mut acquired_lots = HashSet::new();
    let mut available = backup.settings.capital_cents;
    for item in &backup.inventory {
        valid_id(&item.id)?;
        if !inventory.insert(item.id.as_str()) || !acquired_lots.insert(item.lot_id.as_str()) {
            return Err("Backup contains duplicate inventory or acquired lot IDs.".into());
        }
        if !lots.contains(item.lot_id.as_str()) {
            return Err("Backup inventory refers to a missing lot.".into());
        }
        if item.title.trim().is_empty() || item.title.len() > 300 {
            return Err("Backup inventory title is invalid.".into());
        }
        money(item.acquisition_cents)?;
        if item.acquisition_cents == 0 {
            return Err("Backup purchase cost must be positive.".into());
        }
        let purchased = timestamp(&item.purchased_at)?;
        match (item.sale_net_cents, &item.sold_at) {
            (None, None) => available -= item.acquisition_cents,
            (Some(net), Some(sold)) => {
                if !(-MAX_MONEY..=MAX_MONEY).contains(&net) || timestamp(sold)? < purchased {
                    return Err("Backup sale value or timestamp is invalid.".into());
                }
                available += net - item.acquisition_cents;
            }
            _ => return Err("Backup sold state is inconsistent.".into()),
        }
    }
    let mut audit_ids = HashSet::new();
    for event in &backup.audit_events {
        if event.id <= 0 || event.id >= MAX_REVISION || !audit_ids.insert(event.id) {
            return Err("Backup audit IDs must be positive and unique.".into());
        }
        timestamp(&event.created_at)?;
        let valid = match event.action.as_str() {
            "save_lot" | "watch" => lots.contains(event.subject_id.as_str()),
            "purchase" | "sell" => inventory.contains(event.subject_id.as_str()),
            "settings" => event.subject_id == "settings",
            "restore_backup" => event.subject_id == "workspace",
            _ => false,
        };
        if !valid {
            return Err("Backup contains an invalid audit action or reference.".into());
        }
    }
    // The bounded record count and money limits keep all aggregate arithmetic in i64.
    for lot in &backup.lots {
        analyze(&lot.input, &backup.settings, available.max(0))?;
    }
    Ok(available)
}

fn export(conn: &Connection) -> Result<Backup> {
    let settings: String = conn
        .query_row("SELECT payload FROM settings WHERE id=1", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let mut statement = conn
        .prepare("SELECT payload,watched,created_at,updated_at FROM lots ORDER BY id")
        .map_err(|e| e.to_string())?;
    let rows = statement
        .query_map([], |r| {
            Ok((r.get::<_, String>(0)?, r.get(1)?, r.get(2)?, r.get(3)?))
        })
        .map_err(|e| e.to_string())?;
    let mut lots = Vec::new();
    for row in rows {
        let (input, watched, created_at, updated_at) = row.map_err(|e| e.to_string())?;
        lots.push(BackupLot {
            input: serde_json::from_str(&input).map_err(|e| e.to_string())?,
            watched,
            created_at,
            updated_at,
        });
    }
    let mut statement = conn.prepare("SELECT id,lot_id,title,acquisition_cents,purchased_at,sale_net_cents,sold_at FROM inventory ORDER BY id").map_err(|e| e.to_string())?;
    let inventory = statement
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
    let mut statement = conn
        .prepare("SELECT id,action,subject_id,created_at FROM audit_events ORDER BY id")
        .map_err(|e| e.to_string())?;
    let audit_events = statement
        .query_map([], |r| {
            Ok(AuditEvent {
                id: r.get(0)?,
                action: r.get(1)?,
                subject_id: r.get(2)?,
                created_at: r.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<std::result::Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    let backup = Backup {
        app: "auction-helper".into(),
        format_version: 1,
        settings: serde_json::from_str(&settings).map_err(|e| e.to_string())?,
        lots,
        inventory,
        audit_events,
    };
    validate(&backup)?;
    if serde_json::to_vec(&backup)
        .map_err(|e| e.to_string())?
        .len()
        > MAX_BACKUP_BYTES
    {
        return Err(
            "Workspace exceeds the 1 MB JSON backup limit. Use a closed-app SQLite copy.".into(),
        );
    }
    Ok(backup)
}

fn recovery_copy(database: &Path, backup: &Backup) -> Result<PathBuf> {
    let dir = database.parent().unwrap_or(Path::new(".")).join("backups");
    if !dir.exists() {
        let mut builder = std::fs::DirBuilder::new();
        builder.recursive(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::DirBuilderExt;
            builder.mode(0o700);
        }
        builder
            .create(&dir)
            .map_err(|e| format!("Could not create recovery backup directory: {e}"))?;
    }
    let metadata = std::fs::symlink_metadata(&dir).map_err(|e| e.to_string())?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err("Recovery backup directory must be a real directory.".into());
    }
    let path = dir.join(format!("before-restore-{}.json", uuid::Uuid::new_v4()));
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options
        .open(&path)
        .map_err(|e| format!("Could not create recovery backup: {e}"))?;
    file.write_all(&serde_json::to_vec(backup).map_err(|e| e.to_string())?)
        .and_then(|_| file.sync_all())
        .map_err(|e| format!("Could not save recovery backup: {e}"))?;
    #[cfg(unix)]
    {
        std::fs::File::open(&dir)
            .and_then(|f| f.sync_all())
            .map_err(|e| format!("Could not flush recovery directory: {e}"))?;
        std::fs::File::open(dir.parent().unwrap_or(Path::new(".")))
            .and_then(|f| f.sync_all())
            .map_err(|e| format!("Could not flush recovery parent directory: {e}"))?;
    }
    Ok(path)
}

impl Store {
    pub fn create_backup(&mut self) -> Result<Backup> {
        let transaction = self.conn.transaction().map_err(|e| e.to_string())?;
        let backup = export(&transaction)?;
        transaction.commit().map_err(|e| e.to_string())?;
        Ok(backup)
    }

    pub(crate) fn preview_backup(&self, payload: Value) -> Result<Value> {
        let request: BackupRequest = serde_json::from_value(payload).map_err(|e| e.to_string())?;
        let backup = parse(&request.text)?;
        Ok(
            json!({"lotCount":backup.lots.len(),"inventoryCount":backup.inventory.len(),"soldCount":backup.inventory.iter().filter(|i| i.sold_at.is_some()).count(),"auditCount":backup.audit_events.len(),"availableCents":validate(&backup)?,"currentRevision":revision(&self.conn)?}),
        )
    }

    pub(crate) fn restore_backup(&mut self, payload: Value) -> Result<Value> {
        let request: RestoreRequest = serde_json::from_value(payload).map_err(|e| e.to_string())?;
        if !request.confirm_replace {
            return Err("Explicit workspace replacement confirmation is required.".into());
        }
        let backup = parse(&request.text)?;
        let transaction = self
            .conn
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|e| e.to_string())?;
        let current_revision = revision(&transaction)?;
        if current_revision != request.expected_revision {
            return Err(
                "Workspace changed since preview. Choose the backup again and review it.".into(),
            );
        }
        let prior = export(&transaction)?;
        let recovery = recovery_copy(&self.path, &prior)?;
        let imported_revision = backup.audit_events.iter().map(|e| e.id).max().unwrap_or(0);
        let next_revision = current_revision
            .max(imported_revision)
            .checked_add(1)
            .ok_or("Audit revision limit reached.")?;
        if next_revision >= MAX_REVISION {
            return Err("Audit revision limit reached.".into());
        }
        transaction
            .execute_batch("DELETE FROM audit_events; DELETE FROM inventory; DELETE FROM lots;")
            .map_err(|e| e.to_string())?;
        transaction
            .execute(
                "UPDATE settings SET payload=?1 WHERE id=1",
                [serde_json::to_string(&backup.settings).map_err(|e| e.to_string())?],
            )
            .map_err(|e| e.to_string())?;
        for lot in &backup.lots {
            transaction.execute("INSERT INTO lots(id,payload,watched,created_at,updated_at) VALUES(?1,?2,?3,?4,?5)",params![lot.input.id,serde_json::to_string(&lot.input).map_err(|e| e.to_string())?,lot.watched,lot.created_at,lot.updated_at]).map_err(|e| e.to_string())?;
        }
        for item in &backup.inventory {
            transaction.execute("INSERT INTO inventory(id,lot_id,title,acquisition_cents,purchased_at,sale_net_cents,sold_at) VALUES(?1,?2,?3,?4,?5,?6,?7)",params![item.id,item.lot_id,item.title,item.acquisition_cents,item.purchased_at,item.sale_net_cents,item.sold_at]).map_err(|e| e.to_string())?;
        }
        for event in &backup.audit_events {
            transaction
                .execute(
                    "INSERT INTO audit_events(id,action,subject_id,created_at) VALUES(?1,?2,?3,?4)",
                    params![event.id, event.action, event.subject_id, event.created_at],
                )
                .map_err(|e| e.to_string())?;
        }
        transaction.execute("INSERT INTO audit_events(id,action,subject_id,created_at) VALUES(?1,'restore_backup','workspace',?2)",params![next_revision,chrono::Utc::now().to_rfc3339()]).map_err(|e| e.to_string())?;
        transaction.commit().map_err(|e| e.to_string())?;
        Ok(json!({"snapshot":self.snapshot()?,"recoveryPath":recovery.to_string_lossy()}))
    }
}
