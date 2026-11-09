// "AI:n arviot ja päätösvaihtoehdot" (UI_INVENTORY S-11.25, inv-ai-contrib §D): one AI assessor's own counts and
// option ranking from the domain's `assessorSummary`, never mixed into the human index. "Näytä AI:n näkökulma puussa"
// switches the view to that assessor's personal perspective; the editing profile stays, so the banner appears.
import { useEffect, useMemo, useState } from 'react';
import { assessorSummary, isAiProfile, rootNode } from '../domain/index.ts';
import type { FeasibilityStatus } from '../domain/index.ts';
import { resultText, viewedAssessorId } from './derive.ts';
import { Modal } from './dialogs.tsx';
import { getStore, useAppState, useTranslator } from './store.ts';
import type { MessageKey } from '../lib/i18n/i18n.ts';

const FEASIBILITY_KEY: Record<FeasibilityStatus, MessageKey> = {
  feasible: 'feasibility_feasible',
  blocked: 'feasibility_blocked',
  unresolved: 'feasibility_unresolved',
};

export function AiResultsDialog() {
  const state = useAppState();
  const t = useTranslator();
  const store = getStore();
  const { project, view, actorId } = state;
  const ais = project.users.filter((u) => isAiProfile(u));
  const viewed = viewedAssessorId(project, view, actorId);
  const [chosen, setChosen] = useState(() =>
    ais.some((a) => a.id === viewed) ? viewed : (ais[0]?.id ?? '')
  );
  const [highlight, setHighlight] = useState(!!view.highlightOptions);
  const none = ais.length === 0;
  useEffect(() => {
    // The toolbar button only exists with an AI profile; a stale open request gets the prototype's notice.
    if (none) {
      store.openDialog(null);
      store.showMessage(t('aiNoAssessors'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [none]);
  const id = ais.some((a) => a.id === chosen) ? chosen : (ais[0]?.id ?? null);
  const summary = useMemo(() => (id ? assessorSummary(project, id) : null), [project, id]);
  const decision = project.mode === 'decision';
  const close = () => store.openDialog(null);
  const showPerspective = () => {
    if (!id) return;
    store.setView({
      indexMode: 'personal',
      viewAssessorId: id,
      workflow: 'evaluate',
      layers: { ...view.layers, index: true, assessments: true },
      highlightOptions: decision && highlight,
    });
    store.select((rootNode(project) as { id: string }).id);
    close();
  };
  if (!summary || !id) return null;
  const total = summary.credenceReviews + summary.primaryReviews + summary.secondaryReviews;
  return (
    <Modal
      open
      onClose={close}
      title={t('aiAssessmentsTitle')}
      id="aiResultsDialog"
      testId="ai-results-dialog"
      className="action-dialog ai-results-dialog"
      heading={false}
    >
      <p>{t('aiReviewIsolation')}</p>
      <label htmlFor="aiResultsAssessorSelect">{t('aiReviewerLabel')}</label>
      <select id="aiResultsAssessorSelect" value={id} onChange={(e) => setChosen(e.target.value)}>
        {ais.map((ai) => (
          <option key={ai.id} value={ai.id}>
            {ai.name}
          </option>
        ))}
      </select>
      <p id="aiResultsCounts" role="status">
        {t('aiReviewCounts', {
          claims: summary.credenceReviews,
          relations: summary.primaryReviews,
          links: summary.secondaryReviews,
        })}
      </p>
      <p id="aiResultsEmpty" hidden={total > 0}>
        {t('aiNoImportedRatings')}
      </p>
      <h3 id="aiResultsRankingHeader" hidden={!decision}>
        {t('aiOptionRankingTitle')}
      </h3>
      <div id="aiResultsRanking" className="ai-assessor-ranking">
        {summary.rows.map((row) => (
          <div
            key={row.node.id}
            className={`ai-assessor-option${summary.leadingIds.includes(row.node.id) ? ' ai-leading-option' : ''}`}
          >
            <strong>{row.node.title}</strong>
            <span className="ai-option-score">
              {row.reviewedPrimary === 0 ? '—' : resultText(row.node, row)}
            </span>
            <small>
              {row.feasibility.status !== 'feasible'
                ? t(FEASIBILITY_KEY[row.feasibility.status])
                : !row.complete
                  ? t('personalRankingIncomplete')
                  : row.reviewedPrimary === 0
                    ? t('aiOptionNoReviews')
                    : t('aiOptionComplete')}
            </small>
          </div>
        ))}
        {!summary.rows.length ? <p>{t('aiNoOptions')}</p> : null}
      </div>
      <p id="aiResultsRankingHint" className="inspector-note">
        {summary.leadingIds.length ? t('aiRankingHint') : t('aiRankingUnavailable')}
      </p>
      <label className="ai-highlight-control">
        <input
          id="aiResultsHighlight"
          type="checkbox"
          checked={highlight}
          disabled={!decision}
          onChange={(e) => setHighlight(e.target.checked)}
        />
        <span>{t('highlightTopOptions')}</span>
      </label>
      <div className="dialog-actions">
        <button id="btnAIResultsShow" type="button" className="btn primary" onClick={showPerspective}>
          {t('aiShowInTree')}
        </button>
        <button id="btnAIResultsClose" type="button" className="btn quiet" onClick={close}>
          {t('close')}
        </button>
      </div>
    </Modal>
  );
}
