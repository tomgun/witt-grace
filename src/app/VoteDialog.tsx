// The decision ballot (`#voteDialog`): optional, separate from the argument balance, weights frozen per round.
// Unsaved slider drafts live only in this component and survive re-renders caused by other changes
// (inv-review-vote-table §D).
import { useEffect, useRef, useState } from 'react';
import { isAiProfile, optionPreference, optionPreferenceForRound } from '../domain/index.ts';
import type { Node, Scores, VoteWeighting } from '../domain/index.ts';
import { newId } from '../lib/providers.ts';
import { canEdit, isOwner } from './actions.ts';
import { resultText } from './derive.ts';
import { getStore, useAppState, useTranslator } from './store.ts';

const scoreText = (score: number | null): string => (score === null ? '—' : `${score.toFixed(1)}/100`);

export function VoteDialog({
  open,
  onClose,
  scores,
}: {
  open: boolean;
  onClose: () => void;
  scores: Scores;
}) {
  const { project } = useAppState();
  const store = getStore();
  // The prototype's `openVoteDialog`: only a decision document has a ballot.
  const decision = project.mode === 'decision';
  useEffect(() => {
    if (open && !decision) store.openDialog(null);
  }, [open, decision, store]);
  return open && decision ? <VoteRound onClose={onClose} scores={scores} /> : null;
}

