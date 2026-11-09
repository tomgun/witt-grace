// "JSON-tuonnin tarkistus" (UI_INVENTORY S-11.20, inv-ai-contrib §0.3): the read-only preflight report every import
// shows instead of importing. The report text is the domain's `importReportText`, copyable for a language model or
// downloadable as `witt-tuonnin-korjausraportti.txt`; the open document and the file are never changed.
import { useRef, useState } from 'react';
import { inspectImport, importReportText } from '../domain/index.ts';
import type { ImportReport, InspectOptions } from '../domain/index.ts';
import { downloadText } from '../lib/files.ts';
import { Modal } from './dialogs.tsx';
import { getStore, useTranslator } from './store.ts';
import type { ModalRequest } from './store.ts';

/** The prototype's `showImportReport`: the report replaces the current modal request and stays until closed. */
export function showImportReport(report: ImportReport, filename = ''): void {
  getStore().openModal({ kind: 'importReport', report, filename });
}

/** A report with one issue, for failures the domain parser raises after the preflight (the prototype's `IMPORT`). */
export function singleIssueReport(
  format: ImportReport['format'],
  formatName: string,
  code: string,
  message: string,
  fix: string
): ImportReport {
  return {
    ok: false,
    format,
    formatName,
    issues: [{ severity: 'error', code, path: '$', message, fix }],
    parsed: null,
  };
}

/** The prototype's `showImportSizeError`: a file over the limit is refused before it is read. */
export function showImportSizeError(filename: string, limitMb = 5): void {
  showImportReport(
    singleIssueReport(
      'invalid',
      'Tiedoston koko',
      'TOO_LARGE',
      'Tiedosto ylittää suurimman sallitun koon (' + limitMb + ' Mt).',
      'Vie pienempi WITT-tiedosto tai jaa työ osiin.'
    ),
    filename
  );
}

/** The prototype's `inspectImport` wrapper: a failing report opens the dialog; the caller only continues on ok. */
export function inspectOrReport(raw: unknown, opts: InspectOptions, filename = ''): ImportReport {
  const report = inspectImport(raw, opts);
  if (!report.ok) showImportReport(report, filename);
  return report;
}

/** Every file input in the app refuses more than 5 MB; `pickTextFile` yields text, so the byte length is measured. */
export const FILE_SIZE_LIMIT = 5_000_000;
export const textByteLength = (text: string): number => new TextEncoder().encode(text).length;

export function ImportReportDialog({
  request,
}: {
  request: Extract<ModalRequest, { kind: 'importReport' }>;
}) {
  const t = useTranslator();
  const store = getStore();
  const { report, filename } = request;
  const [status, setStatus] = useState('');
  const [manual, setManual] = useState(false);
  const manualRef = useRef<HTMLTextAreaElement>(null);
  const text = importReportText(report, filename);
  const close = () => store.closeModal();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setStatus(t('importValidationCopied'));
    } catch {
      setStatus(t('importValidationCopyFailed'));
      setManual(true);
      setTimeout(() => {
        manualRef.current?.focus();
        manualRef.current?.select();
      }, 0);
    }
  };
  return (
    <Modal
      open
      onClose={close}
      title={t('importValidationTitle')}
      id="importReportDialog"
      testId="import-report-dialog"
      className="action-dialog import-report-dialog"
    >
      <p id="importReportSummary" className="inspector-note" role="status">
        {`${filename ? filename + ' · ' : ''}${report.formatName} · ${t('importValidationCount', {
          count: report.issues.length,
        })}`}
      </p>
      <div
        id="importReportIssues"
        className="import-report-issues"
        role="list"
        aria-label="Tiedostosta löydetyt virheet"
      >
        {report.issues.map((issue, i) => (
          <div key={i} className="import-report-entry" role="listitem">
            <small className="import-report-code">{issue.code}</small>
            <code className="import-report-location">
              {issue.path + (issue.line ? ` · rivi ${issue.line}, sarake ${issue.column}` : '')}
            </code>
            <strong>{issue.message}</strong>
            <p>{issue.fix}</p>
          </div>
        ))}
      </div>
      <p className="inspector-note">{t('importValidationNote')}</p>
      <p id="importReportStatus" className="inspector-note" role="status">
        {status}
      </p>
      {manual ? (
        <textarea
          id="importReportManual"
          ref={manualRef}
          readOnly
          rows={8}
          style={{ width: '100%' }}
          aria-label={t('importValidationTitle')}
          value={text}
        />
      ) : null}
      <div className="dialog-actions">
        <button type="button" id="btnImportReportCopy" className="btn primary" onClick={() => void copy()}>
          {t('importValidationCopy')}
        </button>
        <button
          type="button"
          id="btnImportReportDownload"
          className="btn quiet"
          onClick={() =>
            downloadText('witt-tuonnin-korjausraportti.txt', text + '\n', 'text/plain;charset=utf-8')
          }
        >
          {t('importValidationDownload')}
        </button>
        <button type="button" id="btnImportReportClose" className="btn quiet" onClick={close}>
          {t('close')}
        </button>
      </div>
    </Modal>
  );
}
