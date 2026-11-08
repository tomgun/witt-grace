import { useState } from 'react';
import { isAiProfile, optionPreference, optionPreferenceForRound } from '../domain/index.ts';
import type { Scores } from '../domain/index.ts';
import { newId } from '../lib/providers.ts';
import { Modal } from './dialogs.tsx';
import { balanceText } from './format.ts';
import { getStore, useAppState, useTranslator } from './store.ts';

/** The decision ballot: optional, separate from the argument balance, weights frozen per round (V-01…V-04). */
export function VoteDialog({
  open,
  onClose,
  scores,
}: {
  open: boolean;
  onClose: () => void;
  scores: Scores;
}) {
  const state = useAppState();
  const t = useTranslator();
  const store = getStore();
  const { project, actorId } = state;
  const [drafts, setDrafts] = useState<Record<string, number>>({});
  const [hideResults, setHideResults] = useState(true);
  const [anonymous, setAnonymous] = useState(false);
  const round = project.votingRound;
  const me = project.users.find((u) => u.id === actorId);
  const owner = me?.role === 'owner';
  const isOpen = round?.status === 'open';
  const closed = round?.status === 'closed';
  const options = project.nodes.filter((n) => n.relation === 'option');
  const roundOptions = round ? options.filter((n) => round.optionIds.includes(n.id)) : options;
  const canVote = isOpen && !!me && !isAiProfile(me) && me.role !== 'viewer';
  const resultText = (id: string) => {
    const s = scores.get(id);
    return `${balanceText(s?.balance ?? null)}${s?.incomplete ? ' †' : ''}`;
  };
  const start = () => {
    if (project.ballots.length && !window.confirm(t('voteOldBallotsIncluded'))) return;
    if (closed && !window.confirm(t('voteStartNewConfirm'))) return;
    const auditIds = Array.from({ length: 1 + project.ballots.length }, () => newId());
    store.dispatch({ type: 'round.start', id: newId(), auditIds, anonymous, hideResults });
  };
  const end = () => {
    if (!window.confirm(t('voteEndConfirm'))) return;
    store.dispatch({ type: 'round.close', userId: actorId, auditId: newId() });
  };
  return (
    <Modal open={open} onClose={onClose} title={t('votingButton')} testId="vote-dialog">
      <p className="inspector-note">{t('voteLocalWarning')}</p>
      <p role="status" data-testid="vote-status">
        {t(!round ? 'voteStatusDraft' : isOpen ? 'voteStatusOpen' : 'voteStatusClosed')}
      </p>
      {!round || closed ? (
        <div className="vote-settings">
          <label>
            <span>{t('voteWeighting')}</span>
            <select
              data-testid="vote-weighting"
              value={project.settings.voteWeighting}
              disabled={!owner}
              onChange={(e) =>
                store.dispatch({
                  type: 'project.setVoteWeighting',
                  weighting: e.target.value as 'equal' | 'shares',
                })
              }
            >
              <option value="equal">{t('voteEqual')}</option>
              <option value="shares">{t('voteShares')}</option>
            </select>
          </label>
          <label className="vote-check">
            <input type="checkbox" checked={hideResults} onChange={(e) => setHideResults(e.target.checked)} />{' '}
            <span>{t('voteHideResults')}</span>
          </label>
          <label className="vote-check">
            <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />{' '}
            <span>{t('voteAnonymous')}</span>
          </label>
          <p className="inspector-note">{t('voteWeightsHint')}</p>
          <div className="dialog-actions">
            <button
              type="button"
              className="btn primary"
              data-testid="vote-start"
              disabled={!owner || options.length < 2}
              onClick={start}
            >
              {t('voteStart')}
            </button>
          </div>
        </div>
      ) : (
        <div className="dialog-actions">
          <button
            type="button"
            className="btn primary"
            data-testid="vote-end"
            disabled={!owner}
            onClick={end}
          >
            {t('voteEnd')}
          </button>
        </div>
      )}
      <h3>{t('voteBallots')}</h3>
      {!round ? (
        <div>
          <p className="inspector-note">{t('voteStartHint')}</p>
          {options.map((option) => (
            <p key={option.id} className="vote-argument-result" title={t('voteArgumentResultHint')}>
              <strong>{option.title} · </strong>
              {t('voteArgumentResult', { score: resultText(option.id) })}
            </p>
          ))}
        </div>
      ) : (
        roundOptions.map((option) => {
          const current = project.ballots.find((b) => b.optionId === option.id && b.userId === actorId);
          const draft = drafts[option.id];
          const value = draft ?? current?.preference ?? 50;
          return (
            <div key={option.id} className="vote-option-row" data-testid={`vote-row-${option.id}`}>
              <label htmlFor={`vote-${option.id}`}>{option.title}</label>
              <small className="vote-argument-result" title={t('voteArgumentResultHint')}>
                {t('voteArgumentResult', { score: resultText(option.id) })}
              </small>
              <input
                id={`vote-${option.id}`}
                data-testid={`vote-slider-${option.id}`}
                type="range"
                min={0}
                max={100}
                step={1}
                value={value}
                disabled={!canVote}
                onChange={(e) => setDrafts({ ...drafts, [option.id]: Number(e.target.value) })}
              />
              <output data-testid={`vote-value-${option.id}`}>
                {draft !== undefined
                  ? `${draft}/100 · ${t('voteDraftUnsaved')}`
                  : current
                    ? `${current.preference}/100`
                    : t('notAssessed')}
              </output>
              <div className="vote-option-actions">
                <button
                  type="button"
                  className="btn primary"
                  data-testid={`vote-save-${option.id}`}
                  disabled={!canVote}
                  onClick={() => {
                    if (
                      store.dispatch({
                        type: 'ballot.cast',
                        id: newId(),
                        auditId: newId(),
                        optionId: option.id,
                        userId: actorId,
                        preference: value,
                      })
                    ) {
                      const rest = { ...drafts };
                      delete rest[option.id];
                      setDrafts(rest);
                    }
                  }}
                >
                  {t('voteSave')}
                </button>
                <button
                  type="button"
                  className="btn quiet"
                  disabled={!canVote || !current}
                  onClick={() =>
                    store.dispatch({
                      type: 'ballot.retract',
                      auditId: newId(),
                      optionId: option.id,
                      userId: actorId,
                    })
                  }
                >
                  {t('voteRetract')}
                </button>
              </div>
            </div>
          );
        })
      )}
      <h3>{t('voteResults')}</h3>
      <div className="vote-results" aria-live="polite" data-testid="vote-results">
        {!round ? (
          <p className="inspector-note">{t('voteStartHint')}</p>
        ) : isOpen && round.hideResults ? (
          <p className="vote-sealed">{t('voteResultsHidden')}</p>
        ) : (
          <>
            <p className="inspector-note">
              {t('voteCalculation', { mode: t(round.weighting === 'shares' ? 'voteShares' : 'voteEqual') })}
            </p>
            {roundOptions.map((option) => {
              const row = optionPreference(project, option.id);
              return (
                <div key={option.id} className="vote-result-row" data-testid={`vote-result-${option.id}`}>
                  <strong>{option.title}</strong>{' '}
                  <span>{row.preferenceScore === null ? '—' : `${row.preferenceScore.toFixed(1)}/100`}</span>{' '}
                  <small>
                    {t('voteResultDetails', {
                      count: row.preferenceVoters,
                      weight: row.preferenceTotalPower,
                      sum: row.weightedSum.toFixed(1),
                    })}
                  </small>
                </div>
              );
            })}
            {!round.anonymous ? (
              <details>
                <summary>{t('voteIndividual')}</summary>
                {project.ballots.map((ballot) => (
                  <p key={ballot.id}>
                    {project.users.find((u) => u.id === ballot.userId)?.name ?? '—'}:{' '}
                    {project.nodes.find((n) => n.id === ballot.optionId)?.title ?? '—'} · {ballot.preference}
                    /100
                  </p>
                ))}
              </details>
            ) : null}
          </>
        )}
      </div>
      {project.voteHistory.length ? (
        <details data-testid="vote-history">
          <summary>{t('voteHistoryTitle')}</summary>
          {[...project.voteHistory].reverse().map((entry) => (
            <section key={entry.round.id} className="vote-archive">
              <strong>
                {t('votePreviousRound')} · {(entry.round.closedAt ?? '').slice(0, 16)}
              </strong>
              {entry.round.optionIds.map((optionId) => {
                const score = optionPreferenceForRound(entry.round, entry.ballots, optionId);
                return (
                  <p key={optionId}>
                    {entry.titleByOption[optionId] ?? '—'}:{' '}
                    {score.preferenceScore === null ? '—' : `${score.preferenceScore.toFixed(1)}/100`} ·{' '}
                    {t('voteResultDetails', {
                      count: score.preferenceVoters,
                      weight: score.preferenceTotalPower,
                      sum: score.weightedSum.toFixed(1),
                    })}
                  </p>
                );
              })}
            </section>
          ))}
        </details>
      ) : null}
      <div className="dialog-actions">
        <button type="button" className="btn quiet" onClick={onClose} data-testid="vote-close">
          {t('close')}
        </button>
      </div>
    </Modal>
  );
}
