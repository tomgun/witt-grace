// The right panel, rebuilt section by section from the prototype's renderInspector (inv-inspector §0–§19).
// Everything here reads the frame; every change is one command through the store.
import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  assessmentFields,
  canReparent,
  currentInfluenceReviews,
  decisionRanking,
  decisionRankingForAssessor,
  descendants,
  isGate,
  isValue,
  optionFeasibility,
  optionValueProfile,
  personalCredence,
  personalInfluence,
  potentialEvidenceOverlap,
  reasonConcept,
  sharedReason,
  signedInfluence,
  summarizeInfluenceReviews,
  truthAssessable,
} from '../domain/index.ts';
import type { InfluenceSummary, Node, NodeScore, SemanticType, Stance } from '../domain/index.ts';
import { newId } from '../lib/providers.ts';
import {
  addNode,
  attachLibraryReason,
  canAttachLibraryReason,
  canEdit,
  reuseFromTreeNode,
} from './actions.ts';
import {
  EM_DASH,
  balanceDeltaText,
  balanceText,
  derivedResult,
  displayedPrimaryRelation,
  importanceHint,
  importanceText,
  nodeAssessmentSnapshot,
  relationLabel,
  resultText,
  shownInfluence,
  signed,
  viewedAssessorId,
} from './derive.ts';
import type { Frame } from './projection.ts';
import { getStore, useAppState, useTranslator } from './store.ts';
import { LAYER_PRESETS } from './view.ts';

let inspectorAdvancedOpen = false;

export function InfluenceStatusTag({ summary }: { summary: InfluenceSummary }) {
  const t = useTranslator();
  const key =
    summary.status === 'contradictory'
      ? 'influenceStatusContradictory'
      : summary.status === 'neutral'
        ? 'influenceStatusNeutral'
        : summary.status === 'mixed-neutral'
          ? 'influenceStatusMixedNeutral'
          : null;
  if (!key) return null;
  const title = t('influenceDistribution', {
    positive: summary.positive,
    negative: summary.negative,
    neutral: summary.neutral,
  });
  return (
    <span className={`influence-status influence-status-${summary.status}`} title={title} aria-label={title}>
      {t(key)}
    </span>
  );
}

