#!/usr/bin/env python3
"""Simulate failure of owned CLI processes with synthetic SQLite fixtures only.

Builds a disposable, instrumented copy of the current tracked Rust source with
offline Cargo. No interruption/fault hooks enter production code. SIGKILL targets
only each child created here after its explicit boundary signal. This tests
process failure and injected I/O errors, never physical power-loss durability.
"""
import argparse
import difflib
import hashlib
import json
import os
from pathlib import Path
import select
import shutil
import signal
import sqlite3
import subprocess
import time

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--core", type=Path, required=True, help="Uninstrumented current core executable")
parser.add_argument("--output", type=Path, required=True, help="A new output directory")
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
core = args.core.resolve(strict=True)
output = args.output.resolve()
output.mkdir(parents=True, exist_ok=False)
source = output / "instrumented-source"
source.mkdir()
names = subprocess.check_output(["git", "ls-files", "-z"], cwd=root).decode().split("\0")
source_hashes = {}
for name in filter(None, names):
    path = Path(name)
    if name in ["Cargo.toml", "Cargo.lock"] or (path.parts[0] in ["backend", "migrations"] and (path.suffix in [".rs", ".sql", ".json"] or path.name == "Cargo.toml")):
        destination = source / path
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(root / path, destination)
        source_hashes[name] = hashlib.sha256(destination.read_bytes()).hexdigest()
originals = {name: (source / name).read_text() for name in ["backend/core/src/lib.rs", "backend/core/src/migrations.rs", "backend/core/src/backup.rs"]}


def replace(name, old, new):
    path = source / name
    text = path.read_text()
    assert text.count(old) == 1, (name, old, text.count(old))
    path.write_text(text.replace(old, new))


lib = "backend/core/src/lib.rs"
migration = "backend/core/src/migrations.rs"
backup = "backend/core/src/backup.rs"
with (source / lib).open("a") as file:
    file.write('''
// Disposable review probe only; never copied back into production source.
pub(crate) fn review_boundary(label: &str) {
    if std::env::var("AUCTION_REVIEW_STOP").ok().as_deref() == Some(label) {
        use std::io::Write;
        eprintln!("AUCTION_REVIEW_READY:{label}");
        std::io::stderr().flush().unwrap();
        loop { std::thread::park(); }
    }
}
pub(crate) fn review_io_failure(label: &str) -> std::io::Result<()> {
    if std::env::var("AUCTION_REVIEW_IO_ERROR").ok().as_deref() == Some(label) {
        return Err(std::io::Error::other(format!("Simulated review I/O failure: {label}")));
    }
    Ok(())
}
''')
replace(migration, "    let copy = (|| -> Result<()> {", '    crate::review_boundary("upgrade_created");\n    let copy = (|| -> Result<()> {')
replace(migration, "        file.sync_all().map_err(|error| error.to_string())?;", '        crate::review_io_failure("upgrade_file_sync").map_err(|error| error.to_string())?;\n        file.sync_all().map_err(|error| error.to_string())?;')
replace(migration, "            File::open(&directory)", '            crate::review_io_failure("upgrade_directory_sync").map_err(|error| error.to_string())?;\n            File::open(&directory)')
replace(migration, "    let apply = (|| -> Result<()> {", '    if recovery.is_some() { crate::review_boundary("upgrade_recovery_ready"); }\n    let apply = (|| -> Result<()> {')
replace(migration, "        validate_existing(&transaction, 2)", '        crate::review_boundary("upgrade_written");\n        validate_existing(&transaction, 2)')
replace(migration, "    Ok(recovery)\n}", '    crate::review_boundary("upgrade_committed");\n    Ok(recovery)\n}')
replace(backup, "    file.write_all(&serde_json::to_vec(backup).map_err(|e| e.to_string())?)", '    crate::review_boundary("restore_created");\n    file.write_all(&serde_json::to_vec(backup).map_err(|e| e.to_string())?)')
replace(backup, "        .and_then(|_| file.sync_all())", '        .and_then(|_| { crate::review_boundary("restore_written"); crate::review_io_failure("restore_file_sync")?; file.sync_all() })')
replace(backup, "        std::fs::File::open(&dir)", '        crate::review_io_failure("restore_directory_sync").map_err(|error| error.to_string())?;\n        std::fs::File::open(&dir)')
replace(backup, "        let recovery = recovery_copy(&self.path, &prior)?;", '        let recovery = recovery_copy(&self.path, &prior)?;\n        crate::review_boundary("restore_recovery_ready");')
replace(backup, '        transaction\n            .execute(\n                "UPDATE settings SET payload=?1 WHERE id=1",', '        crate::review_boundary("restore_deleted");\n        transaction\n            .execute(\n                "UPDATE settings SET payload=?1 WHERE id=1",')
replace(backup, '        transaction.execute("INSERT INTO audit_events(id,action,subject_id,created_at) VALUES(?1,\'restore_backup\',\'workspace\',?2)"', '        crate::review_boundary("restore_history_written");\n        transaction.execute("INSERT INTO audit_events(id,action,subject_id,created_at) VALUES(?1,\'restore_backup\',\'workspace\',?2)"')
replace(backup, '        transaction.commit().map_err(|e| e.to_string())?;\n        Ok(json!({"snapshot":self.snapshot()?', '        transaction.commit().map_err(|e| e.to_string())?;\n        crate::review_boundary("restore_committed");\n        Ok(json!({"snapshot":self.snapshot()?')
replace(lib, "        self.mutate(action, payload)?;", '        self.mutate(action, payload)?;\n        if action == "inventory_stage" { crate::review_boundary("stage_written"); }')
replace(lib, '        transaction.commit().map_err(|error| error.to_string())?;\n        serde_json::to_value(self.snapshot()?)', '        transaction.commit().map_err(|error| error.to_string())?;\n        if action == "inventory_stage" { crate::review_boundary("stage_committed"); }\n        serde_json::to_value(self.snapshot()?)')
patch = "".join("".join(difflib.unified_diff(originals[name].splitlines(True), (source/name).read_text().splitlines(True), fromfile=name, tofile=name+" (disposable probe)")) for name in originals)
(output / "instrumentation.patch").write_text(patch)
env = dict(os.environ, CARGO_TARGET_DIR=str(output / "target"), CARGO_NET_OFFLINE="true")
with (output / "build.log").open("w") as log:
    subprocess.run(["cargo", "build", "--offline", "--manifest-path", str(source/"Cargo.toml"), "-p", "auction-core"], env=env, stdout=log, stderr=subprocess.STDOUT, check=True, timeout=240)
