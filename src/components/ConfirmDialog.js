import React, { useEffect, useRef } from 'react';
import './ConfirmDialog.css';

/**
 * ConfirmDialog
 *
 * Replaces window.confirm. The native one announces itself as coming from the
 * website rather than the app, cannot be styled, and blocks the page while it
 * is open.
 *
 * Rendered only when there is something to confirm, so callers hold the
 * question in state and clear it when answered.
 *
 * Tapping the backdrop or pressing Escape counts as cancelling, which suits a
 * question whose cancel leaves everything as it was. Where cancelling throws
 * something away, pass dismissible={false} so only the buttons answer: a tap
 * that misses the panel on a phone should never be what decides it.
 */
const ConfirmDialog = ({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  dismissible = true,
  onConfirm,
  onCancel,
}) => {
  const confirmRef = useRef(null);

  useEffect(() => {
    confirmRef.current?.focus();
    if (!dismissible) return undefined;

    const onKeyDown = (e) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancel, dismissible]);

  return (
    <div className="confirm-backdrop" onClick={dismissible ? onCancel : undefined}>
      <div
        className="confirm-panel"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="confirm-title">{title}</h2>
        {message && <p className="confirm-message">{message}</p>}

        <div className="confirm-actions">
          <button type="button" className="confirm-btn" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            ref={confirmRef}
            className={`confirm-btn ${danger ? 'danger' : 'primary'}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
