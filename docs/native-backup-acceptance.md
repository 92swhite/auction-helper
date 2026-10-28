# Packaged Linux backup acceptance — 2026-10-28

Passed using the actual executable extracted from the Debian bundle built at
PR1 head `dcf8ab12812dd88a31e01953fe6e8a37a8f52880`. Production sources are unchanged
from the prior implementation `71e039a`. No package was installed, deployed or
released. No dependencies were installed and the owner's database was never read.

`CARGO_NET_OFFLINE=true npm run desktop -- build --bundles deb` built successfully.
`dpkg-deb -x` extracted the bundle locally. Tauri strips the packaged executable,
so its hash differs from the unstripped release binary; the test uses the
extracted executable, not a substitute browser or development server.

- Package SHA-256: `d7a85f7baf2626ee6c5a8113c75310653f9923937cfd00a525a4f057b53ed2a8`
- Extracted executable SHA-256: `834aa5e052d707a9fc9c31fc4a2673cdeb413dfb0257ccf890ba6288cc9625d4`

## Reproduction and results

Build the existing offline core fixture tool with `cargo build --offline --locked
-p auction-core`, then run `/usr/bin/python3 scripts/test-native-backup.py
<extracted-app> --core target/debug/auction-core --ui-tool /path/to/xdotool
--output .local/native-backup-qa/direct-acceptance`.

The harness creates its own Xvfb display, D-Bus session and XDG data, configuration,
cache, runtime and Downloads directories **before** starting desktop services.
It verifies GLib's download directory. Existing system Python GI/GTK/AT-SPI,
Xvfb, dbus-run-session, fusermount3 and xdotool are required; it installs nothing.
Only the test process group and its disposable document-portal mount are stopped.
Some desktop services can leave ignored disposable cache files during teardown.

Six acceptance checks passed, including actual packaged-process restart:

1. Open the actual GTK file chooser and cancel. The complete workspace remains
   byte-for-byte equal as a Rust JSON value.
2. Click Download backup in WebKit. The completed file in isolated Downloads
   exactly matches settings, three lots, watched state, two inventory entries
   (one sold), Unicode notes and audit history from the real core.
3. Add later work, select a valid backup via GTK from a path with spaces, review
   the displayed counts and cancel. All newer data remains.
4. Change criteria through a separate real SQLite connection while review is
   open. Confirmation rejects the stale preview with no mutation. Select afresh,
   confirm, compare restored records and verify the automatic recovery file
   contains the complete immediately preceding workspace.
5. Select malformed JSON through GTK. A visible error appears and all restored
   records remain unchanged.
6. Restart the extracted packaged executable, open Inventory and observe the
   restored item. Recheck the complete saved value, SQLite integrity and foreign
   keys.

Final command exited 0. No backend, file list or download was mocked. The CLI
only seeds synthetic data and independently checks the database; UI restore uses
the packaged app's real Rust IPC. Accessibility locates and scrolls controls;
native X11 mouse/keyboard events activate them and the chooser. WebDriver probes
did not display the HTML chooser, so they were not used as acceptance evidence.

`evidence/backup-restore/native-report.json` records checks and executable/tool
hashes. `native-preview.png` and `native-invalid.png` are captures of the actual
packaged app. Full local build/runtime logs remain in ignored
`.local/native-backup-qa/`. Desktop portal warnings about unavailable Xvfb/Wayland
services did not prevent the verified local file flow. No security permission,
CSP, credential, app capability or runtime sandbox was weakened.

This closes the Linux native chooser/download gap. Windows/macOS, physical touch
hardware and human accessibility/usability acceptance remain unverified. The
backup format remains unencrypted. PR1 stays open and unmerged for owner review.
