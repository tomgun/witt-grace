import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { getStore, useAppState, useTranslator } from './store.ts';

/** A native <dialog> with focus trapping by the browser; Escape closes it. */
export function Modal({
  open,
  onClose,
  title,
  children,
  testId,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  testId?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="action-dialog"
      data-testid={testId}
      onClose={onClose}
      aria-labelledby={`${testId}-title`}
    >
      <div className="dialog-inner">
        <h2 id={`${testId}-title`}>{title}</h2>
        {open ? children : null}
      </div>
    </dialog>
  );
}

export function NoticeBar() {
  const { notice } = useAppState();
  const t = useTranslator();
  if (!notice) return null;
  return (
    <div
      className={`notice notice-${notice.kind}`}
      role={notice.kind === 'error' ? 'alert' : 'status'}
      data-testid="notice"
    >
      <span>{notice.text}</span>
      <button
        type="button"
        className="btn quiet"
        onClick={() => getStore().notify(null)}
        aria-label={t('close')}
      >
        ×
      </button>
    </div>
  );
}