probe = output / "target/debug/auction-core"
fixtures = root / "backend/core/tests/fixtures"
v1 = (fixtures / "backup-v1-published-594275a.json").read_text()
v2 = (fixtures / "backup-v2-lifecycle.json").read_text()
checks = []


def call(executable, database, action, payload=None, *, fault=None, refused=False):
    env = dict(os.environ)
    if fault:
        env["AUCTION_REVIEW_IO_ERROR"] = fault
    result = subprocess.run([str(executable), str(database)], input=json.dumps({"action": action, "payload": payload}), text=True, capture_output=True, env=env, timeout=30)
    value = json.loads(result.stdout)
    if refused:
        assert result.returncode and value.get("error"), value
        return value["error"]
    assert not result.returncode and "error" not in value, value
    return value["data"]


def stop_at(database, action, payload, boundary):
    env = dict(os.environ, AUCTION_REVIEW_STOP=boundary)
    child = subprocess.Popen([str(probe), str(database)], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=env, start_new_session=True)
    try:
        child.stdin.write(json.dumps({"action": action, "payload": payload}))
        child.stdin.close()
        deadline = time.monotonic() + 20
        ready = False
        while time.monotonic() < deadline and child.poll() is None:
            if select.select([child.stderr], [], [], .1)[0]:
                line = child.stderr.readline()
                if line.strip() == "AUCTION_REVIEW_READY:" + boundary:
                    ready = True
                    break
        assert ready, f"Owned probe did not reach {boundary}; status={child.poll()}"
        os.kill(child.pid, signal.SIGKILL)
        assert child.wait(timeout=10) == -signal.SIGKILL
    finally:
        if child.poll() is None:
            child.kill()
            child.wait(timeout=10)
        child.stdout.close()
        child.stderr.close()


def logical(database):
    connection = sqlite3.connect(database)
    try:
        assert connection.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        assert not connection.execute("PRAGMA foreign_key_check").fetchall()
        names = [row[0] for row in connection.execute("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT GLOB 'sqlite_*' ORDER BY name")]
        return {"version": connection.execute("PRAGMA user_version").fetchone()[0], "tables": {name: sorted(connection.execute('SELECT * FROM "'+name.replace('"','""')+'"').fetchall(), key=repr) for name in names}}
    finally:
        connection.close()


def seed_v1(name):
    directory = output / name
    directory.mkdir()
    database = directory / "workspace.db"
    connection = sqlite3.connect(database)
    connection.executescript((fixtures / "workspace-v1-published-594275a.sql").read_text())
    connection.execute("CREATE TABLE extra_history(note TEXT)")
    connection.execute("INSERT INTO extra_history VALUES('Isolated failure-review sentinel')")
    connection.commit()
    connection.close()
    return database


def seed_v2(name):
    directory = output / name
    directory.mkdir()
    database = directory / "workspace.db"
    snapshot = call(core, database, "restore_backup", {"text": v1, "expectedRevision": 0, "confirmReplace": True})["snapshot"]
    item = next(item for item in snapshot["inventory"] if item["soldAt"] is None)
    return database, snapshot, item


