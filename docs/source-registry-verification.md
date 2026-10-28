# Source review catalog — local verification, 2026-10-28

This branch starts independently at backup PR1 head `594275a`. It adds a
read-only manual-source catalog and preserves custom source labels in the lot
editor. It adds no network adapter, account grant, authentication, credential,
schema, backup-format or financial-model change.

## Documentation provenance

These are documentation observations as of **2026-10-28**, not verified account
entitlements or a determination that arbitrary copying is permitted:

- [Dickensheet auction terms](https://www.dickensheet.com/terms-and-conditions):
  the public auction conditions were readable. No automated-data grant for this
  app was established by that review.
- [Public Surplus buyer registration](https://www.publicsurplus.com/sms/register/user):
  the page presents a buyer agreement. Its full text was not verified; the
  seller agreement found separately was not substituted for it. No registration,
  acceptance or account action occurred.
- [GovDeals site terms](https://www.govdeals.com/content/site-terms): the reading
  tool returned only the app shell. The full terms and app-specific permission
  remain unverified; no restriction or grant is inferred from search snippets.
- [eBay buying-application guide](https://developer.ebay.com/develop/get-started/get-started-on-a-buying-application):
  it lists item browsing and Marketplace Insights sales history separately, and
  describes the latter as a limited release. The [Browse guide](https://developer.ebay.com/api-docs/buy/static/api-browse.html)
  and [production requirements](https://developer.ebay.com/api-docs/buy/static/buy-requirements.html)
  were also checked. No actual account, keyset or production entitlement was
  inspected or obtained. Treating a Browse observation as an actual completed
  sale remains prohibited by this app's evidence model.
- HiBid and unspecified sources have no reviewed provider documentation in this
  slice; the UI explicitly says so. Generic manual input is an app capability,
  not a source-specific grant.

The shipped catalog records those limited checks, their dates and original
reference URLs. References launch through the existing external-browser command
only after a click. No source page is embedded or fetched on expansion.

## Verification

- Production TypeScript/Vite build, formatting, Rust formatting and diff checks
  passed using installed/cached dependencies; no installation occurred.
- The unchanged Rust core's **14 tests** passed. This independent branch does
  not include the separate schema-safety or inventory-notes branches and their
  additional tests.
- **Four Chromium journeys** passed against the real Rust/SQLite development
  bridge. The new journey checks keyboard Enter/Space disclosure access,
  documentation dates and unknown access, sold/asking separation, narrow-screen
  overflow, unchanged backups and zero external requests while reviewing
  sources, reference-launch failure/retry, and saving/reloading a Unicode custom
  source label. Reference-launch tests replace only `window.open`; no provider
  request is made and the database is real.
- An offline Debian QA bundle was built and extracted, **not installed or
  published**. The normal packaged WebKit/GTK app passed **eight native checks**:
  two source disclosure/data-preservation checks plus all six existing backup
  chooser/download/cancel/stale-review/recovery/restart checks. UI activation
  uses actual X11 events; only fixture seeding and independent database checks
  use the core CLI. All XDG locations, D-Bus and SQLite files are disposable.
- Desktop, 390px browser and native captures were inspected. The criteria panel
  stays compact while source details expand. No credential, permission, CSP or
  native capability was changed.

Curated evidence is in `evidence/source-registry/`, including the package/source
hash manifest. Full logs and the extracted test package remain ignored in
`.local/source-qa/`. Initial test failures were incorrect selectors (including
WebKit's combined summary label); final acceptance uses the unchanged behavior
with corrected selectors. The existing ordered browser journey shares only its
isolated test database; the new scenario runs after the prior three flows.

## Remaining gates

This is the manual catalog slice of the roadmap. Provider/account-specific
authorization evidence, permitted retention/rate limits, adapters and their
representative fixture tests remain future integration work. The catalog is
read-only and has no enable switch. Windows/macOS, physical mobile hardware and
human usability acceptance remain unverified. This local branch has no remote
PR or CI run; the published backup PR remains unchanged and unmerged.
