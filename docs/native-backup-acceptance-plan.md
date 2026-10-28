# Packaged native backup acceptance

Close PR1's Chromium-only file-flow gap using the built Debian package extracted
locally, never installed or deployed. Reuse existing GTK accessibility and X11
tooling on a dedicated Xvfb/D-Bus desktop. No production permissions, CSP,
credentials, app data or user desktop are changed.

The test creates its own XDG data/cache/configuration/runtime and download
directories, including user-dirs configuration before launching desktop services.
Seed fictional records through the real Rust CLI, then use actual WebKit buttons
and GTK file-open
dialogs for cancel, valid selection and malformed selection. Check a real backup
download's bytes; do not replace the native backend or substitute filesystem
results. Exercise HTML preview cancel, stale preview and confirmed replacement,
verify the automatic recovery file, restart the packaged app and check SQLite
integrity/foreign keys. Preserve hashes, screenshots and exact results.

Failure handling must stop only test-owned processes. No writes to the owner's
workspace or Downloads directory are permitted. A native export/import failure
is a product defect to fix within PR1, not a reason to claim acceptance from the
browser tests. WebDriver did not display the HTML file chooser; the final test
uses a normal package launch with accessibility-based discovery, scrolling and
native pointer/keyboard events. No automation session or backend mock is active.
Linux/Xvfb acceptance remains distinct from other operating
systems, physical touch hardware and human accessibility assessment.
