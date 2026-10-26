PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK (id = 1), payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS lots (
    id TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    watched INTEGER NOT NULL DEFAULT 0 CHECK (watched IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS inventory (
    id TEXT PRIMARY KEY,
    lot_id TEXT NOT NULL UNIQUE REFERENCES lots(id),
    title TEXT NOT NULL,
    acquisition_cents INTEGER NOT NULL CHECK (acquisition_cents >= 0),
    purchased_at TEXT NOT NULL,
    sale_net_cents INTEGER,
    sold_at TEXT,
    CHECK ((sale_net_cents IS NULL) = (sold_at IS NULL))
);
CREATE TABLE IF NOT EXISTS audit_events (
    id INTEGER PRIMARY KEY,
    action TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS lots_watched ON lots(watched);
PRAGMA user_version = 1;
