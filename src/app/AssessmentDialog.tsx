// The assessment round (`#assessmentDialog`): one claim at a time through the whole tree, credence 0–100 and the
// signed relation influence −5…+5 reviewed separately, progress kept per document and per person in this browser
// (inv-review-vote-table §A). Only the parent's TYPE selects the fixed question template; content never does.
import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import {
  INFLUENCE_STEP,
  INFLUENCE_STEP_COARSE,
  assessmentFields,
  hasAbstained,
  isExcused,
  personalCredence,
  personalInfluence,
  signedInfluence,
} from '../domain/index.ts';
import type { Node, PersonalInfluence } from '../domain/index.ts';
import { translator } from '../lib/i18n/i18n.ts';
import { newId } from '../lib/providers.ts';
import { canEdit } from './actions.ts';
import { loadAssessmentPass, passStore, saveAssessmentPass } from './assessmentPass.ts';
import type { AssessmentPass } from './assessmentPass.ts';
import { signed } from './derive.ts';
import { getStore, useAppState, useTranslator } from './store.ts';

interface Inputs {
  forId: string;
  credenceText: string;
  credenceRange: number;
  influence: number;
}
const clamp100 = (n: number): number => Math.max(0, Math.min(100, Math.round(n)));

/** The sign each ancestor carries towards its own parent in the chain list. */
const CHAIN_MARKS: Record<Node['relation'], string> = {
  root: '◎',
  support: '+',
  oppose: '−',
  neutral: '·',
  option: '◇',
  group: '▤',
};

export function AssessmentDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return open ? <AssessmentRound onClose={onClose} /> : null;
}

