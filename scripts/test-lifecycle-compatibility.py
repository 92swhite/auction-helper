#!/usr/bin/env python3
"""Exercise explicit safe-v1/current binaries using disposable fixture files only.

Does not download/build software, discover databases or use an owner's workspace.
The safe-v1 producer is operations commit 95087d0; pre-safety builds are not safe
v2 readers and must never be used as a downgrade path for an upgraded workspace.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import sqlite3
import subprocess
import tempfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--previous-core", type=Path, required=True)
parser.add_argument("--current-core", type=Path, required=True)
parser.add_argument("--output", type=Path, required=True)
args = parser.parse_args()
previous = args.previous_core.resolve(strict=True)
current = args.current_core.resolve(strict=True)
output = args.output.resolve()
output.mkdir(parents=True, exist_ok=True)
root = Path(__file__).resolve().parents[1]
v1 = (root / "backend/core/tests/fixtures/backup-v1-published-594275a.json").read_text()


def call(binary, database, action, payload=None, *, refused=False):
    result = subprocess.run([str(binary), str(database)], input=json.dumps({"action": action, "payload": payload}), text=True, capture_output=True, timeout=30)
    value = json.loads(result.stdout)
    if refused:
        assert result.returncode != 0 and isinstance(value.get("error"), str), value
        return value["error"]
    assert result.returncode == 0 and "error" not in value, value
    return value["data"]


def restore(binary, database, text):
    review = call(binary, database, "validate_backup", {"text": text})
    return call(binary, database, "restore_backup", {"text": text, "expectedRevision": review["currentRevision"], "confirmReplace": True})


def database_files(database):
    # SHM is SQLite reader coordination. A read-only open may create that and
    # an empty WAL; compare durable database/WAL content, not lock bookkeeping.
    return {str(path): path.read_bytes() for path in [database, Path(str(database) + "-wal")] if path.exists() and path.stat().st_size}


with tempfile.TemporaryDirectory(prefix="lifecycle-compatibility-", dir=output) as temporary:
    directory = Path(temporary)
    database = directory / "upgrade.db"
    restore(previous, database, v1)
    legacy = call(previous, database, "backup")
    assert legacy["formatVersion"] == 1
    # Keep committed user data in a live WAL while the new binary upgrades.
    wal = sqlite3.connect(database)
    wal.execute("PRAGMA journal_mode=WAL")
    wal.execute("PRAGMA wal_autocheckpoint=0")
    wal.execute("CREATE TABLE extra_history(note TEXT)")
    wal.execute("INSERT INTO extra_history VALUES('Synthetic committed WAL sentinel 🦆')")
    wal.commit()
    upgraded = call(current, database, "snapshot")
    recovery = Path(upgraded["upgradeRecoveryPath"])
    with sqlite3.connect(f"file:{recovery}?mode=ro", uri=True) as saved:
        assert saved.execute("PRAGMA user_version").fetchone()[0] == 1
        assert saved.execute("SELECT note FROM extra_history").fetchone()[0] == "Synthetic committed WAL sentinel 🦆"
        assert saved.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
    recovered = directory / "recovered-v1.db"
    shutil.copyfile(recovery, recovered)
    assert call(previous, recovered, "backup") == legacy
    mapped = call(current, database, "backup")
    for key in ["settings", "lots", "inventory", "auditEvents"]:
        assert mapped[key] == legacy[key], key
    assert all(state["stage"] == "unreviewed" for state in mapped["lifecycle"])
    held = next(item for item in upgraded["inventory"] if item["soldAt"] is None)
    snapshot = upgraded
    for stage in ["listed", "testing"]:
        snapshot = call(current, database, "inventory_stage", {"id": held["id"], "stage": stage, "expectedRevision": snapshot["revision"]})
    sold = call(current, database, "sell", {"id": held["id"], "grossCents": 10000, "expenseCents": 1000})
    candidate = call(current, database, "backup")
    assert candidate["formatVersion"] == 2 and len(candidate["stageEvents"]) == 2
    assert "Sold" in call(current, database, "inventory_stage", {"id": held["id"], "stage": "listed", "expectedRevision": sold["revision"]}, refused=True)
    # Close the fixture's WAL owner before comparing physical file bytes. The
    # older safe reader may perform SQLite close/checkpoint housekeeping when
    # an idle WAL owner exists, despite refusing all application-level writes.
    wal.close()
    before = database_files(database)
    assert "schema version 2" in call(previous, database, "snapshot", refused=True)
    after = database_files(database)
    assert after == before, {name: {"before": hashlib.sha256(before.get(name,b"")).hexdigest(), "after": hashlib.sha256(after.get(name,b"")).hexdigest()} for name in set(before)|set(after) if before.get(name)!=after.get(name)}
    prior = call(previous, recovered, "backup")
    recovery_files = sorted(path.name for path in directory.glob("backups/*"))
    call(previous, recovered, "validate_backup", {"text": json.dumps(candidate)}, refused=True)
    assert call(previous, recovered, "backup") == prior
    assert sorted(path.name for path in directory.glob("backups/*")) == recovery_files
    restored_db = directory / "restored-v2.db"
    restored = restore(current, restored_db, json.dumps(candidate))["snapshot"]
    assert restored["inventory"] == sold["inventory"]
    assert restored["lifecycle"] == sold["lifecycle"]
    assert restored["stageHistory"] == sold["stageHistory"]
    future_db = directory / "future.db"
    with sqlite3.connect(database) as source, sqlite3.connect(future_db) as target:
        source.backup(target)
        target.execute("PRAGMA user_version=3")
    source.close()
    target.close()
    before_future = database_files(future_db)
    assert "schema version 3" in call(current, future_db, "snapshot", refused=True)
    after_future = database_files(future_db)
    assert after_future == before_future, {name: {"before": hashlib.sha256(before_future.get(name,b"")).hexdigest(), "after": hashlib.sha256(after_future.get(name,b"")).hexdigest()} for name in set(before_future)|set(after_future) if before_future.get(name)!=after_future.get(name)}
    future = dict(candidate, formatVersion=3)
    call(current, restored_db, "validate_backup", {"text": json.dumps(future)}, refused=True)
    for path in [database, recovered, restored_db]:
        with sqlite3.connect(path) as connection:
            assert connection.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
            assert not connection.execute("PRAGMA foreign_key_check").fetchall()
    fixture_path = output / "backup-v2-lifecycle.json"
    fixture_path.write_text(json.dumps(candidate, indent=2, ensure_ascii=False) + "\n")
    report = {
        "status": "passed",
        "safeVersionOneCommit": "95087d0d1424b1c515252b35e6eb30ad4f882a10",
        "previousCoreSha256": hashlib.sha256(previous.read_bytes()).hexdigest(),
        "currentCoreSha256": hashlib.sha256(current.read_bytes()).hexdigest(),
        "fixtureSha256": hashlib.sha256(fixture_path.read_bytes()).hexdigest(),
        "checks": [
            "Actual safe-v1 workspace upgrades without changing financial records, notes or original audit history",
            "Verified pre-upgrade SQLite snapshot includes committed WAL and extra user data; a copy reopens with actual safe-v1 binary",
            "Backward stage correction and sale retain complete version-two history",
            "Safe-v1 binary refuses schema/backup v2 without record or recovery writes",
            "Current binary restores full v2 history and refuses future schema/backup v3",
            "All three disposable workspace databases pass SQLite integrity and foreign-key checks",
        ],
        "fixture": "Explicit binaries and synthetic temporary databases only; no owner database, provider request or credentials",
    }
    (output / "compatibility-report.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))
