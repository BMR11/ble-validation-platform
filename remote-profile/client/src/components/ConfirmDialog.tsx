import { useEffect, useRef } from 'react';
import { IconCancel, IconRemove } from './actionIcons';

type Props = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="confirm-backdrop" onMouseDown={onCancel}>
      <div
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="confirm-title">{title}</h2>
        <p id="confirm-message">{message}</p>
        <div className="row">
          <button
            ref={cancelRef}
            type="button"
            className="btn btn-ghost icon-btn"
            aria-label="Cancel"
            title="Cancel"
            onClick={onCancel}
            disabled={busy}
          >
            <IconCancel />
          </button>
          <button
            type="button"
            className="btn btn-danger icon-btn"
            aria-label={confirmLabel}
            title={confirmLabel}
            onClick={onConfirm}
            disabled={busy}
          >
            <IconRemove />
          </button>
        </div>
      </div>
    </div>
  );
}