/** Mounted only while the dialog is open, so the loaded pass and the slider inputs start fresh on every start. */
function AssessmentRound({ onClose }: { onClose: () => void }) {
  const state = useAppState();
  const t = useTranslator();
  const store = getStore();
  const { project, actorId } = state;
  const ref = useRef<HTMLDialogElement>(null);
  const [pass, setPass] = useState<AssessmentPass>(() => {
    const current = store.get();
    return loadAssessmentPass(passStore(), current.project, current.actorId);
  });
  const [inputs, setInputs] = useState<Inputs | null>(null);
  // Owner request 2026-11-10: the guidance texts sit behind "?", so the dialog fits without scrolling.
  const [showHelp, setShowHelp] = useState(false);
  // Owner request 2026-11-11: the whole line of ancestors up to the root, as a list; stays open between steps.
  const [showChain, setShowChain] = useState(false);
  const startable = canEdit(state) && pass.order.length > 0;

  // The prototype's `startAssessment`: a viewer never starts, an empty queue is a notice, Punnitse goes on
  // without touching the layers, then the native modal opens.
  const queued = pass.order.length;
  useEffect(() => {
    const current = store.get();
    if (!canEdit(current)) {
      store.openDialog(null);
      return;
    }
    if (!queued) {
      store.openDialog(null);
      store.showMessage(translator(current.messages)('assessmentNone'));
      return;
    }
    if (current.view.workflow !== 'evaluate') store.setView({ workflow: 'evaluate' });
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, [store, queued]);

  const cursorId = pass.cursorId;
  const finished = pass.finished;
  // Focus the question header (not a slider near the bottom) on every step; the finish buttons on the summary.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !dialog.open) return;
    if (!finished) {
      dialog.querySelector<HTMLElement>('#assessmentClaim')?.focus({ preventScroll: true });
      dialog.scrollTop = 0;
    } else {
      const unreviewed = dialog.querySelector<HTMLButtonElement>('#btnAssessUnreviewed');
      (unreviewed && !unreviewed.hidden
        ? unreviewed
        : dialog.querySelector<HTMLButtonElement>('#btnAssessRestart')
      )?.focus();
    }
  }, [cursorId, finished]);

  const persist = (next: AssessmentPass) =>
    saveAssessmentPass(passStore(), store.get().project, actorId, next);
  const close = () => {
    persist(pass);
    onClose();
  };

  const total = pass.order.length;
  const idx = Math.max(0, pass.order.indexOf(pass.cursorId ?? ''));
  const reviewed = pass.done.size;
  const node: Node | undefined = cursorId ? project.nodes.find((n) => n.id === cursorId) : undefined;
  const parent = node?.parentId ? project.nodes.find((n) => n.id === node.parentId) : undefined;
  const chain: Node[] = [];
  for (let up = parent; up; up = up.parentId ? project.nodes.find((n) => n.id === up?.parentId) : undefined) {
    if (chain.includes(up)) break;
    chain.unshift(up);
  }
  const fields = assessmentFields(node);
  const hasEdge = fields.impact;
  const abstained = !!node && hasAbstained(project, node.id, actorId);
  const claim = node && fields.credence ? personalCredence(project, node.id, actorId) : null;
  let impact: PersonalInfluence | null = null;
  if (node && hasEdge) {
    try {
      impact = personalInfluence(project, 'primary', node.id, actorId);
    } catch {
      impact = null;
    }
  }
  const defaults = (): Inputs => {
    const credence = String(claim?.confidence ?? node?.confidence ?? 100);
    const influence =
      impact?.current && impact.record
        ? impact.record.influence
        : ((node ? signedInfluence(node) : null) ?? 0);
    return {
      forId: node?.id ?? '',
      credenceText: credence,
      credenceRange: clamp100(Number(credence)),
      influence,
    };
  };
  const values: Inputs = inputs && node && inputs.forId === node.id ? inputs : defaults();

  const move = (direction: number, saveCurrent = false) => {
    if (!pass.cursorId || !node) return;
    const index = pass.order.indexOf(pass.cursorId);
    if (index < 0) return;
    let done = pass.done;
    if (saveCurrent && abstained) {
      // "En arvioi": nothing to save, the step is handled.
      done = new Set(done);
      done.add(pass.cursorId);
    } else if (saveCurrent) {
      const credence = fields.credence ? Number(values.credenceText) : null;
      if (
        fields.credence &&
        (credence === null ||
          !Number.isFinite(credence) ||
          credence < 0 ||
          credence > 100 ||
          !Number.isInteger(credence))
      ) {
        store.showMessage(t('assessmentInvalidCredence'));
        return;
      }
      const influence = fields.impact ? values.influence : null;
      if (!canEdit(store.get())) {
        store.showMessage(t('viewerCannotEdit'));
        return;
      }
      const unchanged =
        (!fields.credence || claim?.confidence === credence) &&
        (!fields.impact || (!!impact?.current && impact.record?.influence === influence));
      if (
        !unchanged &&
        !store.dispatch({
          type: 'review.personal',
          voteId: newId(),
          assessmentId: newId(),
          nodeId: node.id,
          userId: actorId,
          credence,
          influence,
        })
      )
        return;
      done = new Set(done);
      done.add(pass.cursorId);
    }
    go(index + direction, done);
  };
  const go = (next: number, done: Set<string>) => {
    let updated: AssessmentPass = { ...pass, done };
    if (next >= pass.order.length) updated = { ...updated, finished: true };
    else if (next >= 0) updated = { ...updated, cursorId: pass.order[next] ?? null, finished: false };
    persist(updated);
    setPass(updated);
    setInputs(null);
  };
  /** Owner 2026-11-10: "Ei arvioida" turns the reason into a note for everyone; it counts as handled and moves on. */
  const markUnrated = () => {
    if (!pass.cursorId || !node) return;
    if (!canEdit(store.get())) {
      store.showMessage(t('viewerCannotEdit'));
      return;
    }
    if (!store.dispatch({ type: 'node.edit', id: node.id, unrated: true })) return;
    const done = new Set(pass.done);
    done.add(pass.cursorId);
    go(pass.order.indexOf(pass.cursorId) + 1, done);
  };
  const previous = () => {
    if (pass.finished) setPass({ ...pass, finished: false });
    else move(-1);
  };
  const continueUnreviewed = () => {
    const updated: AssessmentPass = {
      ...pass,
      cursorId: pass.order.find((id) => !pass.done.has(id)) ?? pass.order[0] ?? null,
      finished: false,
    };
    persist(updated);
    setPass(updated);
  };
  const restart = async () => {
    if (!(await store.askConfirm(t('assessmentRestartConfirm')))) return;
    const updated: AssessmentPass = {
      ...pass,
      done: new Set(),
      cursorId: pass.order[0] ?? null,
      finished: false,
    };
    persist(updated);
    setPass(updated);
    setInputs(null);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !pass.finished) {
      event.preventDefault();
      event.stopPropagation();
      move(1, true);
    }
  };

  const contextText = parent
    ? t(
        parent.kind === 'option'
          ? 'assessmentParentOption'
          : parent.kind === 'decision'
            ? 'assessmentParentDecision'
            : 'assessmentParent',
        { parent: parent.title }
      )
    : t('assessmentRoot');
  const notYet = (!fields.credence || claim) && (!hasEdge || impact?.current) ? '' : t('profileSuggested');
  const actorName = project.users.find((u) => u.id === actorId)?.name ?? project.users[0]?.name ?? '';
  const last = idx === total - 1;

  return (
    <dialog
      ref={ref}
      id="assessmentDialog"
      className="assessment-dialog"
      aria-labelledby="assessmentTitle"
      aria-describedby="assessmentIntro"
      data-testid="assessment-dialog"
      onClose={close}
      onKeyDown={onKeyDown}
    >
      {startable ? (
        <div className="assessment-shell">
          <div className="assessment-topline">
            <div>
              <div className="eyebrow">{t('assessmentEyebrow')}</div>
              <h2 id="assessmentTitle">
                {t(project.mode === 'decision' ? 'assessmentTitleDecision' : 'assessmentTitle')}
              </h2>
            </div>
            <button
              type="button"
              className="btn icon-btn assessment-help-toggle"
              id="btnAssessHelp"
              aria-pressed={showHelp}
              title={t(showHelp ? 'assessmentHelpHide' : 'assessmentHelpShow')}
              aria-label={t(showHelp ? 'assessmentHelpHide' : 'assessmentHelpShow')}
              onClick={() => setShowHelp((v) => !v)}
            >
              ?
            </button>
            <button
              type="button"
              className="btn icon-btn"
              id="btnAssessClose"
              aria-label={t('close')}
              onClick={close}
            >
              ×
            </button>
          </div>
          <p id="assessmentProfile" className="assessment-profile">
            {t('profileActive', { name: actorName })}
          </p>
          <p id="assessmentNotYet" className="assessment-muted">
            {pass.finished ? '' : notYet}
          </p>
          <p id="assessmentIntro" className={showHelp ? 'assessment-muted' : 'visually-hidden'}>
            {t('assessmentIntro')}
          </p>
          <div className="assessment-progress-row">
            <span id="assessmentStep" aria-live="polite">
              {pass.finished ? t('assessmentSummary') : t('assessmentStep', { current: idx + 1, total })}
            </span>
            <strong id="assessmentReviewed">{t('assessmentReviewed', { reviewed, total })}</strong>
          </div>
          <progress
            id="assessmentProgress"
            max={Math.max(1, total)}
            value={reviewed}
            aria-label={t('assessmentProgress')}
          />
          <div id="assessmentQuestion" className="assessment-question" hidden={pass.finished}>
            {node ? (
              <>
                <div className="assessment-parent-row">
                  {showChain && chain.length > 1 ? (
                    <ol id="assessmentChain" className="assessment-parent assessment-chain">
                      {chain.map((up, depth) => (
                        <li
                          key={up.id}
                          data-relation={up.relation}
                          style={{ paddingInlineStart: depth * 10 }}
                        >
                          <span className="assessment-chain-mark" aria-hidden="true">
                            {CHAIN_MARKS[up.relation]}
                          </span>
                          {up.title}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <div id="assessmentContext" className="assessment-parent">
                      {contextText}
                    </div>
                  )}
                  {chain.length > 1 ? (
                    <button
                      type="button"
                      className="btn icon-btn assessment-chain-toggle"
                      id="btnAssessChain"
                      aria-expanded={showChain}
                      title={t(showChain ? 'assessmentChainHide' : 'assessmentChainShow')}
                      aria-label={t(showChain ? 'assessmentChainHide' : 'assessmentChainShow')}
                      onClick={() => setShowChain((v) => !v)}
                    >
                      ⋮
                    </button>
                  ) : null}
                </div>
                <div className="assessment-claim" id="assessmentClaim" tabIndex={-1}>
                  {node.title}
                </div>
                <p id="assessmentDetails" className="assessment-details">
                  {node.details || ''}
                </p>
                <div
                  className="assessment-field"
                  id="assessmentCredenceField"
                  hidden={!fields.credence || abstained}
                >
                  <p className="assessment-axis">{t('assessmentCredenceAxis')}</p>
                  <label htmlFor="assessmentCredence" className={showHelp ? undefined : 'visually-hidden'}>
                    {t('assessmentCredence')}
                  </label>
                  <div className="assessment-scale">
                    <input
                      type="range"
                      id="assessmentCredence"
                      min={0}
                      max={100}
                      step={1}
                      value={values.credenceRange}
                      onChange={(e) =>
                        setInputs({
                          ...values,
                          credenceText: e.target.value,
                          credenceRange: Number(e.target.value),
                        })
                      }
                    />
                    <input
                      id="assessmentCredenceNumber"
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={values.credenceText}
                      aria-label={t('assessmentCredenceAxis')}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        setInputs({
                          ...values,
                          credenceText: e.target.value,
                          credenceRange:
                            e.target.value !== '' && Number.isFinite(n) ? clamp100(n) : values.credenceRange,
                        });
                      }}
                    />
                    <span aria-hidden="true">/ 100</span>
                  </div>
                </div>
                <div className="assessment-field" id="assessmentImpactField" hidden={!hasEdge || abstained}>
                  <p className="assessment-axis">
                    {t(parent?.kind === 'option' ? 'assessmentSignificanceAxis' : 'assessmentInfluenceAxis')}
                  </p>
                  <label
                    htmlFor="assessmentInfluence"
                    id="assessmentInfluenceLabel"
                    className={showHelp ? undefined : 'visually-hidden'}
                  >
                    {t(parent?.kind === 'option' ? 'assessmentInfluenceOption' : 'assessmentInfluenceClaim')}
                  </label>
                  <div
                    id="assessmentImpactReflection"
                    className={showHelp ? 'assessment-reflection' : 'visually-hidden'}
                  >
                    <p>
                      {t(
                        parent?.kind === 'option'
                          ? 'assessmentSignificanceReflect'
                          : 'assessmentImpactReflectSimple'
                      )}
                    </p>
                  </div>
                  <div className="assessment-scale">
                    <input
                      type="range"
                      id="assessmentInfluence"
                      min={-5}
                      max={5}
                      step={node.fineInfluence ? INFLUENCE_STEP : INFLUENCE_STEP_COARSE}
                      value={values.influence}
                      aria-describedby="assessmentImpactReflection"
                      onChange={(e) => setInputs({ ...values, influence: Number(e.target.value) })}
                    />
                    <output id="assessmentInfluenceValue" htmlFor="assessmentInfluence">
                      {signed(values.influence)}
                    </output>
                  </div>
                  <div className="assessment-edge-labels">
                    <span>{t('assessmentOppose')}</span>
                    <span>{t('assessmentNeutral')}</span>
                    <span>{t('assessmentSupport')}</span>
                  </div>
                  <div className="impact-tools">
                    <label className="inspector-check" htmlFor="assessmentFineInfluence">
                      <input
                        type="checkbox"
                        id="assessmentFineInfluence"
                        checked={!!node.fineInfluence}
                        onChange={(e) =>
                          store.dispatch({ type: 'node.edit', id: node.id, fineInfluence: e.target.checked })
                        }
                      />
                      <span>{t('fineInfluenceToggle')}</span>
                    </label>
                  </div>
                </div>
                {fields.credence || fields.impact ? (
                  <div className="impact-tools">
                    <label className="inspector-check" htmlFor="assessmentAbstain">
                      <input
                        type="checkbox"
                        id="assessmentAbstain"
                        checked={abstained}
                        onChange={(e) =>
                          store.dispatch({
                            type: 'review.abstain',
                            nodeId: node.id,
                            userId: actorId,
                            abstain: e.target.checked,
                          })
                        }
                      />
                      <span>{t('abstain')}</span>
                    </label>
                    <button
                      type="button"
                      className="btn quiet"
                      id="btnAssessUnrated"
                      title={t('unratedHelp')}
                      hidden={!node.parentId || node.kind !== 'claim' || !!node.sharedReasonId}
                      onClick={markUnrated}
                    >
                      {t('unratedMark')}
                    </button>
                  </div>
                ) : null}
                {abstained ? (
                  <p className="assessment-muted" id="assessmentAbstainNote">
                    {t('abstainHelp')}
                  </p>
                ) : isExcused(project, node.id, actorId) ? (
                  <p className="inline-warning" id="assessmentAbstainBranch">
                    {t('abstainBranchNote')}
                  </p>
                ) : null}
                <p className="assessment-muted" id="assessmentReviewedMarker">
                  {pass.done.has(node.id) ? t('assessmentAlreadyReviewed') : t('assessmentNotReviewed')}
                </p>
              </>
            ) : null}
          </div>
          <div id="assessmentFinish" className="assessment-finish" hidden={!pass.finished}>
            <h3 id="assessmentFinishTitle">
              {reviewed === total ? t('assessmentCompleted') : t('assessmentIncomplete')}
            </h3>
            <p id="assessmentFinishText">{t('assessmentSummaryDetail', { reviewed, total })}</p>
            <button
              type="button"
              className="btn quiet"
              id="btnAssessUnreviewed"
              hidden={reviewed === total}
              onClick={continueUnreviewed}
            >
              {t('assessmentContinue')}
            </button>
          </div>
          <div className="assessment-bottom">
            <button type="button" className="btn quiet" id="btnAssessRestart" onClick={() => void restart()}>
              {t('assessmentRestart')}
            </button>
            <div className="assessment-nav">
              <button
                type="button"
                className="btn quiet"
                id="btnAssessPrev"
                disabled={!total || (!pass.finished && idx === 0)}
                onClick={previous}
              >
                {t('assessmentPrevious')}
              </button>
              <button
                type="button"
                className="btn quiet"
                id="btnAssessSkip"
                hidden={pass.finished}
                onClick={() => move(1, false)}
              >
                {t(last ? 'assessmentSkipFinish' : 'assessmentSkip')}
              </button>
              <button
                type="button"
                className="btn primary"
                id="btnAssessNext"
                hidden={pass.finished}
                onClick={() => move(1, true)}
              >
                {t(last ? 'assessmentSaveFinish' : 'assessmentSaveNext')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
