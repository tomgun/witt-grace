// Muutoshistoria (owner 2026-11-23): the shown diagram's changes and the project structure's, newest first. A
// press on a row goes to the state right after that change, undoing or redoing on the way; undone changes stay
// in the list, marked, until a new change is made.
import { Modal } from './dialogs.tsx';
import { getStore, useAppState, useTranslator } from './store.ts';

export function HistoryDialog() {
  const state = useAppState();
  const t = useTranslator();
  const store = getStore();
  const inSession = !!state.collab && state.collab.phase !== 'ended';
  // `state` changes with every step, so the list is read again whenever it does.
  const steps = store.historyList();
  const newestDone = steps.filter((s) => s.done).pop()?.step.seq ?? 0;
  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString(state.language, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  return (
    <Modal
      open
      onClose={() => store.openDialog(null)}
      title={t('historyDialogTitle')}
      id="historyDialog"
      testId="history-dialog"
      className="action-dialog history-dialog"
    >
      <p className="history-intro">{t(inSession ? 'historyInSession' : 'historyIntro')}</p>
      {inSession ? null : (
        <ol className="history-list" id="historyList" reversed>
          {[...steps].reverse().map(({ step, done }) => (
            <li key={step.seq}>
              <button
                type="button"
                className={`history-entry${done ? '' : ' undone'}`}
                data-seq={step.seq}
                data-scope={step.scope}
                aria-current={step.seq === newestDone ? 'step' : undefined}
                onClick={() => store.jumpTo(step.seq)}
              >
                <span className="history-what">
                  {step.scope === 'project' ? (
                    <span className="history-scope">{t('historyScopeProject')}</span>
                  ) : null}
                  {t(step.label.key)}
                  {step.label.detail ? <span className="history-detail">: {step.label.detail}</span> : null}
                </span>
                <span className="history-meta">
                  {step.seq === newestDone ? <strong>{t('historyNow')}</strong> : null}
                  {done ? null : <em>{t('historyUndone')}</em>}
                  <time dateTime={step.at}>{time(step.at)}</time>
                </span>
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              className="history-entry"
              id="historyStart"
              data-seq="0"
              aria-current={newestDone === 0 ? 'step' : undefined}
              onClick={() => store.jumpTo(0)}
            >
              <span className="history-what">{t('historyStart')}</span>
              <span className="history-meta">
                {newestDone === 0 ? <strong>{t('historyNow')}</strong> : null}
              </span>
            </button>
          </li>
        </ol>
      )}
      {!inSession && steps.length === 0 ? <p className="history-empty">{t('historyEmpty')}</p> : null}
      <div className="dialog-actions">
        <button
          type="button"
          className="btn primary"
          id="btnHistoryClose"
          onClick={() => store.openDialog(null)}
        >
          {t('close')}
        </button>
      </div>
    </Modal>
  );
}
