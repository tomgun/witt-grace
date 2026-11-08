// The review lens (`#reviewLensDialog`): whose reviews the views show. A read-only selection kept per document in this
// browser; it never changes the document, the ballots or the shared result (inv-review-vote-table §B).
import { useEffect, useRef } from 'react';
import { isAiProfile } from '../domain/index.ts';
import type { Disagreement } from '../domain/index.ts';
import type { MessageKey } from '../lib/i18n/i18n.ts';
import type { Frame } from './projection.ts';
import { getStore, useAppState, useTranslator } from './store.ts';

const STATUS_KEYS: Partial<Record<NonNullable<Disagreement['status']>, MessageKey>> = {
  contradictory: 'influenceStatusContradictory',
  neutral: 'influenceStatusNeutral',
  'mixed-neutral': 'influenceStatusMixedNeutral',
};

export function ReviewLensDialog({
  open,
  onClose,
  frame,
}: {
  open: boolean;
  onClose: () => void;
  frame: Frame;
}) {
  const state = useAppState();
  const t = useTranslator();
  const store = getStore();
  const { project, actorId } = state;
  const lens = frame.lens;
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  /** The prototype's `setReviewSelection`: exactly every human selected is the same as no filter. */
  const setSelection = (next: string[] | null) => {
    const valid =
      next === null ? null : [...new Set(next)].filter((id) => project.users.some((u) => u.id === id));
    const humans = project.users.filter((u) => !isAiProfile(u)).map((u) => u.id);
    const unfiltered =
      valid === null || (valid.length === humans.length && humans.every((id) => valid.includes(id)));
    store.setReviewIds(unfiltered ? null : valid);
  };
  const toggle = (id: string, checked: boolean) => {
    const next = new Set(lens.userIds);
    if (checked) next.add(id);
    else next.delete(id);
    setSelection([...next]);
  };
  const spreadText = (r: Disagreement) =>
    `${t(r.kind === 'credence' ? 'lensCredence' : 'lensInfluence')} · ${t('lensRange')}: ${r.rawSpread.toFixed(
      r.rawSpread % 1 ? 1 : 0
    )} ${r.units} · ${r.count} ${t('examplePeople')}`;
  const distribution = (r: Disagreement) =>
    t('influenceDistribution', {
      positive: r.positive ?? 0,
      negative: r.negative ?? 0,
      neutral: r.neutral ?? 0,
    });

  return (
    <dialog
      ref={ref}
      id="reviewLensDialog"
      className="review-lens-dialog"
      aria-labelledby="reviewLensTitle"
      data-testid="review-lens-dialog"
      onClose={onClose}
    >
      <div className="dialog-inner">
        <div className="dialog-heading">
          <h2 id="reviewLensTitle">{t('reviewLens')}</h2>
          <button
            type="button"
            id="btnCloseLens"
            className="btn icon-btn"
            aria-label={t('close')}
            onClick={onClose}
          >
            ×
          </button>
        </div>
        {open ? (
          <>
            <p>{t('reviewLensHelp')}</p>
            <div className="review-lens-actions">
              <button type="button" id="btnLensAll" className="btn quiet" onClick={() => setSelection(null)}>
                {t('lensAll')}
              </button>
              <button
                type="button"
                id="btnLensCurrent"
                className="btn quiet"
                onClick={() => setSelection([actorId])}
              >
                {t('lensCurrent')}
              </button>
            </div>
            <div id="lensPeople" className="lens-people">
              {project.users.map((u) => {
                const label = `${u.name}${isAiProfile(u) ? ' · AI' : ''}`;
                return (
                  <label key={u.id} className="lens-person">
                    <input
                      type="checkbox"
                      checked={lens.userIds.has(u.id)}
                      aria-label={label}
                      onChange={(e) => toggle(u.id, e.target.checked)}
                    />
                    <span>{label}</span>
                  </label>
                );
              })}
            </div>
            <div id="lensInsights" className="lens-insights">
              <h3>{t('lensDifferences')}</h3>
              <p className="influence-legend">{t('influenceStatusLegend')}</p>
              {!lens.disagreements.length ? (
                <p>{t('lensNotEnough')}</p>
              ) : (
                lens.disagreements.slice(0, 5).map((r) => {
                  const statusKey = r.kind === 'impact' && r.status ? STATUS_KEYS[r.status] : undefined;
                  return (
                    <div key={`${r.kind}:${r.nodeId}`} className="lens-insight-item">
                      <strong>{r.title}</strong>
                      <small>{spreadText(r)}</small>
                      {r.kind === 'impact' ? (
                        <>
                          {statusKey ? (
                            <span
                              className={`influence-status influence-status-${r.status}`}
                              title={distribution(r)}
                              aria-label={`${t(statusKey)}. ${distribution(r)}`}
                            >
                              {t(statusKey)}
                            </span>
                          ) : null}
                          <small>{distribution(r)}</small>
                        </>
                      ) : null}
                      <small>{r.details.join(' · ')}</small>
                    </div>
                  );
                })
              )}
              <h3>{t('lensSimilarity')}</h3>
              {!lens.comparisons.length ? (
                <p>{t('lensNotEnough')}</p>
              ) : (
                lens.comparisons.slice(0, 3).map((c) => (
                  <div key={`${c.a}+${c.b}`} className="lens-insight-item">
                    <strong>
                      {c.a} + {c.b}
                    </strong>
                    <small>
                      {t('lensMeanDifference')}: {(c.distance ?? 0).toFixed(1)} / 100 · {c.shared}{' '}
                      {t('lensShared')}
                    </small>
                  </div>
                ))
              )}
              <p>{t('lensNoInference')}</p>
            </div>
            <div className="dialog-actions">
              <button type="button" id="btnLensDone" className="btn primary" onClick={onClose}>
                {t('close')}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </dialog>
  );
}
