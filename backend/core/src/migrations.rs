use crate::{model::Settings, valuation::validate_settings, Result};
use rusqlite::{
    backup::{Backup, StepResult},
    params, Connection, OpenFlags, OptionalExtension, TransactionBehavior,
};
#[cfg(unix)]
use std::fs::File;
use std::{
    fs::OpenOptions,
    path::{Path, PathBuf},
};

pub const CURRENT_SCHEMA_VERSION: i64 = 2;
const INITIAL: &str = include_str!("../../../migrations/001_initial.sql");
const LIFECYCLE: &str = include_str!("../../../migrations/002_inventory_lifecycle.sql");

fn version(connection: &Connection) -> Result<i64> {
    connection
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(|error| error.to_string())
}

fn supported(value: i64) -> Result<()> {
    if !(0..=CURRENT_SCHEMA_VERSION).contains(&value) {
        return Err(format!("Database schema version {value} is not supported by this app (version {CURRENT_SCHEMA_VERSION}). Use a compatible app; the database was not changed."));
    }
    Ok(())
}

pub(crate) fn check_supported(connection: &Connection) -> Result<()> {
    supported(version(connection)?)
}

fn has_user_objects(connection: &Connection) -> Result<bool> {
    connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*')",
            [],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())
}

fn empty_before_initialization(connection: &Connection) -> Result<()> {
    if has_user_objects(connection)? {
        return Err("An unversioned database already contains data or schema objects. Initialization was refused and the database was not changed.".into());
    }
    Ok(())
}

fn normalize(sql: &str) -> String {
    // SQL keywords are case-insensitive; CHECK/default string literals are not.
    // Preserve quoted bytes (including whitespace and doubled SQL quotes).
    let mut normalized = String::new();
    let mut quote = None;
    let mut space = false;
    for character in sql.chars() {
        if let Some(delimiter) = quote {
            normalized.push(character);
            if character == delimiter {
                quote = None;
            }
        } else if character.is_whitespace() {
            space = true;
        } else {
            if space && !normalized.is_empty() {
                normalized.push(' ');
            }
            space = false;
            if matches!(character, '\'' | '"' | '`') {
                quote = Some(character);
                normalized.push(character);
            } else {
                normalized.push(character.to_ascii_lowercase());
            }
        }
    }
    normalized
}

fn validate_existing(connection: &Connection, schema_version: i64) -> Result<()> {
    // Compare canonical stored definitions; never repair an unfamiliar schema.
    let reference = Connection::open_in_memory().map_err(|error| error.to_string())?;
    reference
        .execute_batch(INITIAL)
        .map_err(|error| error.to_string())?;
    if schema_version == 2 {
        reference
            .execute_batch(LIFECYCLE)
            .map_err(|error| error.to_string())?;
    }
    let mut statement = reference
        .prepare("SELECT name, sql FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*' AND type IN ('table','index') ORDER BY name")
        .map_err(|error| error.to_string())?;
    let expected = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|error| error.to_string())?
        .collect::<std::result::Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    for (name, sql) in expected {
        let actual: Option<String> = connection
            .query_row(
                "SELECT sql FROM sqlite_schema WHERE name=?1",
                [&name],
                |row| row.get(0),
            )
            .optional()
            .map_err(|error| error.to_string())?;
        if actual.as_deref().map(normalize) != Some(normalize(&sql)) {
            return Err(format!("Database schema version {schema_version} has an unrecognized definition for {name}. No repair or replacement was performed."));
        }
    }
    let payload: Option<String> = connection
        .query_row("SELECT payload FROM settings WHERE id=1", [], |row| {
            row.get(0)
        })
        .optional()
        .map_err(|error| error.to_string())?;
    let settings: Settings = serde_json::from_str(
        &payload.ok_or("Database settings are missing. No default values were inserted.")?,
    )
    .map_err(|_| "Database settings cannot be read. No replacement was performed.".to_string())?;
    validate_settings(&settings)
        .map_err(|_| "Database settings are invalid. No replacement was performed.".to_string())
}

