#!/usr/bin/env python3
"""Cross-check two existing core executables using only disposable synthetic data."""
import argparse
import hashlib
import json
from pathlib import Path
import sqlite3
import subprocess
import tempfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--previous-core", type=Path, required=True)
parser.add_argument("--current-core", type=Path, required=True)
parser.add_argument("--producer-commit", required=True)
parser.add_argument("--output", type=Path, required=True)
parser.add_argument("--write-fixtures", type=Path)
args = parser.parse_args()
args.previous_core = args.previous_core.resolve()
args.current_core = args.current_core.resolve()
args.output.mkdir(parents=True, exist_ok=True)


def invoke(binary, database, action, payload=None):
    process = subprocess.run([str(binary), str(database)], input=json.dumps({"action": action, "payload": payload}),
        capture_output=True, text=True)
    value = json.loads(process.stdout)
    assert process.returncode == 0 and "error" not in value, (action, value)
    return value["data"]


def observation(title, sold=True, included=True, price=30000):
    return {"title": title, "url": "https://example.com/compatibility-evidence", "soldOn": "2024-01-01",
        "priceCents": price, "shippingCents": 1000, "condition": "Tested working", "sold": sold, "included": included}


def lot(title):
    return {"id": None, "title": title, "url": "https://example.com/compatibility-lot", "source": "Community auction 🦆",
        "category": "Tools", "location": "Synthetic area", "endsAt": "2030-01-01T00:00:00Z", "condition": "Untested",
        "notes": "Original café inspection\nPickup not yet verified.", "bidCents": 1000, "estimateCents": 25000,
        "costs": {"premiumBps": 1300, "taxBps": 900, "paymentBps": 0, "inboundCents": 0, "travelCents": 500,
            "prepCents": 1000, "sellingFeeBps": 1200, "reserveBps": 500, "outboundCents": 1000, "fixedSellingCents": 50},
        "comparables": [observation("Included sale"), observation("Excluded sale", included=False, price=90000),
            observation("Asking context", sold=False, price=100000)]}


def restore(binary, database, value):
    text = json.dumps(value, ensure_ascii=False)
    preview = invoke(binary, database, "validate_backup", {"text": text})
    return invoke(binary, database, "restore_backup", {"text": text, "expectedRevision": preview["currentRevision"], "confirmReplace": True})


def preserved(actual, expected):
    for key in ["settings", "lots", "inventory"]:
        assert actual[key] == expected[key], key
    assert actual["auditEvents"][:len(expected["auditEvents"])] == expected["auditEvents"]


with tempfile.TemporaryDirectory(prefix="version-one-", dir=args.output.resolve()) as directory:
    root = Path(directory)
    previous_db = root / "previous.db"
    old = lambda action, payload=None: invoke(args.previous_core, previous_db, action, payload)
    old("settings", {"capitalCents": 200000, "lotCapCents": 35000, "minProfitCents": 6500, "minRoiBps": 4500})
    for title in ["Held legacy fixture", "Sold legacy loss fixture", "Watched legacy fixture"]:
        old("save_lot", lot(title))
    ids = {row["input"]["title"]: row["input"]["id"] for row in old("snapshot")["lots"]}
    old("watch", {"id": ids["Watched legacy fixture"], "watched": True})
    old("purchase", {"id": ids["Held legacy fixture"], "acquisitionCents": 5000})
    purchased = old("purchase", {"id": ids["Sold legacy loss fixture"], "acquisitionCents": 10000})
    sold_item = next(row for row in purchased["inventory"] if row["lotId"] == ids["Sold legacy loss fixture"])
    old("sell", {"id": sold_item["id"], "grossCents": 1000, "expenseCents": 2000})
    legacy = old("backup")
    assert legacy["formatVersion"] == 1
    with sqlite3.connect(f"file:{previous_db}?mode=ro", uri=True) as connection:
        assert connection.execute("PRAGMA user_version").fetchone()[0] == 1
        # sqlite's dump orders table names, so inventory can precede lots.
        # Disable checks only while loading this complete synthetic fixture.
        dump = "PRAGMA foreign_keys=OFF;\nPRAGMA user_version=1;\n" + "\n".join(connection.iterdump()) + "\nPRAGMA foreign_keys=ON;\n"
    # Reopen the original producer database with the new runner; nothing is reseeded.
    reopened = invoke(args.current_core, previous_db, "backup")
    assert reopened == legacy
    fresh = root / "current.db"
    restored = restore(args.current_core, fresh, legacy)
    assert restored["snapshot"]["availableCents"] == 184000
    preserved(invoke(args.current_core, fresh, "backup"), legacy)
    held = next(row for row in legacy["inventory"] if row["lotId"] == ids["Held legacy fixture"])
    original = next(row["input"]["notes"] for row in legacy["lots"] if row["input"]["id"] == held["lotId"])
    invoke(args.current_core, fresh, "inventory_notes", {"id": held["id"], "expectedNotes": original,
        "notes": "Candidate inspection 🦆\nStill awaiting pickup review."})
    candidate = invoke(args.current_core, fresh, "backup")
    assert candidate["formatVersion"] == 1 and candidate["auditEvents"][-1]["action"] == "save_lot"
    assert candidate["inventory"] == legacy["inventory"] and candidate["settings"] == legacy["settings"]
    older_target = root / "older-target.db"
    restore(args.previous_core, older_target, candidate)
    older_readback = invoke(args.previous_core, older_target, "backup")
    preserved(older_readback, candidate)
    assert invoke(args.current_core, older_target, "backup") == older_readback
    for database in [previous_db, fresh, older_target]:
        with sqlite3.connect(f"file:{database}?mode=ro", uri=True) as connection:
            assert connection.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
            assert connection.execute("PRAGMA foreign_key_check").fetchall() == []
    if args.write_fixtures:
        args.write_fixtures.mkdir(parents=True, exist_ok=True)
        (args.write_fixtures / "backup-v1-published-594275a.json").write_text(json.dumps(legacy, ensure_ascii=False, indent=2) + "\n")
        (args.write_fixtures / "workspace-v1-published-594275a.sql").write_text(dump)
    result = {"status": "passed", "producerCommit": args.producer_commit,
        "previousCoreSha256": hashlib.sha256(args.previous_core.read_bytes()).hexdigest(),
        "currentCoreSha256": hashlib.sha256(args.current_core.read_bytes()).hexdigest(),
        "checks": ["Published v1 workspace reopens without reseeding or logical changes", "Published v1 backup restores with exact records and original history",
            "New inventory notes preserve the v1 backup/audit vocabulary and ledger", "Published reader restores the candidate backup without dropping new notes or asking/excluded evidence",
            "Candidate reopens the older reader's restored file; all three SQLite files pass integrity and foreign-key checks"],
        "fixture": "Only synthetic isolated SQLite files; no owner database, provider request or credentials"}
    (args.output / "compatibility-report.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2), flush=True)
