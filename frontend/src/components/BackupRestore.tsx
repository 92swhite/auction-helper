import { useRef, useState } from "react";
import type {
  BackupPreview,
  RestoreResult,
  Snapshot,
} from "../../../schemas/domain";
import { request } from "../api";
import { money } from "../format";
import { ModalFrame } from "./FormControls";

export function BackupRestore({
  onRestored,
}: {
  onRestored: (data: Snapshot) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{
    text: string;
    name: string;
    preview: BackupPreview;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function download() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const backup = await request<unknown>("backup");
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(backup)], { type: "application/json" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `auction-helper-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function choose(file: File) {
    setBusy(true);
    setError("");
    setNotice("");
    setPending(null);
    try {
      if (file.size > 1_000_000)
        throw new Error("Backup exceeds the 1 MB limit.");
      const text = new TextDecoder("utf-8", { fatal: true }).decode(
        await file.arrayBuffer(),
      );
      const preview = await request<BackupPreview>("validate_backup", { text });
      setPending({ text, name: file.name, preview });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  async function restore() {
    if (!pending) return;
    setBusy(true);
    setError("");
    try {
      const result = await request<RestoreResult>("restore_backup", {
        text: pending.text,
        expectedRevision: pending.preview.currentRevision,
        confirmReplace: true,
      });
      onRestored(result.snapshot);
      setPending(null);
      setNotice(
        `Workspace restored. Previous workspace backup saved at ${result.recoveryPath}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel settings-panel backup-panel">
      <h2>Backup & restore</h2>
      <p className="form-note">
        Save lots, comparable evidence, buying criteria, inventory and history
        in a local backup file. Keep the file private: it contains your
        workspace notes.
      </p>
      <div className="form-actions">
        <button disabled={busy} onClick={download}>
          Download backup
        </button>
        <button disabled={busy} onClick={() => input.current?.click()}>
          Choose backup file
        </button>
      </div>
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        aria-label="Backup file"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void choose(file);
        }}
      />
      <p className="form-note">
        Backups support up to 1 MB. You will review a file before replacing this
        workspace. A recovery copy is saved automatically before replacement.
      </p>
      {!pending && error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="form-note recovery-note" role="status">
          {notice}
        </p>
      )}
      {pending && (
        <ModalFrame
          title="Restore workspace"
          onClose={() => {
            if (!busy) {
              setPending(null);
              setError("");
            }
          }}
        >
          <p>
            <strong>{pending.name}</strong>
          </p>
          <p>
            Lots: {pending.preview.lotCount} · Inventory:{" "}
            {pending.preview.inventoryCount} ({pending.preview.soldCount} sold)
            · History entries: {pending.preview.auditCount}
          </p>
          <p>
            Available capital after restore:{" "}
            <strong>{money(pending.preview.availableCents)}</strong>
          </p>
          {pending.preview.stagesResetToUnreviewed && (
            <p className="form-note">
              This version-one backup has no operational stages. All imported
              items will begin Unreviewed, including sold items whose financial
              Sold status is preserved.
            </p>
          )}
          <p>
            This replaces the current workspace. A complete copy of the current
            workspace will be saved locally first. Keep your downloaded backup
            as a separate copy.
          </p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button
              disabled={busy}
              onClick={() => {
                setPending(null);
                setError("");
              }}
            >
              Cancel
            </button>
            <button className="primary" disabled={busy} onClick={restore}>
              {busy ? "Restoring…" : "Replace workspace"}
            </button>
          </div>
        </ModalFrame>
      )}
    </section>
  );
}
