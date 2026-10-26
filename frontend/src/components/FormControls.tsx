import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export function ModalFrame({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current!;
    el.showModal();
    return () => el.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      aria-labelledby="modal-title"
    >
      <div className="modal-header">
        <h2 id="modal-title">{title}</h2>
        <button aria-label="Close dialog" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Amount({
  label,
  value,
  onChange,
  rate = false,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  rate?: boolean;
  max?: number;
}) {
  return (
    <Field label={`${label} (${rate ? "%" : "$"})`}>
      <input
        type="number"
        min="0"
        max={max ?? (rate ? 100 : 1000000)}
        step="0.01"
        required
        value={value / 100}
        onChange={(e) => onChange(Math.round(Number(e.target.value) * 100))}
      />
    </Field>
  );
}