/** Mounted only while the dialog is open, so unsaved drafts start empty on every open and vanish on close. */
function VoteRound({ onClose, scores }: { onClose: () => void; scores: Scores }) {
  const state = useAppState();
  const t = useTranslator();
  const store = getStore();
  const { project, actorId } = state;
  const ref = useRef<HTMLDialogElement>(null);
  const [drafts, setDrafts] = useState<ReadonlyMap<string, number>>(new Map());
  const [hideResults, setHideResults] = useState(true);
  const [anonymous, setAnonymous] = useState(false);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const round = project.votingRound;
  const owner = isOwner(state);
  const isOpen = round?.status === 'open';
  const closed = round?.status === 'closed';
  const settingsVisible = !round || closed;
  const me = project.users.find((u) => u.id === actorId) ?? project.users[0];
  const options = project.nodes.filter((n) => n.relation === 'option');
  const roundOptions = round ? options.filter((n) => round.optionIds.includes(n.id)) : [];
  const canVote = isOpen && !isAiProfile(me) && canEdit(state);
  const history = project.voteHistory ?? [];

  const setDraft = (id: string, value: number | null) =>
    setDrafts((previous) => {
      const next = new Map(previous);
      if (value === null) next.delete(id);
      else next.set(id, value);
      return next;
    });
  const guarded = (run: () => boolean): boolean => {
    if (!canEdit(store.get())) {
      store.showMessage(t('viewerCannotEdit'));
      return false;
    }
    return run();
  };
  const start = async () => {
    if (!owner) return;
    if (closed && !(await store.askConfirm(t('voteStartNewConfirm')))) return;
    if (!round && project.ballots.length && !(await store.askConfirm(t('voteOldBallotsIncluded')))) return;
    const previous = drafts;
    setDrafts(new Map());
    const ballots = store.get().project.ballots.length;
    const auditIds = Array.from({ length: 1 + ballots }, () => newId());
    if (
      !guarded(() => store.dispatch({ type: 'round.start', id: newId(), auditIds, anonymous, hideResults }))
    )
      setDrafts(previous);
  };
  const end = async () => {
    if (!owner || !(await store.askConfirm(t('voteEndConfirm')))) return;
    const previous = drafts;
    setDrafts(new Map());
    if (!guarded(() => store.dispatch({ type: 'round.close', userId: actorId, auditId: newId() })))
      setDrafts(previous);
  };
  const changeWeighting = (weighting: VoteWeighting) =>
    guarded(() => {
      if (store.get().project.votingRound?.status === 'open') {
        store.showMessage(t('voteLocked'));
        return false;
      }
      return store.dispatch({ type: 'project.setVoteWeighting', weighting });
    });
  const argumentResult = (option: Node) =>
    t('voteArgumentResult', { score: resultText(option, scores.get(option.id)) });

  return (
    <dialog
      ref={ref}
      id="voteDialog"
      className="action-dialog vote-dialog"
      aria-labelledby="voteDialogTitle"
      data-testid="vote-dialog"
      onClose={onClose}
    >
      <div className="dialog-inner">
        <div className="dialog-heading">
          <h2 id="voteDialogTitle">{t('votingButton')}</h2>
          <button
            type="button"
            className="btn icon-btn"
            id="btnVoteClose"
            aria-label={t('close')}
            onClick={onClose}
          >
            ×
          </button>
        </div>
        {project.mode === 'decision' ? (
          <>
            <p className="inline-warning">{t('voteLocalWarning')}</p>
            <p id="voteRoundStatus" className="vote-round-status" role="status">
              {t(!round ? 'voteStatusDraft' : isOpen ? 'voteStatusOpen' : 'voteStatusClosed')}
            </p>
            <div id="voteSettings" className="vote-settings" hidden={!settingsVisible}>
              <label>
                <span>{t('voteWeighting')}</span>
                <select
                  id="voteWeighting"
                  value={project.settings.voteWeighting}
                  onChange={(e) => changeWeighting(e.target.value as VoteWeighting)}
                >
                  <option value="equal">{t('voteEqual')}</option>
                  <option value="shares">{t('voteShares')}</option>
                </select>
              </label>
              <label className="vote-check">
                <input
                  id="voteHideResults"
                  type="checkbox"
                  checked={hideResults}
                  onChange={(e) => setHideResults(e.target.checked)}
                />
                <span>{t('voteHideResults')}</span>
              </label>
              <label className="vote-check">
                <input
                  id="voteAnonymous"
                  type="checkbox"
                  checked={anonymous}
                  onChange={(e) => setAnonymous(e.target.checked)}
                />
                <span>{t('voteAnonymous')}</span>
              </label>
            </div>
            <p id="voteWeightsHint" className="inspector-note" hidden={!settingsVisible}>
              {t('voteWeightsHint')}
            </p>
            <div className="dialog-actions">
              <button
                id="btnVotePeople"
                className="btn quiet"
                type="button"
                hidden={!settingsVisible}
                onClick={() => store.openDialog('people')}
              >
                {t('profileManage')}
              </button>
              <button
                id="btnVoteStart"
                className="btn primary"
                type="button"
                hidden={!settingsVisible}
                disabled={!owner}
                onClick={() => void start()}
              >
                {t('voteStart')}
              </button>
              <button
                id="btnVoteEnd"
                className="btn primary"
                type="button"
                hidden={!isOpen}
                disabled={!owner}
                onClick={() => void end()}
              >
                {t('voteEnd')}
              </button>
            </div>
            <h3>{t('voteBallots')}</h3>
            <div id="voteBallotList" className="vote-ballot-list">
              {!round ? (
                <>
                  <p className="inspector-note">{t('voteStartHint')}</p>
                  {options.map((option) => (
                    <p key={option.id} className="vote-argument-result" title={t('voteArgumentResultHint')}>
                      <strong>{option.title} · </strong>
                      {argumentResult(option)}
                    </p>
                  ))}
                </>
              ) : (
                roundOptions.map((option) => {
                  const current = project.ballots.find(
                    (b) => b.optionId === option.id && b.userId === actorId
                  );
                  const draft = drafts.get(option.id);
                  const value = draft ?? current?.preference ?? 50;
                  const save = () => {
                    const old = drafts.get(option.id);
                    setDraft(option.id, null);
                    const ok = guarded(() =>
                      store.dispatch({
                        type: 'ballot.cast',
                        id: newId(),
                        auditId: newId(),
                        optionId: option.id,
                        userId: actorId,
                        preference: value,
                      })
                    );
                    if (!ok && old !== undefined) setDraft(option.id, old);
                  };
                  const retract = () => {
                    const old = drafts.get(option.id);
                    setDraft(option.id, null);
                    const ok = guarded(() =>
                      store.dispatch({
                        type: 'ballot.retract',
                        auditId: newId(),
                        optionId: option.id,
                        userId: actorId,
                      })
                    );
                    if (!ok && old !== undefined) setDraft(option.id, old);
                  };
                  return (
                    <div key={option.id} className="vote-option-row" data-testid={`vote-row-${option.id}`}>
                      <label htmlFor={`vote-${option.id}`}>{option.title}</label>
                      <small className="vote-argument-result" title={t('voteArgumentResultHint')}>
                        {argumentResult(option)}
                      </small>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        id={`vote-${option.id}`}
                        value={value}
                        disabled={!canVote}
                        onChange={(e) => setDraft(option.id, Number(e.target.value))}
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
                          onClick={save}
                        >
                          {t('voteSave')}
                        </button>
                        <button
                          type="button"
                          className="btn quiet"
                          data-testid={`vote-retract-${option.id}`}
                          disabled={!canVote || !current}
                          onClick={retract}
                        >
                          {t('voteRetract')}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <h3>{t('voteResults')}</h3>
            <div id="voteResults" className="vote-results" aria-live="polite">
              {!round ? (
                <p className="inspector-note">{t('voteStartHint')}</p>
              ) : isOpen && round.hideResults ? (
                <p className="vote-sealed">{t('voteResultsHidden')}</p>
              ) : (
                <>
                  <p className="inspector-note">
                    {t('voteCalculation', {
                      mode: t(round.weighting === 'shares' ? 'voteShares' : 'voteEqual'),
                    })}
                  </p>
                  {roundOptions.map((option) => {
                    const row = optionPreference(project, option.id);
                    return (
                      <div
                        key={option.id}
                        className="vote-result-row"
                        data-testid={`vote-result-${option.id}`}
                      >
                        <strong>{option.title}</strong>
                        <span>{scoreText(row.preferenceScore)}</span>
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
                    <details className="vote-by-person">
                      <summary>{t('voteIndividual')}</summary>
                      {project.ballots.map((ballot) => (
                        <p key={ballot.id}>
                          {`${project.users.find((u) => u.id === ballot.userId)?.name || '—'}: ${
                            project.nodes.find((n) => n.id === ballot.optionId)?.title || '—'
                          } · ${ballot.preference}/100`}
                        </p>
                      ))}
                    </details>
                  ) : null}
                </>
              )}
            </div>
            <details id="voteAuditDetails">
              <summary>{t('voteAudit')}</summary>
              <div id="voteAuditRows">
                {isOpen && round.hideResults ? (
                  <p className="inspector-note">{t('voteResultsHidden')}</p>
                ) : (
                  (project.voteAudit ?? []).map((event) => (
                    <p key={event.id}>
                      {`${event.at.slice(0, 16)} · ${t(`voteEvent_${event.action}`)} · ${
                        round?.anonymous
                          ? t('voteAnonymousActor')
                          : project.users.find((u) => u.id === event.userId)?.name || '—'
                      }`}
                    </p>
                  ))
                )}
              </div>
            </details>
            <details id="voteHistoryDetails" hidden={!history.length}>
              <summary>{t('voteHistoryTitle')}</summary>
              <div id="voteHistoryRows">
                {[...history].reverse().map((entry) => (
                  <section key={entry.round.id} className="vote-archive">
                    <strong>{`${t('votePreviousRound')} · ${(entry.round.closedAt ?? '').slice(0, 16)}`}</strong>
                    {entry.round.optionIds.map((optionId) => {
                      const score = optionPreferenceForRound(entry.round, entry.ballots, optionId);
                      return (
                        <p key={optionId}>
                          {`${entry.titleByOption[optionId] || '—'}: ${scoreText(score.preferenceScore)} · ${t(
                            'voteResultDetails',
                            {
                              count: score.preferenceVoters,
                              weight: score.preferenceTotalPower,
                              sum: score.weightedSum.toFixed(1),
                            }
                          )}`}
                        </p>
                      );
                    })}
                  </section>
                ))}
              </div>
            </details>
            <div className="dialog-actions">
              <button type="button" className="btn quiet" id="btnVoteDone" onClick={onClose}>
                {t('close')}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </dialog>
  );
}
