#!/usr/bin/env python3
"""Exercise the actual packaged GTK/WebKit backup flow on an isolated desktop.

Requires existing /usr/bin/python3 gi (Atspi/Gdk), Xvfb, dbus-run-session and
xdotool. A normal package launch exercises the native HTML file chooser.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import signal
import sqlite3
import subprocess
import sys
import tempfile
import time

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("application", type=Path)
parser.add_argument("--core", required=True, type=Path)
parser.add_argument("--ui-tool", required=True, type=Path)
parser.add_argument("--output", required=True, type=Path)
parser.add_argument("--fixture", type=Path, help=argparse.SUPPRESS)
args = parser.parse_args()
for key in ["application", "core", "ui_tool", "output"]:
    setattr(args, key, getattr(args, key).resolve())
for p in [args.application, args.core, args.ui_tool]:
    assert p.is_file() and os.access(p, os.X_OK), str(p)
args.output.mkdir(parents=True, exist_ok=True)

if args.fixture is None:
    (args.output / "native-report.json").unlink(missing_ok=True)
    (args.output / "failure.txt").unlink(missing_ok=True)
    with tempfile.TemporaryDirectory(prefix="auction-native-backup-", dir=args.output, ignore_cleanup_errors=True) as temporary:
        fixture = Path(temporary)
        for name in ["config", "downloads", "runtime"]:
            (fixture / name).mkdir(mode=0o700)
        (fixture / "config/user-dirs.dirs").write_text(f'XDG_DOWNLOAD_DIR="{fixture / "downloads"}"\n')
        env = dict(os.environ, XDG_DATA_HOME=str(fixture / "data"), XDG_CONFIG_HOME=str(fixture / "config"),
            XDG_CACHE_HOME=str(fixture / "cache"), XDG_RUNTIME_DIR=str(fixture / "runtime"), NO_AT_BRIDGE="0", GDK_BACKEND="x11")
        command = ["dbus-run-session", "--", "xvfb-run", "-a", "-s", "-screen 0 1600x1200x24",
            "/usr/bin/python3", str(Path(__file__).resolve()), str(args.application), "--core", str(args.core),
            "--ui-tool", str(args.ui_tool), "--output", str(args.output), "--fixture", str(fixture)]
        process = subprocess.Popen(command, env=env, start_new_session=True)
        result = process.wait()
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        # The document portal can leave its disposable FUSE mount after bus exit.
        subprocess.run(["fusermount3", "-u", str(fixture / "runtime/doc")], capture_output=True)
        raise SystemExit(result)

import gi
gi.require_version("Atspi", "2.0")
gi.require_version("Gdk", "3.0")
gi.require_version("GdkX11", "3.0")
from gi.repository import Atspi, Gdk, GdkX11

fixture = args.fixture.resolve()
db = fixture / "data/com.92swhite.auction-helper/auction-helper.db"
checks = []
app = None


def core(action, payload=None):
    result = subprocess.run([str(args.core), str(db)], input=json.dumps({"action": action, "payload": payload}),
        capture_output=True, text=True, check=True)
    return json.loads(result.stdout)["data"]


def nodes(node=None):
    if node is None:
        node = Atspi.get_desktop(0)
    yield node
    for i in range(node.get_child_count()):
        child = node.get_child_at_index(i)
        if child is not None:
            yield from nodes(child)


def visible(node):
    return node.get_state_set().contains(Atspi.StateType.SHOWING)


def find_button(name):
    return next((n for n in nodes() if n.get_role_name() in ["button", "push button"]
        and n.get_name() == name and n.get_state_set().contains(Atspi.StateType.VISIBLE)
        and n.get_state_set().contains(Atspi.StateType.ENABLED)), None)


def text():
    parts = []
    for n in nodes():
        if not visible(n):
            continue
        name = n.get_name()
        if name:
            parts.append(name)
        interface = n.get_text_iface()
        if interface:
            parts.append(Atspi.Text.get_text(interface, 0, -1))
    return "\n".join(parts)


def wait(condition, description, seconds=15):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if condition():
            return
        if app is not None and app.poll() is not None:
            raise AssertionError("Packaged application exited unexpectedly")
        time.sleep(.1)
    raise AssertionError(description + "; UI: " + text())


def click(name):
    wait(lambda: find_button(name) is not None, "Missing enabled button: " + name)
    node = find_button(name)
    component = node.get_component_iface()
    component.scroll_to(Atspi.ScrollType.ANYWHERE)
    time.sleep(.15)
    bounds = component.get_extents(Atspi.CoordType.SCREEN)
    assert bounds.width > 0 and bounds.height > 0 and bounds.x >= 0 and bounds.y >= 0, name
    subprocess.run([str(args.ui_tool), "mousemove", str(bounds.x + bounds.width // 2),
        str(bounds.y + bounds.height // 2), "click", "1"], check=True)


def source_summary(name):
    return next((n for n in nodes() if n.get_name().endswith(name + " Manual entry")
        and n.get_state_set().contains(Atspi.StateType.VISIBLE)), None)


def toggle_source(name):
    wait(lambda: source_summary(name) is not None, "Missing source summary: " + name)
    component = source_summary(name).get_component_iface()
    component.scroll_to(Atspi.ScrollType.ANYWHERE)
    time.sleep(.15)
    bounds = component.get_extents(Atspi.CoordType.SCREEN)
    assert bounds.width > 0 and bounds.height > 0 and bounds.x >= 0 and bounds.y >= 0
    subprocess.run([str(args.ui_tool), "mousemove", str(bounds.x + bounds.width // 2),
        str(bounds.y + bounds.height // 2), "click", "1"], check=True)


def toggle_evidence():
    def summary():
        return next((n for n in nodes() if n.get_name() == "Review comparable evidence (2)"
            and n.get_state_set().contains(Atspi.StateType.VISIBLE)), None)
    wait(lambda: summary() is not None, "Missing native evidence disclosure")
    component = summary().get_component_iface()
    component.scroll_to(Atspi.ScrollType.ANYWHERE)
    time.sleep(.15)
    bounds = component.get_extents(Atspi.CoordType.SCREEN)
    assert bounds.width > 0 and bounds.height > 0 and bounds.x >= 0 and bounds.y >= 0
    subprocess.run([str(args.ui_tool), "mousemove", str(bounds.x + bounds.width // 2),
        str(bounds.y + bounds.height // 2), "click", "1"], check=True)


def chooser_open():
    return any(n.get_role_name() == "file chooser" and visible(n) for n in nodes())


def choose(path=None):
    click("Choose backup file")
    wait(chooser_open, "Actual GTK file chooser did not appear")
    if path is None:
        subprocess.run([str(args.ui_tool), "key", "--clearmodifiers", "Escape"], check=True)
    else:
        subprocess.run([str(args.ui_tool), "key", "--clearmodifiers", "ctrl+l"], check=True)
        subprocess.run([str(args.ui_tool), "type", "--clearmodifiers", "--delay", "1", str(path)], check=True)
        subprocess.run([str(args.ui_tool), "key", "--clearmodifiers", "Return"], check=True)
    wait(lambda: not chooser_open(), "Actual GTK chooser did not close")


def capture(name):
    time.sleep(.25)
    window_id = int(subprocess.check_output([str(args.ui_tool), "search", "--onlyvisible", "--name", "^Auction Helper$"], text=True).splitlines()[0])
    window = GdkX11.X11Window.foreign_new_for_display(Gdk.Display.get_default(), window_id)
    image = Gdk.pixbuf_get_from_window(window, 0, 0, window.get_width(), window.get_height())
    image.savev(str(args.output / (name + ".png")), "png", [], [])
    (args.output / (name + "-text.txt")).write_text(text())


def start():
    global app
    app = subprocess.Popen([str(args.application)], stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    wait(lambda: find_button("Settings") is not None, "Packaged app did not open")


def stop():
    global app
    if app is not None:
        os.killpg(app.pid, signal.SIGTERM)
        app.wait(timeout=10)
        app = None
    wait(lambda: not any(n.get_name() == "auction-helper" for n in nodes()), "Old application accessibility tree remains")


def lot(title):
    return {"id": None, "title": title, "url": "https://example.com/native-fixture", "source": "Fictional native test",
        "category": "Tools", "location": "Synthetic area", "endsAt": "2030-01-01T00:00:00Z", "condition": "Tested",
        "notes": "Native 🦆 café fixture", "bidCents": 1000, "estimateCents": 30000,
        "costs": {"premiumBps": 0, "taxBps": 0, "paymentBps": 0, "inboundCents": 0, "travelCents": 0, "prepCents": 0,
            "sellingFeeBps": 0, "reserveBps": 500, "outboundCents": 0, "fixedSellingCents": 0},
        "comparables": [
            {"title": "Sold native comparable", "url": "https://example.com/native-sold", "soldOn": "2001-01-01",
                "priceCents": 23000, "shippingCents": 1000, "condition": "Tested working", "sold": True, "included": True},
            {"title": "Asking native comparable", "url": "https://example.com/native-asking", "soldOn": "2001-01-02",
                "priceCents": 500000, "shippingCents": 0, "condition": "Untested", "sold": False, "included": True}]}


# Both the application and all D-Bus-activated services inherit these disposable paths.
from gi.repository import GLib
assert Path(GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DOWNLOAD)) == fixture / "downloads"
for title in ["Sold native fixture", "Held native fixture", "Watched native fixture"]:
    core("save_lot", lot(title))
ids = {item["input"]["title"]: item["input"]["id"] for item in core("snapshot")["lots"]}
core("watch", {"id": ids["Watched native fixture"], "watched": True})
purchased = core("purchase", {"id": ids["Sold native fixture"], "acquisitionCents": 10000})
core("sell", {"id": purchased["inventory"][0]["id"], "grossCents": 20000, "expenseCents": 1500})
core("purchase", {"id": ids["Held native fixture"], "acquisitionCents": 5000})
before = core("backup")

with (args.output / "app.txt").open("w") as log:
    try:
        start()
        toggle_evidence()
        wait(lambda: find_button("Open evidence for comparable 1") is not None, "Native evidence did not expand")
        find_button("Open evidence for comparable 1").get_component_iface().scroll_to(Atspi.ScrollType.ANYWHERE)
        wait(lambda: "Sold · used in estimate" in text() and "2001-01-01" in text(), "Native evidence provenance missing")
        assert "Tested working" in text() and core("snapshot")["lots"][0]["analysis"]["saleCents"] == 24000
        assert core("backup") == before
        capture("native-evidence-review")
        checks.append("Native evidence disclosure shows sale date, condition, price and shipping; the real estimate is $240 and data is unchanged")
        toggle_evidence()
        wait(lambda: find_button("Open evidence for comparable 1") is None, "Native evidence did not collapse")
        assert core("backup") == before
        checks.append("Native evidence disclosure closes without opening a provider page or changing the workspace")
        click("Settings")
        toggle_source("eBay comparable evidence")
        wait(lambda: find_button("eBay Browse API") is not None, "Native source references did not expand")
        find_button("eBay Browse API").get_component_iface().scroll_to(Atspi.ScrollType.ANYWHERE)
        wait(lambda: "limited release" in text() and "2026-10-28" in text(), "Native source review text/date missing")
        assert "Browse results must not be treated as completed sales" in text()
        assert core("backup") == before
        capture("native-source-registry")
        checks.append("Native source disclosure shows dated eBay sold/browse distinction and unverified production access without mutating data")
        toggle_source("eBay comparable evidence")
        wait(lambda: find_button("eBay Browse API") is None, "Native source disclosure did not collapse")
        assert core("backup") == before
        checks.append("Native disclosure closes again; no reference is opened and the isolated workspace remains unchanged")
        choose()
        assert core("backup") == before
        checks.append("Actual GTK file-open Cancel preserves the packaged workspace")
        click("Download backup")
        downloaded = None
        def completed_download():
            global downloaded
            for path in (fixture / "downloads").iterdir():
                try:
                    if path.is_file() and json.loads(path.read_text()) == before:
                        downloaded = path
                        return True
                except (ValueError, UnicodeError):
                    pass
            return False
        wait(completed_download, "Native Blob download did not produce complete backup JSON")
        checks.append("Real packaged WebKit download exactly matches the Rust backup, including Unicode and audit history")
        selection = fixture / "backup files/saved copy.json"
        selection.parent.mkdir(); selection.write_bytes(downloaded.read_bytes())
        core("save_lot", lot("Added after native backup")); changed = core("backup")
        choose(selection)
        wait(lambda: "Lots: 3" in text() and find_button("Replace workspace") is not None, "Native selection did not reach review")
        capture("native-preview"); click("Cancel")
        assert core("backup") == changed
        checks.append("GTK selection of a path containing spaces reaches review; review Cancel preserves newer work")
        choose(selection)
        wait(lambda: find_button("Replace workspace") is not None, "Restore review missing")
        core("settings", dict(before["settings"], minProfitCents=before["settings"]["minProfitCents"] + 100))
        stale = core("backup"); click("Replace workspace")
        wait(lambda: "changed since preview" in text(), "Stale review was not refused")
        assert core("backup") == stale
        click("Cancel")
        prior_restore = core("backup")
        choose(selection)
        wait(lambda: find_button("Replace workspace") is not None, "Fresh restore review missing")
        click("Replace workspace")
        wait(lambda: "Previous workspace backup saved at" in text(), "Native restore confirmation missing")
        restored = core("backup")
        for key in ["settings", "lots", "inventory"]:
            assert restored[key] == before[key]
        recovery = list((db.parent / "backups").glob("*.json"))
        assert len(recovery) == 1 and json.loads(recovery[0].read_text()) == prior_restore
        checks.append("Stale review refuses replacement; fresh confirmation restores exact records and a complete prior recovery file")
        bad = fixture / "bad.json"; bad.write_text("not a backup")
        choose(bad)
        wait(lambda: "Invalid backup JSON" in text(), "Malformed backup error missing")
        assert core("backup") == restored
        capture("native-invalid")
        checks.append("Malformed file selected through GTK leaves the restored database unchanged")
        stop(); start()
        click("Inventory")
        wait(lambda: "Held native fixture" in text(), "Reopened packaged UI did not load restored inventory")
        assert core("backup") == restored
        with sqlite3.connect(db) as conn:
            assert conn.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
            assert conn.execute("PRAGMA foreign_key_check").fetchall() == []
        checks.append("A fresh packaged process reopens restored records; SQLite integrity and foreign keys pass")
        result = {"status": "passed", "applicationSha256": hashlib.sha256(args.application.read_bytes()).hexdigest(),
            "coreFixtureToolSha256": hashlib.sha256(args.core.read_bytes()).hexdigest(), "checks": checks,
            "downloadName": downloaded.name, "fixture": "Disposable XDG data/config/cache/runtime/Downloads, D-Bus and Xvfb; normal packaged WebKit/GTK, no backend mocks"}
        (args.output / "native-report.json").write_text(json.dumps(result, indent=2) + "\n")
        print(json.dumps(result, indent=2), flush=True)
    except Exception as error:
        (args.output / "failure.txt").write_text(repr(error) + "\n")
        if app is not None:
            try:
                capture("native-failure")
            except Exception:
                pass
        raise
    finally:
        stop()
