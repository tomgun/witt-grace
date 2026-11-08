import { decisionRanking, decisionRankingForAssessor } from '../domain/index.ts';
import type { Scores } from '../domain/index.ts';
import { balanceText } from './format.ts';
import { getStore, useAppState, useTranslator } from './store.ts';

/** Options compared for the decision root: feasibility first, then the balance; never a recommendation (UX-D04). */
export function DecisionOverview({ scores }: { scores: Scores }) {
  const state = useAppState();
  const t = useTranslator();
  const store = getStore();
  const { project } = state;
  const personal = state.view.viewpoint === 'personal';
  const rows = personal
    ? decisionRankingForAssessor(project, state.actorId, scores)
    : decisionRanking(project, scores);
  return (
    <section className="options-overview" aria-label={t('optionsReview')} data-testid="options-overview">
      <h3>{t('optionsReview')}</h3>
      {rows.length === 0 ? <p className="inspector-note">{t('optionsEmpty')}</p> : null}
      <ol className="option-ranking">
        {rows.map((row) => (
          <li key={row.node.id} data-testid={`ranking-${row.node.id}`}>
            <button type="button" className="btn quiet" onClick={() => store.select(row.node.id)}>
              {row.node.title}
            </button>
            <span
              className={`feasibility feasibility-${row.feasibility.status}`}
              title={row.feasibility.gates
                .map((g) => `${g.title}: ${t(`feasibility_${g.status}`)}`)
                .join(' · ')}
            >
              {row.feasibility.status === 'feasible'
                ? t('feasibility_met')
                : row.feasibility.status === 'blocked'
                  ? t('feasibility_unmet')
                  : t('feasibility_unknown')}
            </span>
            <strong>{balanceText(row.balance)}</strong>
            {row.incomplete ? <small> · {t('balanceIncomplete')}</small> : null}
            {'preferenceScore' in row && row.preferenceScore !== null ? (
              <small> · {row.preferenceScore.toFixed(1)}/100</small>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
