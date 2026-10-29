CREATE TABLE inventory_lifecycle (
    inventory_id TEXT PRIMARY KEY REFERENCES inventory(id),
    stage TEXT NOT NULL CHECK (stage IN ('unreviewed','needs_pickup','testing','ready_to_list','listed'))
);
CREATE TABLE inventory_stage_events (
    audit_id INTEGER PRIMARY KEY REFERENCES audit_events(id),
    inventory_id TEXT NOT NULL REFERENCES inventory(id),
    from_stage TEXT NOT NULL CHECK (from_stage IN ('unreviewed','needs_pickup','testing','ready_to_list','listed')),
    to_stage TEXT NOT NULL CHECK (to_stage IN ('unreviewed','needs_pickup','testing','ready_to_list','listed')),
    CHECK (from_stage <> to_stage)
);
INSERT INTO inventory_lifecycle(inventory_id,stage) SELECT id,'unreviewed' FROM inventory;
PRAGMA user_version = 2;