for boundary in ["upgrade_created", "upgrade_recovery_ready", "upgrade_written", "upgrade_committed"]:
    database = seed_v1(boundary)
    before = logical(database)
    stop_at(database, "snapshot", None, boundary)
    after = logical(database)
    copies = list((database.parent / "backups").glob("*.sqlite"))
    assert len(copies) == 1
    if boundary != "upgrade_created":
        assert logical(copies[0]) == before
    if boundary == "upgrade_committed":
        assert after["version"] == 2
        assert all(after["tables"][name] == rows for name, rows in before["tables"].items())
        assert all(row[1] == "unreviewed" for row in after["tables"]["inventory_lifecycle"])
        assert not after["tables"]["inventory_stage_events"]
    else:
        assert after == before, boundary
    call(core, database, "snapshot")
    assert logical(database)["version"] == 2
    checks.append({"case": boundary, "status": "passed", "afterKillSchema": after["version"], "verifiedCopyExpected": boundary != "upgrade_created"})

for boundary in ["restore_created", "restore_written", "restore_recovery_ready", "restore_deleted", "restore_history_written", "restore_committed"]:
    database, snapshot, item = seed_v2(boundary)
    snapshot = call(core, database, "inventory_stage", {"id": item["id"], "stage": "listed", "expectedRevision": snapshot["revision"]})
    before = call(core, database, "backup")
    copies = set((database.parent / "backups").glob("*.json"))
    payload = {"text": v2, "expectedRevision": snapshot["revision"], "confirmReplace": True}
    stop_at(database, "restore_backup", payload, boundary)
    after = call(core, database, "backup")
    logical(database)
    created = set((database.parent / "backups").glob("*.json")) - copies
    assert len(created) == 1
    if boundary != "restore_created":
        assert json.loads(next(iter(created)).read_text()) == before
    if boundary == "restore_committed":
        incoming = json.loads(v2)
        for key in ["settings", "lots", "inventory", "lifecycle", "stageEvents"]:
            assert after[key] == incoming[key], key
        assert after["auditEvents"][:-1] == incoming["auditEvents"]
        assert after["auditEvents"][-1]["id"] > max(snapshot["revision"], max(event["id"] for event in incoming["auditEvents"]))
        assert "changed since preview" in call(core, database, "restore_backup", payload, refused=True)
        assert call(core, database, "backup") == after
    else:
        assert after == before, boundary
    checks.append({"case": boundary, "status": "passed", "committedAfterKill": boundary == "restore_committed", "recoveryJSONComplete": boundary != "restore_created"})

for boundary in ["stage_written", "stage_committed"]:
    database, snapshot, item = seed_v2(boundary)
    before = call(core, database, "backup")
    payload = {"id": item["id"], "stage": "testing", "expectedRevision": snapshot["revision"]}
    stop_at(database, "inventory_stage", payload, boundary)
    after = call(core, database, "backup")
    logical(database)
    if boundary == "stage_written":
        assert after == before
    else:
        for key in ["settings", "lots", "inventory"]:
            assert after[key] == before[key]
        assert len(after["stageEvents"]) == 1
        assert next(state for state in after["lifecycle"] if state["inventoryId"] == item["id"])["stage"] == "testing"
        assert "changed since" in call(core, database, "inventory_stage", payload, refused=True)
        assert call(core, database, "backup") == after
    checks.append({"case": boundary, "status": "passed", "committedAfterKill": boundary == "stage_committed"})

for fault in ["upgrade_file_sync", "upgrade_directory_sync", "restore_file_sync", "restore_directory_sync"]:
    if fault.startswith("upgrade"):
        database = seed_v1(fault)
        before = logical(database)
        error = call(probe, database, "snapshot", fault=fault, refused=True)
        assert logical(database) == before
    else:
        database, snapshot, item = seed_v2(fault)
        before = call(core, database, "backup")
        error = call(probe, database, "restore_backup", {"text": v2, "expectedRevision": snapshot["revision"], "confirmReplace": True}, fault=fault, refused=True)
        assert call(core, database, "backup") == before
    assert "Simulated review I/O failure" in error
    checks.append({"case": fault, "status": "passed", "originalStatePreserved": True})

report = {"status": "passed", "reviewSourceBase": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip(),
    "productionCoreSha256": hashlib.sha256(core.read_bytes()).hexdigest(), "instrumentedCoreSha256": hashlib.sha256(probe.read_bytes()).hexdigest(),
    "instrumentationPatchSha256": hashlib.sha256(patch.encode()).hexdigest(), "reviewSourceSha256": source_hashes,
    "checks": checks, "method": "Disposable source copy with explicit pause/I/O fault hooks; SIGKILL only owned child PIDs; actual SQLite files and recovery paths",
    "limits": ["Simulated process termination and error returns, not physical power loss or filesystem/controller durability", "No owner database or unrelated process accessed", "Instrumentation does not enter production source"]}
(output / "report.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps({"status": report["status"], "checks": len(checks), "report": str(output/"report.json")}, indent=2))