/** The prototype's makeInputField: a label (with optional live output) over one control, committing on change. */
function Field({
  id,
  label,
  children,
  output,
}: {
  id: string;
  label: string;
  children: ReactNode;
  output?: string;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {output !== undefined ? <output htmlFor={id}>{output}</output> : null}
      </label>
      {children}
    </div>
  );
}
function TextArea({
  id,
  label,
  value,
  editable,
  maxLength,
  autoGrow,
  onCommit,
  testId,
}: {
  id: string;
  label: string;
  value: string;
  editable: boolean;
  maxLength: number;
  autoGrow?: boolean;
  onCommit: (value: string) => void;
  testId?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const grow = () => {
    const el = ref.current;
    if (!el || !autoGrow) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight + 2, 250)}px`;
  };
  return (
    <Field id={id} label={label}>
      <textarea
        ref={ref}
        id={id}
        data-testid={testId}
        className={autoGrow ? 'field-autogrow' : undefined}
        rows={autoGrow ? 2 : 4}
        maxLength={maxLength}
        defaultValue={value}
        disabled={!editable}
        onInput={grow}
        onFocus={grow}
        onKeyDown={(e) => {
          if (autoGrow && e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        onBlur={(e) => {
          if (e.target.value !== value) onCommit(e.target.value);
        }}
      />
    </Field>
  );
}
function Range({
  id,
  label,
  value,
  min,
  max,
  step,
  editable,
  format,
  onCommit,
  testId,
  unset = false,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  editable: boolean;
  format: (v: number) => string;
  onCommit: (v: number) => void;
  testId?: string;
  /** No saved assessment yet: the handle sits at the document's starting value, reads "—" and is greyed until the
   * person moves or presses it, which saves it as theirs (owner decision 2026-11-09, UI_INVENTORY S-15). */
  unset?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const [touched, setTouched] = useState(false);
  const commit = () => (draft !== value || (unset && touched)) && onCommit(draft);
  const empty = unset && !touched;
  return (
    <Field id={id} label={label} output={empty ? EM_DASH : format(draft)}>
      <input
        id={id}
        data-testid={testId}
        className={empty ? 'range-unset' : undefined}
        aria-valuetext={empty ? EM_DASH : undefined}
        type="range"
        min={min}
        max={max}
        step={step}
        value={draft}
        disabled={!editable}
        onChange={(e) => setDraft(Number(e.target.value))}
        onPointerDown={() => setTouched(true)}
        onKeyDown={(e) =>
          (e.key.startsWith('Arrow') || e.key === ' ' || e.key === 'Enter') && setTouched(true)
        }
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
      />
    </Field>
  );
}
function Select({
  id,
  label,
  value,
  choices,
  editable,
  onCommit,
  testId,
}: {
  id: string;
  label: string;
  value: string;
  choices: [string, string][];
  editable: boolean;
  onCommit: (v: string) => void;
  testId?: string;
}) {
  return (
    <Field id={id} label={label}>
      <select
        id={id}
        data-testid={testId}
        value={value}
        disabled={!editable}
        onChange={(e) => onCommit(e.target.value)}
      >
        {choices.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
    </Field>
  );
}

// ---- §1 library-reason inspector ---------------------------------------------------------------------------------
function LibraryInspector({ frame }: { frame: Frame }) {
  const state = useAppState();
  const t = useTranslator();
  const store = getStore();
  const { project, actorId } = state;
  const editable = canEdit(state);
  const selection = state.selectedLibraryReason!;
  const [target, setTarget] = useState<string | null>(null);
  const openUse = (id: string) => {
    store.selectLibraryReason(null);
    store.select(id);
    store.setView({ workflow: 'evaluate' });
    requestAnimationFrame(() =>
      document.querySelector('#inspector #nodeImpact')?.scrollIntoView({ block: 'nearest' })
    );
  };
  if (selection.type === 'linked-node') {
    const source = project.nodes.find((n) => n.id === selection.id);
    if (!source) return null;
    const parent = project.nodes.find((n) => n.id === source.parentId);
    const own = personalInfluence(project, 'primary', source.id, actorId);
    return (
      <>
        <p className="repeat-inspector-kicker">{t('multiUseTag')}</p>
        <h3 className="repeat-inspector-title">{source.title}</h3>
        <p className="inspector-note">{t('multiUseIntro')}</p>
        <h3 className="inspector-subheading">{t('multiUseConnections')}</h3>
        {source.parentId ? (
          <button type="button" className="repeat-connection" onClick={() => openUse(source.id)}>
            <strong>{`${t('multiUsePrimary')} → ${parent?.title ?? '?'}`}</strong>
            <small>{`${own.current && own.record ? signed(own.record.influence) : EM_DASH} / 5 · ${t('multiUseOpen')}`}</small>
          </button>
        ) : null}
        {(project.links ?? [])
          .filter((l) => l.sourceId === source.id)
          .map((link) => {
            const linkTarget = project.nodes.find((n) => n.id === link.targetId);
            const ownLink = personalInfluence(project, 'secondary', link.id, actorId);
            return (
              <button
                key={link.id}
                type="button"
                className="repeat-connection"
                onClick={() => store.openModal({ kind: 'links', nodeId: source.id, linkId: link.id })}
              >
                <strong>{`${t('multiUseSecondary')} → ${linkTarget?.title ?? '?'}`}</strong>
                <small>{`${ownLink.current && ownLink.record ? signed(ownLink.record.influence) : EM_DASH} / 5 · ${t('multiUseOpen')}`}</small>
              </button>
            );
          })}
        <button
          type="button"
          className="btn primary repeat-from-node"
          disabled={!editable}
          onClick={() => reuseFromTreeNode(source.id)}
        >
          {t('repeatLinkOtherTargets')}
        </button>
        <button
          type="button"
          className="btn quiet"
          onClick={() => {
            store.selectLibraryReason(null);
            store.select(source.id);
          }}
        >
          {t('editSelected')}
        </button>
      </>
    );
  }
  const locked = selection.type === 'locked';
  const reason = locked ? sharedReason(project, selection.id) : reasonConcept(project, selection.id);
  if (!reason) return null;
  const uses = project.nodes.filter((n) =>
    locked ? n.sharedReasonId === reason.id : n.reasonConceptId === reason.id
  );
  const targets = project.nodes.filter((n) => canAttachLibraryReason(project, selection, n.id, editable));
  const chosen =
    target && targets.some((n) => n.id === target)
      ? target
      : targets.some((n) => n.id === state.selectedId)
        ? state.selectedId
        : (targets[0]?.id ?? '');
  const shared = locked ? sharedReason(project, selection.id) : null;
  return (
    <>
      <div className="repeat-inspector-kicker">{t('repeatTab')}</div>
      <h3 className="repeat-inspector-title">{reason.title}</h3>
      <p className="inspector-note">{t(locked ? 'repeatLockedHelp' : 'repeatIndependentHelp')}</p>
      <label className="repeat-inspector-label">
        {t('repeatEditName')}
        <input
          type="text"
          maxLength={200}
          defaultValue={reason.title}
          disabled={!editable}
          onBlur={(e) => {
            const title = e.target.value;
            if (title === reason.title) return;
            if (locked && shared)
              store.dispatch({
                type: 'shared.update',
                id: reason.id,
                title,
                confidence: shared.confidence,
                influence: shared.influence,
              });
            else store.dispatch({ type: 'concept.update', id: reason.id, title });
          }}
        />
      </label>
      {locked && shared ? (
        <>
          <p className="repeat-fixed-info">{`${shared.confidence}% / ${signed(shared.influence)}/5`}</p>
          <details className="repeat-advanced">
            <summary>{t('repeatEditLocked')}</summary>
            <form
              className="repeat-inspector-fixed-form"
              onSubmit={(e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget);
                store.dispatch({
                  type: 'shared.update',
                  id: reason.id,
                  title: reason.title,
                  confidence: Number(data.get('confidence')),
                  influence: Number(data.get('impact')),
                });
              }}
            >
              <label>
                {t('sharedProb')}
                <input type="number" name="confidence" min={0} max={100} defaultValue={shared.confidence} />
              </label>
              <label>
                {t('sharedImpact')}
                <input
                  type="number"
                  name="impact"
                  min={-5}
                  max={5}
                  step={0.5}
                  defaultValue={shared.influence}
                />
              </label>
              <button type="submit" className="btn primary">
                {t('sharedSave')}
              </button>
            </form>
          </details>
        </>
      ) : null}
      <label className="repeat-inspector-label">
        {t('repeatChooseTarget')}
        <select
          id="repeatAttachTarget"
          data-testid="reuse-target"
          value={chosen}
          onChange={(e) => setTarget(e.target.value)}
        >
          {targets.map((n) => (
            <option key={n.id} value={n.id}>
              {n.title}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="btn primary repeat-attach"
        data-testid="reuse-attach"
        disabled={!editable || !targets.length}
        onClick={() => chosen && attachLibraryReason(selection, chosen)}
      >
        {t('repeatAttach')}
      </button>
      <h3 className="inspector-subheading">{t('repeatConnections', { count: uses.length })}</h3>
      <p className="inspector-note">{t(locked ? 'repeatLockedHelp' : 'repeatPerTargetAssessments')}</p>
      {!uses.length ? <p className="inspector-note">{t('repeatNoConnections')}</p> : null}
      {uses.map((use) => {
        const parent = project.nodes.find((n) => n.id === use.parentId);
        const values = nodeAssessmentSnapshot(frame, t, use);
        return (
          <button
            key={use.id}
            type="button"
            className="repeat-connection"
            data-testid={`repeat-use-${use.id}`}
            onClick={() => openUse(use.id)}
          >
            <strong>{parent?.title ?? '?'}</strong>
            <small>
              {locked ? t('repeatLocked') : `${values?.value ?? EM_DASH} · ${t('repeatOpenReview')}`}
            </small>
          </button>
        );
      })}
      {!uses.length ? (
        <button
          type="button"
          className="btn quiet"
          disabled={!editable}
          onClick={async () => {
            if (!(await store.askConfirm(t('sharedDeleteConfirm')))) return;
            if (locked) store.dispatch({ type: 'shared.remove', id: reason.id });
            else store.dispatch({ type: 'concept.remove', id: reason.id });
            store.selectLibraryReason(null);
          }}
        >
          {t('sharedDelete')}
        </button>
      ) : null}
    </>
  );
}

// ---- §9–§10 value profile and decision matrix ---------------------------------------------------------------------
function OptionValues({ node }: { node: Node }) {
  const state = useAppState();
  const t = useTranslator();
  const store = getStore();
  const profile = optionValueProfile(state.project, node.id, state.actorId);
  return (
    <section className="value-profile">
      <div className="inspector-divider" />
      <h3 className="inspector-subheading">{t('valueProfileTitle')}</h3>
      {!profile.items.length ? (
        <p className="inline-warning">{t('valueProfileNone')}</p>
      ) : (
        <>
          <p className="inspector-note">
            {t('valueImpactSummary', { assessed: profile.assessed, count: profile.items.length })}
          </p>
          <div className="value-profile-list">
            {profile.items.map((item) => {
              const sign = item.impact ?? item.direction;
              const mine =
                item.impact === null ? t('notAssessed') : t('myImpactShort', { impact: signed(item.impact) });
              const group = item.summary.count
                ? t('valueGroupSummary', {
                    count: item.summary.count,
                    positive: item.summary.positive,
                    negative: item.summary.negative,
                    neutral: item.summary.neutral,
                    mean: signed(Number((item.summary.mean ?? 0).toFixed(1))),
                  })
                : t('notAssessed');
              return (
                <button
                  key={`${item.nodeId}:${item.relationId}`}
                  type="button"
                  className="value-profile-row"
                  onClick={() => store.select(item.nodeId)}
                >
                  <strong
                    className={`value-direction-${sign < 0 ? 'oppose' : sign > 0 ? 'support' : 'neutral'}`}
                  >
                    {sign < 0 ? '−' : sign > 0 ? '＋' : '0'}
                  </strong>
                  <span className="value-profile-text">
                    <span>{item.title}</span>
                    <small>
                      {mine} · {group}
                      {item.indirect ? ` · ${t('valueIndirect')}` : ''}
                      {item.source === 'secondary' ? ` · ${t('valueProfileLink')}` : ''}
                    </small>
                    <InfluenceStatusTag summary={item.summary} />
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
      <p className="inline-warning">{t('valueImpactHelp')}</p>
    </section>
  );
}
function DecisionValueMatrix() {
  const state = useAppState();
  const t = useTranslator();
  const store = getStore();
  const { project, actorId } = state;
  const options = project.nodes.filter((n) => n.relation === 'option');
  const profiles = options.map((o) => ({ option: o, profile: optionValueProfile(project, o.id, actorId) }));
  const values = new Map<string, Node>();
  for (const { profile } of profiles)
    for (const item of profile.items) {
      const n = project.nodes.find((x) => x.id === item.nodeId);
      if (n) values.set(n.id, n);
    }
  if (!options.length || !values.size) return null;
  const rank = (id: string) =>
    Math.max(
      0,
      ...profiles.flatMap(({ profile }) =>
        profile.items
          .filter((i) => i.nodeId === id)
          .map((i) => (i.summary.count ? Math.abs(i.summary.mean ?? 0) : 0))
      )
    );
  const rows = [...values.values()].sort((a, b) => rank(b.id) - rank(a.id) || a.id.localeCompare(b.id));
  return (
    <section className="decision-value-matrix">
      <div className="inspector-divider" />
      <h3>{t('decisionCriteriaTitle')}</h3>
      <p className="inspector-note">{t('decisionCriteriaHelp')}</p>
      <div className="decision-value-scroll">
        <table className="decision-value-table">
          <thead>
            <tr>
              <th>{t('decisionCriteriaName')}</th>
              {options.map((o) => (
                <th key={o.id}>{o.title}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((valueNode) => (
              <tr key={valueNode.id}>
                <th>
                  <button type="button" className="btn quiet" onClick={() => store.select(valueNode.id)}>
                    {valueNode.title}
                  </button>
                </th>
                {profiles.map(({ option, profile }) => (
                  <td key={option.id}>
                    {profile.items
                      .filter((i) => i.nodeId === valueNode.id)
                      .map((item) => (
                        <div key={`${item.nodeId}:${item.relationId}`}>
                          <strong>{item.impact === null ? EM_DASH : `${signed(item.impact)}/5`}</strong>
                          <small>
                            {item.summary.count
                              ? t('valueMean', {
                                  mean: signed(Number((item.summary.mean ?? 0).toFixed(1))),
                                  count: item.summary.count,
                                })
                              : t('notAssessed')}
                          </small>
                          <InfluenceStatusTag summary={item.summary} />
                        </div>
                      ))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---- §15 advanced details ----------------------------------------------------------------------------------------
function SemanticSection({ node, editable }: { node: Node; editable: boolean }) {
  const state = useAppState();
  const t = useTranslator();
  const store = getStore();
  const { project } = state;
  const urlRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLInputElement>(null);
  if (node.kind === 'decision' || node.relation === 'option') {
    if (node.relation !== 'option') return null;
    const gate = optionFeasibility(project, node.id);
    return (
      <p
        className={`feasibility ${gate.status}`}
        title={gate.gates.map((g) => `${g.title}: ${t(`feasibility_${g.status}`)}`).join(' · ')}
      >
        {`${t('optionFeasibility')}: ${t(`feasibility_${gate.status}`)}`}
      </p>
    );
  }
  const author = project.users.find((u) => u.id === node.createdBy);
  const overlaps = potentialEvidenceOverlap(project, node.id);
  const nonFactual = (s: SemanticType) => s === 'value' || s === 'constraint' || s === 'prerequisite';
  return (
    <>
      <div className="inspector-divider" />
      <h3 className="inspector-subheading">{t('semanticHeading')}</h3>
      <Select
        id="nodeSemantic"
        testId="node-semantic"
        label={t('semanticType')}
        value={node.semanticType ?? 'unspecified'}
        editable={editable}
        choices={(
          ['unspecified', 'fact', 'assumption', 'value', 'constraint', 'prerequisite'] as SemanticType[]
        ).map((k) => [k, t(`semantic_${k}`)])}
        onCommit={async (value) => {
          const next = value as SemanticType;
          const removing = nonFactual(next) && !nonFactual(node.semanticType ?? 'unspecified');
          const removed = removing ? project.votes.filter((v) => v.nodeId === node.id).length : 0;
          if (removed && !(await store.askConfirm(t('semanticDeleteRatings', { count: removed })))) return;
          store.dispatch({ type: 'node.edit', id: node.id, semanticType: next });
        }}
      />
      {isGate(node) ? (
        <Select
          id="nodeConstraint"
          testId="node-constraint"
          label={t('constraintStatus')}
          value={node.constraintStatus ?? 'unknown'}
          editable={editable}
          choices={(['unknown', 'met', 'unmet'] as const).map((k) => [k, t(`feasibility_${k}`)])}
          onCommit={(value) =>
            store.dispatch({
              type: 'node.edit',
              id: node.id,
              constraintStatus: value as 'unknown' | 'met' | 'unmet',
            })
          }
        />
      ) : null}
      {isValue(node) || isGate(node) ? <p className="inline-warning">{t('semanticNonFactual')}</p> : null}
      <Select
        id="nodeAuthorVisibility"
        label={t('authorVisibility')}
        value={node.authorVisibility ?? 'named'}
        editable={editable}
        choices={[
          ['named', t('authorNamed')],
          ['anonymous', t('authorAnonymous')],
        ]}
        onCommit={(value) =>
          store.dispatch({ type: 'node.edit', id: node.id, authorVisibility: value as 'named' | 'anonymous' })
        }
      />
      <p className="inline-warning">
        {node.authorVisibility === 'anonymous'
          ? t('anonymousExportWarning')
          : `${t('authoredBy')}: ${author?.name ?? EM_DASH}`}
      </p>
      <h4 className="inspector-subheading">{t('sourcesHeading')}</h4>
      {(node.sources ?? []).map((source, idx) => (
        <div key={`${source.url}:${idx}`} className="source-row">
          <a className="source-link" href={source.url} target="_blank" rel="noopener noreferrer">
            {source.url}
          </a>
          <small>{source.note}</small>
          {editable ? (
            <button
              type="button"
              className="btn quiet"
              onClick={() =>
                store.dispatch({
                  type: 'node.edit',
                  id: node.id,
                  sources: (node.sources ?? []).filter((_, i) => i !== idx),
                })
              }
            >
              {t('removeSource')}
            </button>
          ) : null}
        </div>
      ))}
      {editable ? (
        <div className="source-add-form">
          <input
            ref={urlRef}
            type="url"
            placeholder="https://…"
            maxLength={1000}
            aria-label={t('sourceUrl')}
          />
          <input ref={noteRef} placeholder={t('sourceNote')} maxLength={500} />
          <button
            type="button"
            className="btn quiet"
            onClick={() => {
              const url = urlRef.current?.value ?? '';
              const note = noteRef.current?.value ?? '';
              if (
                store.dispatch({
                  type: 'node.edit',
                  id: node.id,
                  sources: [...(node.sources ?? []), { url, note }],
                })
              ) {
                if (urlRef.current) urlRef.current.value = '';
                if (noteRef.current) noteRef.current.value = '';
              }
            }}
          >
            {t('addSource')}
          </button>
        </div>
      ) : null}
      {overlaps.length ? (
        <details className="overlap-note">
          <summary>{t('overlapWarning', { count: overlaps.length })}</summary>
          {overlaps.map((overlap) => (
            <button
              key={overlap.nodeId}
              type="button"
              className="btn quiet"
              onClick={() => store.select(overlap.nodeId)}
            >
              {overlap.title} ·{' '}
              {overlap.reasons
                .map((k) => t(k === 'same-text' ? 'overlap_same_text' : 'overlap_shared_source'))
                .join(', ')}
            </button>
          ))}
        </details>
      ) : null}
    </>
  );
}

// ---- §14 evaluate block ------------------------------------------------------------------------------------------
function EvaluateBlock({ frame, node }: { frame: Frame; node: Node }) {
  const state = useAppState();
  const t = useTranslator();
  const store = getStore();
  const { project, view, actorId } = state;
  const editable = canEdit(state) && !node.sharedReasonId;
  const inspectedId = view.indexMode === 'personal' ? viewedAssessorId(project, view, actorId) : null;
  const inspected = inspectedId ? project.users.find((u) => u.id === inspectedId) : undefined;
  const otherPerspective = !!inspected && inspected.id !== actorId;
  const me = project.users.find((u) => u.id === actorId);
  const ownVote = personalCredence(project, node.id, actorId);
  const ownImpact =
    node.parentId && node.relation !== 'option'
      ? personalInfluence(project, 'primary', node.id, actorId)
      : null;
  const visibleReviewers = new Set(frame.lens.userIds);
  if (otherPerspective && inspected) visibleReviewers.add(inspected.id);
  const allReviews = project.votes.filter((v) => v.nodeId === node.id && visibleReviewers.has(v.userId));
  const allImpacts =
    node.parentId && node.relation !== 'option' && node.relation !== 'group'
      ? currentInfluenceReviews(project, 'primary', node.id, true).filter((v) =>
          visibleReviewers.has(v.userId)
        )
      : [];
  const assessment = frame.scores.get(node.id);
  const personal = view.indexMode === 'personal' ? frame.personalScores.get(node.id) : undefined;
  const effective: NodeScore | undefined = view.indexMode === 'personal' ? personal : assessment;
  const otherScore: NodeScore | undefined =
    view.indexMode === 'personal' ? assessment : frame.actorScores.get(node.id);
  const credenceShown = !otherPerspective && !node.sharedReasonId && truthAssessable(node);
  const impactShown =
    !otherPerspective && !node.sharedReasonId && !!node.parentId && node.relation !== 'option';
  const commit = (credence: number | null, influence: number | null) => {
    // Saving one axis also saves the other one as the slider shows it, when the person has none yet: they saw both
    // values and left that one as it was (owner decision 2026-11-09). A stale impact still asks to be reassessed.
    if (credence === null && credenceShown && !ownVote) credence = node.confidence;
    if (influence === null && impactShown && !ownImpact?.record) influence = signedInfluence(node) ?? 0;
    if (influence !== null) store.setView({ indexMode: 'personal', viewAssessorId: null });
    const fields = assessmentFields(node);
    if (credence !== null && influence !== null && fields.credence && fields.impact) {
      // Both at once, as the assessment round saves them: one undo step.
      store.dispatch({
        type: 'review.personal',
        voteId: newId(),
        assessmentId: newId(),
        nodeId: node.id,
        userId: actorId,
        credence,
        influence,
      });
      return;
    }
    if (credence !== null)
      store.dispatch({ type: 'review.credence', id: newId(), nodeId: node.id, userId: actorId, credence });
    if (influence !== null)
      store.dispatch({
        type: 'review.influence',
        id: newId(),
        subjectType: 'primary',
        subjectId: node.id,
        userId: actorId,
        influence,
      });
  };
  const beforeClamp =
    effective && effective.base !== null && effective.score !== null
      ? effective.base + 5 * ((effective.positive || 0) - (effective.negative || 0))
      : null;
  const inspectedClaim = inspected ? personalCredence(project, node.id, inspected.id) : null;
  const inspectedImpact =
    inspected && node.parentId && node.relation !== 'option' && node.relation !== 'group'
      ? personalInfluence(project, 'primary', node.id, inspected.id)
      : null;
  const summary = allImpacts.length ? summarizeInfluenceReviews(allImpacts) : null;
  return (
    <>
      <div className="inspector-divider" />
      <h3 className="inspector-subheading">{t('assessmentSettings')}</h3>
      {otherPerspective && inspected ? (
        <div className="viewed-assessment">
          <strong>{t('viewingPerspective', { name: inspected.name })}</strong>
          <p>
            {t('credenceChip')}:{' '}
            {inspectedClaim
              ? `${inspectedClaim.confidence} %`
              : node.sharedReasonId
                ? t('sharedFixedExplanation')
                : EM_DASH}
          </p>
          <p>
            {t('impactChip')}:{' '}
            {inspectedImpact?.current && inspectedImpact.record
              ? `${signed(inspectedImpact.record.influence)}/5`
              : node.sharedReasonId
                ? t('sharedFixedExplanation')
                : EM_DASH}
          </p>
          <small>{t('reviewReadOnly')}</small>
          <button
            type="button"
            className="btn quiet"
            onClick={() => store.setView({ indexMode: 'personal', viewAssessorId: null })}
          >
            {t('backToOwnReviews')}
          </button>
        </div>
      ) : (
        <p className="inspector-note">{t('profileActive', { name: me?.name ?? '' })}</p>
      )}
      {!otherPerspective && node.sharedReasonId ? (
        <p className="inspector-note">{t('sharedFixedExplanation')}</p>
      ) : null}
      {credenceShown ? (
        <>
          <Range
            unset={!ownVote}
            key={`c:${node.id}:${ownVote?.confidence ?? 'none'}`}
            id="nodeConfidence"
            testId="review-credence"
            label={t('ownCredence')}
            value={ownVote?.confidence ?? node.confidence}
            min={0}
            max={100}
            step={1}
            editable={editable}
            format={(v) => `${v} %`}
            onCommit={(v) => commit(v, null)}
          />
          {!ownVote ? <p className="inline-warning">{t('profileUnsetHint')}</p> : null}
        </>
      ) : null}
      {impactShown ? (
        <>
          <Range
            unset={!ownImpact?.current}
            key={`i:${node.id}:${ownImpact?.current && ownImpact.record ? ownImpact.record.influence : 'none'}`}
            id="nodeImpact"
            testId="review-influence"
            label={t('profileInfluence')}
            value={
              ownImpact?.current && ownImpact.record
                ? ownImpact.record.influence
                : (signedInfluence(node) ?? 0)
            }
            min={-5}
            max={5}
            step={0.5}
            editable={editable}
            format={(v) => `${signed(v)} / 5`}
            onCommit={(v) => commit(null, v)}
          />
          {!ownImpact?.current ? (
            <p className="inline-warning">{t(ownImpact?.record ? 'profileStale' : 'profileUnsetHint')}</p>
          ) : null}
        </>
      ) : null}
      {summary &&
      (summary.status === 'contradictory' ||
        summary.status === 'neutral' ||
        summary.status === 'mixed-neutral') ? (
        <div className="influence-status-inline">
          <InfluenceStatusTag summary={summary} />
          <small>
            {t('influenceDistribution', {
              positive: summary.positive,
              negative: summary.negative,
              neutral: summary.neutral,
            })}
          </small>
        </div>
      ) : null}
      {allReviews.length || allImpacts.length ? (
        <details className="profile-review-list">
          <summary>{`${t('profileCompare')} · ${allReviews.length} / ${allImpacts.length}`}</summary>
          {project.users
            .filter((u) => visibleReviewers.has(u.id))
            .map((u) => {
              const r = allReviews.find((v) => v.userId === u.id);
              const e = allImpacts.find((v) => v.userId === u.id);
              if (!r && !e) return null;
              return (
                <p
                  key={u.id}
                >{`${u.name}: ${r ? `${r.confidence}%` : EM_DASH} · ${e ? `${signed(e.influence)}/5` : EM_DASH}`}</p>
              );
            })}
        </details>
      ) : null}
      {!frame.lens.filtered || view.indexMode === 'personal' ? (
        <div className="score-hero" data-testid="score-section">
          <div className="score-value" data-testid="score-balance">
            {resultText(node, effective)}
            <small>{t('indexScoreCaption')}</small>
          </div>
          <p className="score-index-compare">
            {t(view.indexMode === 'personal' ? 'indexOtherShared' : 'indexOtherPersonal', {
              score: resultText(node, otherScore),
            })}
          </p>
          <div className="score-line">
            <span>{t(node.kind === 'option' ? 'optionReferenceLevel' : 'baseCredence')}</span>
            <strong>
              {effective?.base == null
                ? EM_DASH
                : node.kind === 'option'
                  ? '0'
                  : `${effective.base.toFixed(1)} %`}
            </strong>
          </div>
          {node.kind === 'option' ? <p className="score-index-compare">{t('optionIndexNotTruth')}</p> : null}
          <div className="score-line">
            <span>{t('childInfluence')}</span>
            <strong>{effective?.delta == null ? EM_DASH : `${balanceDeltaText(effective.delta)} p`}</strong>
          </div>
          <div className="score-explain">
            {t(view.indexMode === 'personal' ? 'personalIndexExplain' : 'heuristicExplain')}
          </div>
          {beforeClamp !== null && beforeClamp > 100 + 1e-9 ? (
            <p className="inline-warning">{t('scoreCappedHigh')}</p>
          ) : null}
          {beforeClamp !== null && beforeClamp < 0 - 1e-9 ? (
            <p className="inline-warning">{t('scoreCappedLow')}</p>
          ) : null}
          <details className="score-help">
            <summary>{t('indexQuestion')}</summary>
            <p>{t('indexExplain')}</p>
            {effective && derivedResult(node, effective) ? (
              <p>
                {t('indexHere', {
                  base: balanceText(effective.base),
                  delta: balanceDeltaText(effective.delta),
                  score: balanceText(effective.score),
                })}
              </p>
            ) : null}
          </details>
          {effective?.contributions?.length ? (
            <details className="score-help score-breakdown">
              <summary>{t('scoreContributions')}</summary>
              <p className="inspector-note">{t('importanceTargetExplanation')}</p>
              <ul className="score-contribution-list">
                {effective.contributions.map((item) => {
                  const source = project.nodes.find((n) => n.id === (item.sourceId || item.id));
                  if (!source) return null;
                  const effect = frame.importance.effects.get(item.id);
                  const mine = effect && effect.parentId === node.id ? effect : undefined;
                  return (
                    <li
                      key={item.id}
                      className="score-contribution"
                      data-importance-delta={mine ? String(mine.delta) : undefined}
                      title={mine ? importanceHint(project, t, mine) : undefined}
                      data-testid={`contribution-${item.id}`}
                    >
                      <button
                        type="button"
                        className="btn quiet"
                        onClick={() =>
                          item.subjectType === 'secondary'
                            ? store.openModal({ kind: 'links', nodeId: source.id, linkId: item.id })
                            : store.select(source.id)
                        }
                      >
                        {source.title}
                      </button>
                      <small>
                        {item.missing
                          ? t('personalIncomplete')
                          : t('scoreContributionDetail', {
                              impact: signed(item.impact ?? 0),
                              strength: (item.strength ?? 0).toFixed(1),
                              magnitude: (item.magnitude ?? 0).toFixed(2),
                            })}
                      </small>
                      {mine && !item.missing ? (
                        <strong className="reason-marginal" title={importanceHint(project, t, mine)}>
                          {importanceText(t, mine)}
                        </strong>
                      ) : null}
                      {item.overlapWarning ? (
                        <small className="link-route-note">{t('linkOverlapWarning')}</small>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              <p className="inline-warning">{t('linkScoreNotice')}</p>
            </details>
          ) : null}
          {effective?.incomplete ? <p className="inline-warning">{t('personalIncomplete')}</p> : null}
          {!derivedResult(node, effective) ? <p className="inspector-note">{t('resultNotDerived')}</p> : null}
        </div>
      ) : (
        <p className="inline-warning">{t('lensIndexExcluded')}</p>
      )}
    </>
  );
}

// ---- §19 options ranking -----------------------------------------------------------------------------------------
function OptionsRanking({ frame }: { frame: Frame }) {
  const state = useAppState();
  const t = useTranslator();
  const store = getStore();
  const { project, view, actorId } = state;
  const personal = view.indexMode === 'personal';
  const assessor = viewedAssessorId(project, view, actorId);
  const items = personal
    ? decisionRankingForAssessor(project, assessor, frame.personalScores)
    : decisionRanking(project, frame.scores);
  return (
    <>
      <div className="inspector-divider" />
      <h3>{t('optionsReview')}</h3>
      <div className="ranking" data-testid="decision-overview">
        {items.map((item) => {
          const feasible = item.feasibility;
          const complete = 'complete' in item ? (item as { complete: boolean }).complete : !item.incomplete;
          const scoreLabel =
            feasible.status === 'blocked'
              ? '⛔'
              : feasible.status === 'unresolved'
                ? '?'
                : personal && !complete
                  ? EM_DASH
                  : resultText(item.node, item, 0);
          const profile = optionValueProfile(project, item.node.id, assessor);
          const detail =
            `${item.node.title} · ${t(`feasibility_${feasible.status}`)}` +
            (item.incomplete ? ` · ${t('personalRankingIncomplete')}` : '') +
            (profile.values
              ? ` · ${t('valueProfileSummary', { assessed: profile.assessed, count: profile.values })}`
              : '');
          const leading = frame.leadingOptionIds.has(item.node.id);
          return (
            <button
              key={item.node.id}
              type="button"
              className={`ranking-row option-${feasible.status}${leading ? ' ai-leading-option' : ''}`}
              aria-label={`${scoreLabel} · ${detail}`}
              data-testid={`option-row-${item.node.id}`}
              onClick={() => store.select(item.node.id)}
            >
              <span className="ranking-score">{scoreLabel}</span>
              <span className="ranking-label">{detail}</span>
              {leading ? <small className="ai-leader-tag">{t('topRatedOption')}</small> : null}
            </button>
          );
        })}
      </div>
      {!items.length ? <p className="inline-warning">{t('optionsEmpty')}</p> : null}
      <p className="inline-warning">{t('indexNotDecision')}</p>
    </>
  );
}

// ---- the panel ---------------------------------------------------------------------------------------------------
export function Inspector({ frame }: { frame: Frame }) {
  const state = useAppState();
  const t = useTranslator();
  const store = getStore();
  const { project, view } = state;
  const [advancedOpen, setAdvancedOpen] = useState(inspectorAdvancedOpen);
  const node = project.nodes.find((n) => n.id === state.selectedId);
  const body = (() => {
    if (state.selectedLibraryReason) return <LibraryInspector frame={frame} />;
    if (!node) return null;
    const editable = canEdit(state) && !node.sharedReasonId;
    const fullyEditable = canEdit(state);
    const parent = node.parentId ? project.nodes.find((n) => n.id === node.parentId) : undefined;
    const kicker = `${relationLabel(frame, t, node)} · ${t(node.parentId === null ? 'rootNote' : 'impactNote')}`;
    if (node.kind === 'group') {
      const parentChoices: [string, string][] = project.nodes
        .filter((n) => canReparent(project, node.id, n.id))
        .map((n) => [n.id, n.title]);
      const count = descendants(project, node.id).filter(
        (id) => project.nodes.find((n) => n.id === id)?.kind === 'option'
      ).length;
      const votingOpen = project.votingRound?.status === 'open';
      return (
        <>
          <p className="inspector-note">{kicker}</p>
          <p className="inspector-note">{t('optionGroupExplain')}</p>
          <TextArea
            id="nodeTitle"
            testId="node-title"
            label={t('claimTitle')}
            value={node.title}
            editable={fullyEditable}
            maxLength={200}
            autoGrow
            onCommit={(v) => v.trim() && store.dispatch({ type: 'node.edit', id: node.id, title: v.trim() })}
          />
          <TextArea
            id="nodeDetails"
            testId="node-details"
            label={t('claimDetails')}
            value={node.details}
            editable={fullyEditable}
            maxLength={5000}
            onCommit={(v) => store.dispatch({ type: 'node.edit', id: node.id, details: v })}
          />
          <Select
            id="nodeParent"
            testId="node-parent"
            label={t('parentNode')}
            value={node.parentId ?? ''}
            choices={parentChoices}
            editable={fullyEditable}
            onCommit={(v) => store.dispatch({ type: 'node.move', id: node.id, parentId: v })}
          />
          <p className="inspector-note">{t('optionGroupCount', { count })}</p>
          <button
            type="button"
            className="btn quiet"
            disabled={!fullyEditable || votingOpen}
            onClick={() => addNode('group', node.id)}
          >
            {t('optionGroupAdd')}
          </button>
          <button
            type="button"
            className="btn quiet"
            disabled={!fullyEditable || votingOpen}
            onClick={() => addNode('option', node.id)}
          >
            {t('optionAdd')}
          </button>
        </>
      );
    }
    const concept = node.reasonConceptId ? reasonConcept(project, node.reasonConceptId) : null;
    const shared = node.sharedReasonId ? sharedReason(project, node.sharedReasonId) : null;
    const allowed: [string, string][] = [
      ['support', t('supportWord')],
      ['oppose', t('opposeWord')],
      ['neutral', t('neutralWord')],
    ];
    if (project.mode === 'decision' && parent?.parentId === null) allowed.push(['option', t('optionWord')]);
    if (node.relation === 'option' && !allowed.some(([v]) => v === 'option'))
      allowed.push(['option', t('previousOption')]);
    const parentChoices: [string, string][] = project.nodes
      .filter((n) => canReparent(project, node.id, n.id))
      .map((n) => [n.id, n.title.slice(0, 44)]);
    const effective = shownInfluence(frame, node);
    const direction = displayedPrimaryRelation(frame, node);
    const linked = (project.links ?? []).filter((l) => l.sourceId === node.id || l.targetId === node.id);
    const comments = project.comments.filter((c) => c.nodeId === node.id);
    const conceptUses = node.reasonConceptId
      ? project.nodes.filter((n) => n.reasonConceptId === node.reasonConceptId)
      : [];
    return (
      <>
        <p className="inspector-note">{kicker}</p>
        {node.kind === 'claim' && node.parentId && !node.sharedReasonId ? (
          <>
            <button
              type="button"
              className="btn primary repeat-from-node"
              data-testid="reuse-open"
              disabled={!fullyEditable && !node.reasonConceptId}
              onClick={() => reuseFromTreeNode(node.id)}
            >
              {t('repeatLinkOtherTargets')}
            </button>
            {node.reasonConceptId ? (
              <p className="inspector-note">{t('repeatPerTargetAssessments')}</p>
            ) : null}
          </>
        ) : null}
        {node.reasonConceptId ? (
          <section className="shared-locked-inspector" data-testid="concept-box">
            <strong>{t('contextBadge')}</strong>
            <p>{t('contextUseHelp', { name: concept?.title ?? '' })}</p>
            <p>{t('repeatReviewContext', { target: parent?.title ?? '' })}</p>
            <button
              type="button"
              className="btn quiet"
              onClick={() => store.selectLibraryReason({ type: 'concept', id: node.reasonConceptId! })}
            >
              {t('contextManage')}
            </button>
            <button
              type="button"
              className="btn quiet"
              disabled={!fullyEditable}
              onClick={() => store.dispatch({ type: 'concept.detach', nodeId: node.id })}
            >
              {t('contextDetach')}
            </button>
          </section>
        ) : null}
        {node.sharedReasonId && shared ? (
          <section className="shared-locked-inspector">
            <strong>{t('sharedBadge')}</strong>
            <p>
              {t('sharedLockedDetail', {
                confidence: shared.confidence,
                influence: signed(shared.influence),
              })}
            </p>
            <button
              type="button"
              className="btn quiet"
              onClick={() => store.selectLibraryReason({ type: 'locked', id: node.sharedReasonId! })}
            >
              {t('sharedManage')}
            </button>
            <button
              type="button"
              className="btn quiet"
              disabled={!fullyEditable}
              onClick={() => store.dispatch({ type: 'shared.detach', nodeId: node.id })}
            >
              {t('sharedDetach')}
            </button>
          </section>
        ) : null}
        <TextArea
          key={`title:${node.id}:${node.title}`}
          id="nodeTitle"
          testId="node-title"
          label={t('claimTitle')}
          value={node.title}
          editable={editable && !node.reasonConceptId}
          maxLength={200}
          autoGrow
          onCommit={(v) => {
            const normalized = v.replace(/\s+/g, ' ').trim();
            if (normalized) store.dispatch({ type: 'node.edit', id: node.id, title: normalized });
          }}
        />
        <TextArea
          key={`details:${node.id}`}
          id="nodeDetails"
          testId="node-details"
          label={t('claimDetails')}
          value={node.details}
          editable={editable}
          maxLength={5000}
          onCommit={(v) => store.dispatch({ type: 'node.edit', id: node.id, details: v })}
        />
        {node.relation === 'option' ? <OptionValues node={node} /> : null}
        {project.mode === 'decision' && node.parentId === null ? <DecisionValueMatrix /> : null}
        {project.mode === 'decision' && (node.parentId === null || node.relation === 'option') ? (
          <button
            type="button"
            className="btn quiet vote-entry"
            data-testid="open-vote"
            onClick={() => store.openDialog('vote')}
          >
            {t('votingButton')}
          </button>
        ) : null}
        {node.parentId ? (
          <>
            <Select
              id="nodeRelation"
              testId="node-relation"
              label={t('relationInitial')}
              value={node.relation}
              choices={allowed}
              editable={editable && node.kind !== 'option'}
              onCommit={(value) => {
                if (value === 'option' && (project.mode !== 'decision' || parent?.parentId !== null)) {
                  store.showMessage(t('optionOnlyRoot'));
                  return;
                }
                const relation = value as Stance;
                const magnitude = Math.abs(node.impact || 3);
                const influence = relation === 'neutral' ? 0 : relation === 'oppose' ? -magnitude : magnitude;
                store.dispatch({
                  type: 'node.template',
                  id: node.id,
                  credence: node.confidence,
                  influence: relation === 'option' ? null : influence,
                });
              }}
            />
            <Select
              id="nodeParent"
              testId="node-parent"
              label={t('parentNode')}
              value={node.parentId}
              choices={parentChoices}
              editable={editable}
              onCommit={(v) => store.dispatch({ type: 'node.move', id: node.id, parentId: v })}
            />
            {node.kind === 'claim' ? (
              <p
                className={`relation-effective ${effective === null ? 'unassessed' : direction}`}
                title={t('relationAssessorExplanation')}
                data-testid="relation-effective"
              >
                {effective === null
                  ? t('relationNoReview')
                  : t('relationEffective', {
                      direction: t(
                        direction === 'support'
                          ? 'supportWord'
                          : direction === 'oppose'
                            ? 'opposeWord'
                            : 'neutralWord'
                      ),
                      impact: signed(effective),
                    })}
              </p>
            ) : null}
          </>
        ) : null}
        {view.workflow !== 'evaluate' ? (
          <div className="assessment-discovery">
            <span>{t('evaluationHint')}</span>
            <button
              type="button"
              className="btn quiet"
              data-testid="evaluate-here"
              onClick={() => {
                store.setView({
                  workflow: 'evaluate',
                  layers: { ...LAYER_PRESETS.analysis, comments: true },
                });
                requestAnimationFrame(() => document.getElementById('nodeConfidence')?.focus());
              }}
            >
              {t('evaluate')}
            </button>
          </div>
        ) : (
          <EvaluateBlock frame={frame} node={node} />
        )}
        <details
          className="inspector-advanced"
          open={advancedOpen}
          onToggle={(e) => {
            inspectorAdvancedOpen = e.currentTarget.open;
            setAdvancedOpen(e.currentTarget.open);
          }}
        >
          <summary>{t('nodeAdvanced')}</summary>
          <div className="inspector-advanced-content">
            <p className="inspector-note">{t('nodeAdvancedHelp')}</p>
            <SemanticSection node={node} editable={editable && !node.reasonConceptId} />
          </div>
        </details>
        {node.kind === 'claim' && node.parentId && node.reasonConceptId ? (
          <section className="repeat-node-connections">
            <div className="inspector-divider" />
            <h3>{t('repeatConnections', { count: conceptUses.length })}</h3>
            {conceptUses.map((use) => {
              const useParent = project.nodes.find((n) => n.id === use.parentId);
              const values = nodeAssessmentSnapshot(frame, t, use);
              return (
                <button
                  key={use.id}
                  type="button"
                  className={`repeat-connection${use.id === node.id ? ' selected' : ''}`}
                  onClick={() => {
                    store.selectLibraryReason(null);
                    store.select(use.id);
                    store.setView({ workflow: 'evaluate' });
                  }}
                >
                  <strong>{useParent?.title ?? '?'}</strong>
                  <small>{`${values?.value ?? EM_DASH} · ${t('repeatOpenReview')}`}</small>
                </button>
              );
            })}
          </section>
        ) : null}
        {linked.length ? (
          <details className="inspector-advanced repeat-legacy-links">
            <summary>{`${t('repeatLegacyConnections')} (${linked.length})`}</summary>
            {linked.map((link) => {
              const otherId = link.sourceId === node.id ? link.targetId : link.sourceId;
              const otherNode = project.nodes.find((n) => n.id === otherId);
              return (
                <p
                  key={link.id}
                  className="inline-link-summary"
                >{`${otherNode?.title ?? '?'} · ${signed(link.relation === 'oppose' ? -link.impact : link.impact)}/5`}</p>
              );
            })}
            <button
              type="button"
              className="btn quiet"
              onClick={() => store.openModal({ kind: 'links', nodeId: node.id })}
            >
              {t('repeatEditLegacyConnections')}
            </button>
          </details>
        ) : null}
        <div className="inspector-divider" />
        <h3 className="inspector-subheading">{t('layerComments')}</h3>
        {view.layers.comments ? (
          <>
            {!comments.length ? <p className="inline-warning">{t('commentsNone')}</p> : null}
            {comments.map((c) => (
              <div key={c.id} className="witt-comment" data-testid={`comment-${c.id}`}>
                <small>{`${project.users.find((u) => u.id === c.authorId)?.name || c.authorName || t('tableUnknownUser')} · ${c.createdAt.slice(0, 10)}`}</small>
                <p>{c.body}</p>
                <button
                  type="button"
                  className="btn quiet"
                  disabled={!fullyEditable}
                  onClick={() => store.dispatch({ type: 'comment.remove', id: c.id })}
                >
                  {t('deleteComment')}
                </button>
              </div>
            ))}
            <textarea
              id="newComment"
              data-testid="comment-body"
              rows={3}
              maxLength={3000}
              placeholder={t('commentPlaceholder')}
              disabled={!fullyEditable}
            />
            <button
              type="button"
              className="btn quiet"
              data-testid="comment-add"
              disabled={!fullyEditable}
              onClick={() => {
                const field = document.getElementById('newComment') as HTMLTextAreaElement | null;
                const body = field?.value ?? '';
                const author = project.users.find((u) => u.id === state.actorId);
                if (
                  body.trim() &&
                  store.dispatch({
                    type: 'comment.add',
                    id: newId(),
                    nodeId: node.id,
                    body,
                    authorName: author?.name ?? '',
                    authorId: state.actorId,
                  }) &&
                  field
                )
                  field.value = '';
              }}
            >
              {t('addComment')}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn quiet"
            onClick={() => store.setView({ layers: { ...view.layers, comments: true } })}
          >
            {t('commentsHidden')}
          </button>
        )}
        {view.workflow === 'evaluate' && project.mode === 'decision' && node.parentId === null ? (
          <OptionsRanking frame={frame} />
        ) : null}
      </>
    );
  })();
  return (
    <aside className="sidepanel inspector-panel" aria-label={t('selectedNode')} data-testid="inspector">
      <div className="panel-heading">
        <div>
          <div className="eyebrow">{t('selectedNode')}</div>
          <h2>{t('editArgument')}</h2>
        </div>
      </div>
      <div id="inspector">{body}</div>
    </aside>
  );
}