// The caller holds BEGIN IMMEDIATE on a different connection, so no writer can
// change the source between this snapshot and the upgrade. SQLite's backup API
// includes committed WAL pages and every user table, without JSON record limits.
fn recovery_copy(database: &Path) -> Result<PathBuf> {
    let directory = database.parent().unwrap_or(Path::new(".")).join("backups");
    if !directory.exists() {
        let mut builder = std::fs::DirBuilder::new();
        builder.recursive(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::DirBuilderExt;
            builder.mode(0o700);
        }
        builder
            .create(&directory)
            .map_err(|error| format!("Could not create upgrade recovery directory: {error}"))?;
    }
    let metadata = std::fs::symlink_metadata(&directory).map_err(|error| error.to_string())?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err("Upgrade recovery directory must be a real directory.".into());
    }
    let path = directory.join(format!("before-upgrade-v1-{}.sqlite", uuid::Uuid::new_v4()));
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let file = options
        .open(&path)
        .map_err(|error| format!("Could not create upgrade recovery file: {error}"))?;
    let copy = (|| -> Result<()> {
        let source = Connection::open_with_flags(database, OpenFlags::SQLITE_OPEN_READ_ONLY)
            .map_err(|error| error.to_string())?;
        let mut target = Connection::open_with_flags(&path, OpenFlags::SQLITE_OPEN_READ_WRITE)
            .map_err(|error| error.to_string())?;
        {
            let backup = Backup::new(&source, &mut target).map_err(|error| error.to_string())?;
            if backup.step(-1).map_err(|error| error.to_string())? != StepResult::Done {
                return Err("SQLite could not complete the recovery snapshot while locked.".into());
            }
        }
        target
            .pragma_update(None, "journal_mode", "DELETE")
            .map_err(|error| error.to_string())?;
        let integrity: String = target
            .query_row("PRAGMA integrity_check", [], |row| row.get(0))
            .map_err(|error| error.to_string())?;
        if integrity != "ok"
            || target
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM pragma_foreign_key_check)",
                    [],
                    |row| row.get::<_, bool>(0),
                )
                .map_err(|error| error.to_string())?
        {
            return Err(
                "The recovery snapshot failed SQLite integrity or foreign-key validation.".into(),
            );
        }
        if version(&target)? != 1 {
            return Err("The recovery snapshot has an unexpected schema version.".into());
        }
        validate_existing(&target, 1)?;
        target.close().map_err(|(_, error)| error.to_string())?;
        file.sync_all().map_err(|error| error.to_string())?;
        #[cfg(unix)]
        {
            File::open(&directory)
                .and_then(|file| file.sync_all())
                .map_err(|error| error.to_string())?;
            File::open(directory.parent().unwrap_or(Path::new(".")))
                .and_then(|file| file.sync_all())
                .map_err(|error| error.to_string())?;
        }
        Ok(())
    })();
    copy.map_err(|error| format!("Upgrade recovery failed: {error}. The database was not upgraded. An incomplete recovery file may remain at {}.", path.display()))?;
    Ok(path)
}

pub(crate) fn initialize(connection: &mut Connection, database: &Path) -> Result<Option<PathBuf>> {
    let before = version(connection)?;
    supported(before)?;
    connection
        .pragma_update(None, "foreign_keys", true)
        .map_err(|error| error.to_string())?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| error.to_string())?;
    // Another process may have initialized the file while this connection waited.
    let current = version(&transaction)?;
    supported(current)?;
    let recovery = if current == 1 {
        validate_existing(&transaction, 1)?;
        Some(recovery_copy(database)?)
    } else {
        None
    };
    let apply = (|| -> Result<()> {
        if current == 0 {
            empty_before_initialization(&transaction)?;
            transaction
                .execute_batch(INITIAL)
                .map_err(|error| error.to_string())?;
            let settings =
                serde_json::to_string(&Settings::default()).map_err(|error| error.to_string())?;
            transaction
                .execute(
                    "INSERT INTO settings(id,payload) VALUES(1,?1)",
                    params![settings],
                )
                .map_err(|error| error.to_string())?;
        }
        if current < 2 {
            transaction
                .execute_batch(LIFECYCLE)
                .map_err(|error| error.to_string())?;
        }
        validate_existing(&transaction, 2)
    })();
    let describe = |error: String| {
        match &recovery {
        Some(path) => format!("Workspace upgrade failed: {error}. The transaction was rolled back; verified version-one recovery copy kept at {}.", path.display()),
        None => error,
    }
    };
    apply.map_err(describe)?;
    transaction
        .commit()
        .map_err(|error| describe(error.to_string()))?;
    Ok(recovery)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sqlite_capacity_failure_rolls_back_schema_settings_and_version_together() {
        let mut connection = Connection::open_in_memory().unwrap();
        connection.pragma_update(None, "max_page_count", 2).unwrap();
        assert!(initialize(&mut connection, Path::new(":memory:")).is_err());
        assert_eq!(version(&connection).unwrap(), 0);
        assert!(!has_user_objects(&connection).unwrap());
    }

    #[test]
    fn upgrade_capacity_failure_retains_verified_recovery_and_rolls_back_v1() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("capacity.db");
        let mut connection = Connection::open(&path).unwrap();
        connection.execute_batch(INITIAL).unwrap();
        connection
            .execute(
                "INSERT INTO settings VALUES(1,?1)",
                [serde_json::to_string(&Settings::default()).unwrap()],
            )
            .unwrap();
        let pages: i64 = connection
            .pragma_query_value(None, "page_count", |row| row.get(0))
            .unwrap();
        connection
            .pragma_update(None, "max_page_count", pages)
            .unwrap();
        let error = initialize(&mut connection, &path).unwrap_err();
        assert!(
            error.contains("verified version-one recovery copy kept"),
            "{error}"
        );
        assert_eq!(version(&connection).unwrap(), 1);
        assert_eq!(connection.query_row("SELECT COUNT(*) FROM sqlite_schema WHERE name IN ('inventory_lifecycle','inventory_stage_events')",[],|row|row.get::<_,i64>(0)).unwrap(),0);
        validate_existing(&connection, 1).unwrap();
        let files: Vec<_> = std::fs::read_dir(directory.path().join("backups"))
            .unwrap()
            .map(|entry| entry.unwrap().path())
            .collect();
        assert_eq!(files.len(), 1);
        let recovery = Connection::open(&files[0]).unwrap();
        assert_eq!(version(&recovery).unwrap(), 1);
        validate_existing(&recovery, 1).unwrap();
    }
}
