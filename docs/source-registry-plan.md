# Source capability registry — local review slice

The source list currently says only “Manual entry”. Replace it with a shared,
read-only catalog that explains the available workflow, dated documentation,
unverified account access and the evidence still needed for an adapter.

This branch starts at the published backup PR head `594275a`; it does not depend
on the separate schema or inventory branches. It stays local for review.

## Acceptance

- Settings distinguishes manual auction input, manual resale evidence and
  unavailable automation. A document review is never presented as an account
  grant, or as permission for arbitrary copying.
- eBay browsing and sold-history research remain separate. No API, source fetch,
  credentials, monitoring, bidding or publishing is added.
- Known auction choices come from the same registry. Existing custom source
  labels survive editing and saving unchanged.
- References open only after a deliberate click, through the existing external
  browser command, with visible failure feedback.
- Verify the actual manual workflow and absence of automatic external requests
  with the Rust/SQLite browser bridge, including a narrow layout and keyboard
  access. Check the packaged native presentation using isolated fixture data.

Fixture-based *network adapter* acceptance remains future work: there is no
network adapter to test in this slice. Each future adapter needs provider/account
authorization, permitted scope/retention, provenance and representative fixtures
before enabling it. Public documentation alone does not establish that grant.
