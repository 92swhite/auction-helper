import { useState } from "react";
import { ArrowDownToLine, Check } from "lucide-react";
import type { Settings } from "../../../schemas/domain";
import { Amount } from "./FormControls";
import { SourceRegistry } from "./SourceRegistry";

export function SettingsView({
  settings,
  busy,
  onSave,
  onExport,
}: {
  settings: Settings;
  busy: boolean;
  onSave: (s: Settings) => Promise<boolean>;
  onExport: () => void;
}) {
  const [draft, setDraft] = useState(settings);
  return (
    <div className="settings-grid">
      <section className="panel settings-panel">
        <h2>Buying criteria</h2>
        <p className="form-note">
          The per-lot cap includes acquisition, travel and preparation. Watched
          lots do not reserve capital; recorded purchases do.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void onSave(draft);
          }}
        >
          <div className="form-grid">
            {(
              [
                ["capitalCents", "Starting working capital", false],
                ["lotCapCents", "Maximum landed cost per lot", false],
                ["minProfitCents", "Minimum net profit", false],
                ["minRoiBps", "Minimum ROI", true],
              ] as const
            ).map(([key, label, rate]) => (
              <Amount
                key={key}
                label={label}
                rate={rate}
                max={rate ? 1000 : undefined}
                value={draft[key]}
                onChange={(v) => setDraft({ ...draft, [key]: v })}
              />
            ))}
          </div>
          <div className="form-actions">
            <button className="primary" disabled={busy}>
              Save criteria <Check size={15} />
            </button>
          </div>
        </form>
      </section>
      <section className="panel settings-panel">
        <h2>Sources & data</h2>
        <p className="form-note">
          No accounts or API keys are required. All source integrations are
          manual in this milestone.
        </p>
        <SourceRegistry />
        <button onClick={onExport}>
          <ArrowDownToLine size={16} /> Export workspace as JSON
        </button>
        <p className="form-note">
          This export is a readable analysis snapshot. Use Backup & restore
          below for a restorable copy, or close the app before copying its
          SQLite database.
        </p>
      </section>
    </div>
  );
}
