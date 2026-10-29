use crate::{model::Settings, valuation::validate_settings, Result};
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};

pub const CURRENT_SCHEMA_VERSION: i64 = 1;
const INITIAL: &str = include_str!("../../../migrations/001_initial.sql");

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
    sql.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_ascii_lowercase()
}

fn validate_existing(connection: &Connection) -> Result<()> {
    // SQLite supplies the canonical stored definitions from the unchanged v1 script.
    let reference = Connection::open_in_memory().map_err(|error| error.to_string())?;
    reference
        .execute_batch(INITIAL)
        .map_err(|error| error.to_string())?;
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
            return Err(format!("Database schema version 1 has an unrecognized definition for {name}. No repair or replacement was performed."));
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

pub(crate) fn initialize(connection: &mut Connection) -> Result<()> {
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
    validate_existing(&transaction)?;
    transaction.commit().map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sqlite_capacity_failure_rolls_back_schema_settings_and_version_together() {
        let mut connection = Connection::open_in_memory().unwrap();
        connection.pragma_update(None, "max_page_count", 2).unwrap();
        assert!(initialize(&mut connection).is_err());
        assert_eq!(version(&connection).unwrap(), 0);
        assert!(!has_user_objects(&connection).unwrap());
    }
}
