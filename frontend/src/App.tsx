import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bookmark,
  Check,
  ChevronRight,
  Clock3,
  Gavel,
  LayoutGrid,
  MapPin,
  Package,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Wallet,
  X,
} from "lucide-react";
import type { Snapshot } from "../../schemas/domain";
import { openExternal, request } from "./api";
import { emptyLot, samples } from "./sample";
import { money, pct, remaining } from "./format";
import type { Modal } from "./types";
import { Detail } from "./components/AnalysisPanel";
import { ModalFrame } from "./components/FormControls";
import { LotForm } from "./components/LotForm";
import { TransactionForm } from "./components/TransactionForm";
import { SettingsView } from "./components/SettingsView";

type Page = "Opportunities" | "Watchlist" | "Inventory" | "Settings";
export default function App() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [page, setPage] = useState<Page>("Opportunities");
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All lots");
  const [sort, setSort] = useState("profit");
  const [modal, setModal] = useState<Modal>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => {
    request<Snapshot>("snapshot")
      .then(setData)
      .catch((e) => setError(String(e.message)));
    const id = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(id);
  }, [notice]);
  async function mutate(action: string, payload: unknown, message: string) {
    setBusy(true);
    setError("");
    try {
      setData(await request<Snapshot>(action, payload));
      setNotice(message);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function loadSamples() {
    setBusy(true);
    setError("");
    try {
      for (const lot of samples())
        setData(await request<Snapshot>("save_lot", lot));
      setNotice("Three fictional examples added.");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  function exportData() {
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            { schemaVersion: 1, exportedAt: new Date().toISOString(), ...data },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "auction-helper-export.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const active = data?.lots.filter((l) => !l.acquired) ?? [];
  const watched = active.filter((l) => l.watched);
  const candidates = (page === "Watchlist" ? watched : active)
    .filter((l) =>
      `${l.input.title} ${l.input.source} ${l.input.location}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    )
    .filter((l) => filter !== "Meets targets" || l.analysis.meetsTargets)
    .filter(
      (l) =>
        filter !== "Needs review" ||
        !l.analysis.meetsTargets ||
        l.analysis.soldCount < 3,
    )
    .sort((a, b) =>
      sort === "ending"
        ? Date.parse(a.input.endsAt) - Date.parse(b.input.endsAt)
        : b.analysis.breakdown.profitCents - a.analysis.breakdown.profitCents,
    );
  const focused =
    candidates.find((l) => l.input.id === selected) ?? candidates[0];
  const inStock = data?.inventory.filter((i) => i.saleNetCents === null) ?? [];
  const nav = [
    { name: "Opportunities", icon: LayoutGrid },
    { name: "Watchlist", icon: Bookmark },
    { name: "Inventory", icon: Package },
    { name: "Settings", icon: Settings2 },
  ] as const;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage("Opportunities");
          }}
        >
          <span className="brand-mark">
            <Gavel size={23} />
          </span>
          <span>
            Auction<span className="brand-light">Helper</span>
            <small>THE RESELLER’S WORKSPACE</small>
          </span>
        </a>
        <div className="workspace">
          <span className="avatar">SW</span>
          <div>
            My workspace<small>Commerce City, Colorado</small>
          </div>
          <ChevronRight size={16} />
        </div>
        <p className="nav-label">WORKSPACE</p>
        <nav>
          {nav.map(({ name, icon: Icon }) => (
            <button
              key={name}
              className={page === name ? "nav-item active" : "nav-item"}
              onClick={() => {
                setPage(name);
                setQuery("");
                setFilter("All lots");
              }}
            >
              <Icon size={18} />
              {name}
              {name === "Watchlist" && (
                <span className="count">{watched.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="mode-icon">
            <ShieldCheck size={18} />
            <span>Manual mode</span>
            <span className="status-dot" />
          </div>
          <p>
            Your decisions. Your data.
            <br />
            No automatic bids or polling.
          </p>
          <div className="version">
            LOCAL-FIRST <span>v0.1.0</span>
          </div>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <ChevronRight size={14} />
            <span>{page}</span>
          </div>
          <span className="local-status">
            <span className="status-dot" /> Local SQLite storage
          </span>
        </header>
        <div className="content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">BUY WITH A CLEARER PICTURE</p>
              <h1>{page === "Opportunities" ? "Your sourcing desk" : page}</h1>
              <p className="subtitle">
                {page === "Opportunities"
                  ? "Find the margin. Understand the risk. Make your next move."
                  : page === "Watchlist"
                    ? "Your shortlist, with the numbers that matter."
                    : page === "Inventory"
                      ? "Track your capital from purchase to completed sale."
                      : "Set the guardrails for every opportunity."}
              </p>
            </div>
            <button
              className="primary"
              onClick={() => setModal({ type: "lot", lot: emptyLot() })}
              disabled={!data || busy}
            >
              <Plus size={17} /> Add auction
            </button>
          </div>
          {error && (
            <div className="error" role="alert">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div className="toast" role="status">
              <Check size={16} />
              {notice}
            </div>
          )}
          {!data ? (
            <div className="empty panel">
              <Wallet size={32} />
              <h2>
                {error ? "Unable to open workspace" : "Opening your workspace…"}
              </h2>
              <p>Your local database will be ready in a moment.</p>
              {error && (
                <button onClick={() => window.location.reload()}>Retry</button>
              )}
            </div>
          ) : (
            <>
              <div className="metrics">
                <Metric
                  label="Available capital"
                  value={money(data.availableCents)}
                  icon={<Wallet size={18} />}
                  note={`${money(data.settings.capitalCents)} starting capital`}
                  highlight
                />
                <Metric
                  label="Capital in inventory"
                  value={money(data.investedCents)}
                  icon={<Package size={18} />}
                  note={`${inStock.length} unsold ${inStock.length === 1 ? "item" : "items"}`}
                />
                <Metric
                  label="Realized profit"
                  value={money(data.realizedProfitCents)}
                  icon={<BarChart3 size={18} />}
                  note="After recorded selling expenses"
                />
                <Metric
                  label="On your watchlist"
                  value={String(watched.length).padStart(2, "0")}
                  icon={<Bookmark size={18} />}
                  note="Prices updated manually"
                />
              </div>
              {(page === "Opportunities" || page === "Watchlist") && (
                <>
                  <div className="guardrails">
                    <ShieldCheck size={17} />
                    <span>Your buying criteria</span>
                    <b>
                      {money(data.settings.lotCapCents)}
                      <small>max landed cost</small>
                    </b>
                    <b>
                      {money(data.settings.minProfitCents)}
                      <small>min profit</small>
                    </b>
                    <b>
                      {pct(data.settings.minRoiBps)}
                      <small>min ROI</small>
                    </b>
                    <button onClick={() => setPage("Settings")}>
                      Edit criteria <ArrowUpRight size={14} />
                    </button>
                  </div>
                  <div className="section-heading">
                    <div>
                      <h2>
                        {page === "Watchlist"
                          ? "Watched auctions"
                          : "Opportunity board"}{" "}
                        <span>{candidates.length}</span>
                      </h2>
                      <p>Manually entered lots · estimates before income tax</p>
                    </div>
                    <button className="quiet" onClick={exportData}>
                      <ArrowDownToLine size={16} /> Export data
                    </button>
                  </div>
                  <div className="toolbar">
                    <div className="tabs">
                      {["All lots", "Meets targets", "Needs review"].map(
                        (f) => (
                          <button
                            key={f}
                            className={filter === f ? "selected" : ""}
                            onClick={() => setFilter(f)}
                          >
                            {f}
                          </button>
                        ),
                      )}
                    </div>
                    <div className="search">
                      <Search size={16} />
                      <input
                        aria-label="Search auctions"
                        placeholder="Search auctions…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </div>
                    <div className="sort">
                      <SlidersHorizontal size={16} />
                      <select
                        aria-label="Sort auctions"
                        value={sort}
                        onChange={(e) => setSort(e.target.value)}
                      >
                        <option value="profit">Highest profit</option>
                        <option value="ending">Ending soon</option>
                      </select>
                    </div>
                  </div>
                  {candidates.length === 0 ? (
                    <div className="empty panel">
                      <div className="empty-icon">
                        <Gavel size={32} />
                      </div>
                      <p className="eyebrow">
                        EVERY GOOD FLIP STARTS WITH RESEARCH
                      </p>
                      <h2>
                        {active.length === 0
                          ? "Your next opportunity starts here"
                          : "No auctions in this view"}
                      </h2>
                      <p>
                        Add a lot, enter its costs, and see what you can afford
                        to bid.
                        <br />
                        Keep the source and your comparable evidence together.
                      </p>
                      <button
                        className="primary"
                        onClick={() =>
                          setModal({ type: "lot", lot: emptyLot() })
                        }
                      >
                        <Plus size={16} /> Add your first auction
                      </button>
                      {data.lots.length === 0 && (
                        <button
                          className="sample-button"
                          disabled={busy}
                          onClick={loadSamples}
                        >
                          Explore with fictional examples{" "}
                          <ArrowRight size={15} />
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="board">
                      <section className="lots panel">
                        <div className="list-head">
                          <span>AUCTION / LOCATION</span>
                          <span>EXPECTED PROFIT</span>
                        </div>
                        {candidates.map((l) => (
                          <div
                            key={l.input.id}
                            className={`lot-row ${focused?.input.id === l.input.id ? "focused" : ""}`}
                          >
                            <button
                              className="lot-select"
                              onClick={() => setSelected(l.input.id)}
                            >
                              <div
                                className={`lot-icon ${l.input.category === "Tools" ? "amber" : ""}`}
                              >
                                <Package size={24} />
                              </div>
                              <div className="lot-summary">
                                <span className="source">{l.input.source}</span>
                                <h3>{l.input.title}</h3>
                                <span className="location">
                                  <MapPin size={12} />
                                  {l.input.location}
                                </span>
                                <div className="lot-meta">
                                  <span>
                                    <Clock3 size={12} />
                                    {remaining(l.input.endsAt)}
                                  </span>
                                  <span
                                    className={`badge ${l.analysis.meetsTargets ? "green" : "muted"}`}
                                  >
                                    {l.analysis.meetsTargets
                                      ? "Meets targets"
                                      : "Below targets"}
                                  </span>
                                </div>
                              </div>
                              <div className="lot-figures">
                                <strong
                                  className={
                                    l.analysis.breakdown.profitCents > 0
                                      ? "positive"
                                      : ""
                                  }
                                >
                                  {money(l.analysis.breakdown.profitCents)}
                                </strong>
                                <span>
                                  {pct(l.analysis.breakdown.roiBps)} ROI
                                </span>
                                <small>Bid {money(l.input.bidCents)}</small>
                              </div>
                            </button>
                            <button
                              className={`watch-button ${l.watched ? "watching" : ""}`}
                              title={
                                l.watched
                                  ? "Remove from watchlist"
                                  : "Add to watchlist"
                              }
                              aria-label={`${l.watched ? "Unwatch" : "Watch"} ${l.input.title}`}
                              disabled={busy}
                              onClick={() =>
                                mutate(
                                  "watch",
                                  { id: l.input.id, watched: !l.watched },
                                  l.watched
                                    ? "Removed from watchlist."
                                    : "Added to watchlist.",
                                )
                              }
                            >
                              <Bookmark
                                size={17}
                                fill={l.watched ? "currentColor" : "none"}
                              />
                            </button>
                          </div>
                        ))}
                        <div className="list-footer">
                          <ShieldCheck size={14} /> All recommendations use your
                          current capital and criteria.
                        </div>
                      </section>
                      {focused && (
                        <Detail
                          lot={focused}
                          busy={busy}
                          onEdit={() =>
                            setModal({ type: "lot", lot: focused.input })
                          }
                          onPurchase={() =>
                            setModal({ type: "purchase", lot: focused })
                          }
                          onOpen={() =>
                            openExternal(focused.input.url).catch((e) =>
                              setError(String(e)),
                            )
                          }
                        />
                      )}
                    </div>
                  )}
                </>
              )}
              {page === "Inventory" && (
                <section className="panel inventory">
                  <div className="section-heading">
                    <div>
                      <h2>Purchase to payout</h2>
                      <p>
                        Actual costs are recorded separately from analysis
                        estimates.
                      </p>
                    </div>
                    <button className="quiet" onClick={exportData}>
                      <ArrowDownToLine size={16} /> Export data
                    </button>
                  </div>
                  {data.inventory.length === 0 ? (
                    <div className="empty">
                      <Package size={32} />
                      <h2>No inventory yet</h2>
                      <p>
                        Open an auction and choose “Record purchase” after you
                        win.
                      </p>
                    </div>
                  ) : (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>ITEM</th>
                            <th>STATUS</th>
                            <th>ACQUISITION</th>
                            <th>NET PROCEEDS</th>
                            <th>PROFIT</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {data.inventory.map((i) => (
                            <tr key={i.id}>
                              <td>
                                <strong>{i.title}</strong>
                                <small>
                                  {new Date(i.purchasedAt).toLocaleDateString()}
                                </small>
                              </td>
                              <td>
                                <span
                                  className={`badge ${i.soldAt ? "green" : "muted"}`}
                                >
                                  {i.soldAt ? "Sold" : "Purchased"}
                                </span>
                              </td>
                              <td>{money(i.acquisitionCents)}</td>
                              <td>
                                {i.saleNetCents === null
                                  ? "—"
                                  : money(i.saleNetCents)}
                              </td>
                              <td>
                                {i.saleNetCents === null
                                  ? "—"
                                  : money(i.saleNetCents - i.acquisitionCents)}
                              </td>
                              <td>
                                {!i.soldAt && (
                                  <button
                                    onClick={() =>
                                      setModal({ type: "sale", item: i })
                                    }
                                  >
                                    Record sale <ArrowRight size={14} />
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              )}
              {page === "Settings" && (
                <SettingsView
                  settings={data.settings}
                  busy={busy}
                  onSave={(s) =>
                    mutate("settings", s, "Buying criteria saved.")
                  }
                  onExport={exportData}
                />
              )}
              <footer>
                <span>
                  <ShieldCheck size={13} /> Private by default. Stored on this
                  device.
                </span>
                <span>Built for considered decisions.</span>
              </footer>
            </>
          )}
        </div>
      </main>
      {modal && (
        <ModalFrame
          title={
            modal.type === "lot"
              ? modal.lot.id
                ? "Edit auction & evidence"
                : "Add an auction"
              : modal.type === "purchase"
                ? "Record an actual purchase"
                : "Record a completed sale"
          }
          onClose={() => !busy && setModal(null)}
        >
          {modal.type === "lot" ? (
            <LotForm
              initial={modal.lot}
              busy={busy}
              onSave={async (l) => {
                if (
                  await mutate(
                    "save_lot",
                    l,
                    "Auction saved and analysis updated.",
                  )
                )
                  setModal(null);
              }}
            />
          ) : (
            <TransactionForm
              modal={modal}
              busy={busy}
              onSave={async (p) => {
                if (
                  await mutate(
                    modal.type === "purchase" ? "purchase" : "sell",
                    p,
                    modal.type === "purchase"
                      ? "Purchase added to inventory."
                      : "Sale recorded and capital updated.",
                  )
                )
                  setModal(null);
              }}
            />
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </ModalFrame>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  note,
  icon,
  highlight = false,
}: {
  label: string;
  value: string;
  note: string;
  icon: ReactNode;
  highlight?: boolean;
}) {
  return (
    <div className={`metric ${highlight ? "highlight" : ""}`}>
      <div className="metric-label">
        {label}
        {icon}
      </div>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}
