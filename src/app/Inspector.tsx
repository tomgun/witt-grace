import { useState } from 'react';
import {
  assessmentFields,
  canReparent,
  isAiProfile,
  personalCredence,
  personalInfluence,
  rootNode,
  truthAssessable,
} from '../domain/index.ts';
import type { Node, Scores, SemanticType, Stance } from '../domain/index.ts';
import { newId } from '../lib/providers.ts';
import { DecisionOverview } from './DecisionOverview.tsx';
import { balanceText, credenceText, influenceText, signed } from './format.ts';
import { getStore, useAppState, useTranslator } from './store.ts';

const SEMANTIC: SemanticType[] = ['unspecified', 'fact', 'assumption', 'value', 'constraint', 'prerequisite'];

function TextField({
  id,
  label,
  value,
  onCommit,
  rows,
  maxLength,
  disabled,
  testId,
}: {
  id: string;
  label: string;
  value: string;
  onCommit: (v: string) => void;
  rows: number;
  maxLength: number;
  disabled?: boolean;
  testId: string;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <textarea
        id={id}
        data-testid={testId}
        rows={rows}
        maxLength={maxLength}
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft !== value && onCommit(draft)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && rows === 1) {
            e.preventDefault();
            (e.target as HTMLTextAreaElement).blur();
          }
        }}
      />
    </div>
  );
}

function ReviewSliders({ node }: { node: Node }) {
  const state = useAppState();
  const t = useTranslator();
  const store = getStore();
  const { project, actorId } = state;
  const fields = assessmentFields(node);
  const vote = personalCredence(project, node.id, actorId);
  const influence = fields.impact ? personalInfluence(project, 'primary', node.id, actorId) : null;
  const currentInfluence = influence?.current && influence.record ? influence.record.influence : null;
  const [credence, setCredence] = useState<number>(vote?.confidence ?? node.confidence);
  const [impact, setImpact] = useState<number>(
    currentInfluence ?? influence?.relation.suggestedInfluence ?? 0
  );
  const ai = isAiProfile(project.users.find((u) => u.id === actorId));
  const save = () =>
    store.dispatch({
      type: 'review.personal',
      voteId: newId(),
      assessmentId: newId(),
      nodeId: node.id,
      userId: actorId,
      credence: fields.credence ? Math.round(credence) : null,
      influence: fields.impact ? impact : null,
    });
  if (!fields.credence && !fields.impact) return null;
  return (
    <section className="review-section" aria-label={t('indexPersonal')} data-testid="review-section">
      <h3>{t('indexPersonal')}</h3>
      {fields.credence ? (
        <div className="field">
          <label htmlFor="reviewCredence">
            {t('assessmentCredenceAxis')}{' '}
            <output data-testid="review-credence-value">{credenceText(credence)}</output>
            {vote ? '' : ` (${t('notAssessed')})`}
          </label>
          <input
            id="reviewCredence"
            data-testid="review-credence"
            type="range"
            min={0}
            max={100}
            step={1}
            value={credence}
            onChange={(e) => setCredence(Number(e.target.value))}
          />
        </div>
      ) : null}
      {fields.impact ? (
        <div className="field">
          <label htmlFor="reviewInfluence">
            {t('assessmentImpactAxis')}{' '}
            <output data-testid="review-influence-value">{influenceText(impact)}</output>
            {currentInfluence === null ? ` (${t('personalNotAssessed')})` : ''}
          </label>
          <input
            id="reviewInfluence"
            data-testid="review-influence"
            type="range"
            min={-5}
            max={5}
            step={0.5}
            value={impact}
            onChange={(e) => setImpact(Number(e.target.value))}
          />
        </div>
      ) : null}
      <button
        type="button"
        className="btn primary"
        data-testid="review-save"
        onClick={save}
        title={ai ? t('aiAuthored') : undefined}
      >
        {t('confirm')}
      </button>
      <p className="inspector-note">{t('sharedMeanNote')}</p>
    </section>
  );
}

/** The right panel: the selected node's text, relation, template, this person's review and the explanation of its score. */
export function Inspector({ scores }: { scores: Scores }) {
  const state = useAppState();
  const t = useTranslator();
  const store = getStore();
  const { project } = state;
  const node = project.nodes.find((n) => n.id === state.selectedId);
  if (!node) return <aside className="sidepanel inspector-panel" aria-label={t('selectedNode')} />;
  const score = scores.get(node.id);
  const root = rootNode(project);
  const isRoot = node.parentId === null;
  const canEdit =
    project.users.find((u) => u.id === state.actorId)?.role !== 'viewer' && !node.sharedReasonId;
  const parent = node.parentId ? project.nodes.find((n) => n.id === node.parentId) : undefined;
  const relationChoices: [Stance, string][] = [
    ['support', t('supportWord')],
    ['oppose', t('opposeWord')],
    ['neutral', t('neutralWord')],
  ];
  const parentChoices = project.nodes.filter((n) => canReparent(project, node.id, n.id));
  const comments = project.comments.filter((c) => c.nodeId === node.id);
  return (
    <aside className="sidepanel inspector-panel" aria-label={t('selectedNode')} data-testid="inspector">
      <div className="panel-heading">
        <div>
          <div className="eyebrow">{t('selectedNode')}</div>
          <h2>{t('editArgument')}</h2>
        </div>
      </div>
      <div className="inspector-body">
        <p className="inspector-note">{isRoot ? t('rootNote') : t('impactNote')}</p>
        <TextField
          key={`${node.id}:title:${node.title}`}
          id="nodeTitle"
          testId="node-title"
          label={t('claimTitle')}
          value={node.title}
          rows={1}
          maxLength={200}
          disabled={!canEdit || !!node.reasonConceptId}
          onCommit={(value) => {
            const title = value.replace(/\s+/g, ' ').trim();
            if (title) store.dispatch({ type: 'node.edit', id: node.id, title });
          }}
        />
        <TextField
          id="nodeDetails"
          testId="node-details"
          label={t('claimDetails')}
          value={node.details}
          rows={4}
          maxLength={5000}
          disabled={!canEdit}
          onCommit={(details) => store.dispatch({ type: 'node.edit', id: node.id, details })}
        />
        {!isRoot && node.kind === 'claim' ? (
          <div className="field">
            <label htmlFor="nodeRelation">{t('relationInitial')}</label>
            <select
              id="nodeRelation"
              data-testid="node-relation"
              value={node.relation}
              disabled={!canEdit}
              onChange={(e) => {
                const relation = e.target.value as Stance;
                const influence =
                  relation === 'neutral' ? 0 : relation === 'oppose' ? -node.impact : node.impact;
                store.dispatch({
                  type: 'node.template',
                  id: node.id,
                  credence: node.confidence,
                  influence:
                    node.impact === 0 && relation !== 'neutral'
                      ? relation === 'oppose'
                        ? -3
                        : 3
                      : influence,
                });
              }}
            >
              {relationChoices.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {!isRoot && parentChoices.length ? (
          <div className="field">
            <label htmlFor="nodeParent">{t('parentNode')}</label>
            <select
              id="nodeParent"
              data-testid="node-parent"
              value={node.parentId ?? ''}
              disabled={!canEdit}
              onChange={(e) => store.dispatch({ type: 'node.move', id: node.id, parentId: e.target.value })}
            >
              {parent && !parentChoices.some((n) => n.id === parent.id) ? (
                <option value={parent.id}>{parent.title}</option>
              ) : null}
              {parentChoices.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.title.slice(0, 44)}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {node.kind === 'claim' ? (
          <div className="field">
            <label htmlFor="nodeSemantic">{t('semanticType')}</label>
            <select
              id="nodeSemantic"
              data-testid="node-semantic"
              value={node.semanticType ?? 'unspecified'}
              disabled={!canEdit}
              onChange={(e) =>
                store.dispatch({
                  type: 'node.edit',
                  id: node.id,
                  semanticType: e.target.value as SemanticType,
                })
              }
            >
              {SEMANTIC.map((kind) => (
                <option key={kind} value={kind}>
                  {t(`semantic_${kind}`)}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {node.semanticType === 'constraint' || node.semanticType === 'prerequisite' ? (
          <div className="field">
            <label htmlFor="nodeConstraint">{t('constraintStatus')}</label>
            <select
              id="nodeConstraint"
              data-testid="node-constraint"
              value={node.constraintStatus ?? 'unknown'}
              disabled={!canEdit}
              onChange={(e) =>
                store.dispatch({
                  type: 'node.edit',
                  id: node.id,
                  constraintStatus: e.target.value as 'unknown' | 'met' | 'unmet',
                })
              }
            >
              {(['unknown', 'met', 'unmet'] as const).map((status) => (
                <option key={status} value={status}>
                  {t(`feasibility_${status}`)}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {project.mode === 'decision' && isRoot ? <DecisionOverview scores={scores} /> : null}
        <section className="score-section" aria-label={t('layerIndex')} data-testid="score-section">
          <h3>
            {t('layerIndex')} · {state.view.viewpoint === 'personal' ? t('indexPersonal') : t('indexShared')}
          </h3>
          <p className="score-value" data-testid="score-balance">
            {balanceText(score?.balance ?? null)}
            {score?.incomplete ? <small> · {t('balanceIncomplete')}</small> : null}
          </p>
          {score && score.contributions.length ? (
            <ul className="score-contributions">
              {score.contributions.map((c) => (
                <li key={c.id} data-testid={`contribution-${c.id}`}>
                  {c.title}:{' '}
                  {c.missing
                    ? t('notAssessed')
                    : t('scoreContributionDetail', {
                        impact: signed(c.impact ?? 0),
                        strength: Math.round(c.strength ?? 0),
                        magnitude: (c.magnitude ?? 0).toFixed(2),
                      })}
                </li>
              ))}
            </ul>
          ) : null}
          {truthAssessable(node) && node.kind === 'claim' && !isRoot ? (
            <p className="inspector-note">
              {t('profileBaselineNote')} {credenceText(node.confidence)}/
              {influenceText(
                node.relation === 'neutral' ? 0 : node.relation === 'oppose' ? -node.impact : node.impact
              )}
            </p>
          ) : null}
        </section>
        {node.kind === 'claim' && !node.sharedReasonId ? (
          <ReviewSliders key={`${node.id}:${project.updatedAt}:${state.actorId}`} node={node} />
        ) : null}
        <section className="comments-section" aria-label={t('layerComments')}>
          <h3>{t('layerComments')}</h3>
          <ul className="comment-list">
            {comments.map((c) => (
              <li key={c.id} data-testid={`comment-${c.id}`}>
                <strong>{c.authorName}</strong> <small>{c.createdAt.slice(0, 10)}</small>
                <p>{c.body}</p>
                {canEdit ? (
                  <button
                    type="button"
                    className="btn quiet"
                    onClick={() => store.dispatch({ type: 'comment.remove', id: c.id })}
                  >
                    {t('deleteComment')}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const body = (new FormData(form).get('body') as string) ?? '';
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
                })
              )
                form.reset();
            }}
          >
            <label className="visually-hidden" htmlFor="commentBody">
              {t('addComment')}
            </label>
            <textarea
              id="commentBody"
              name="body"
              data-testid="comment-body"
              rows={2}
              maxLength={3000}
              placeholder={t('commentPlaceholder')}
              disabled={!canEdit}
            />
            <button type="submit" className="btn quiet" data-testid="comment-add" disabled={!canEdit}>
              {t('addComment')}
            </button>
          </form>
        </section>
        {root && node.id !== root.id ? (
          <p className="inspector-note">
            {t('authoredBy')}: {project.users.find((u) => u.id === node.createdBy)?.name ?? '—'}
          </p>
        ) : null}
      </div>
    </aside>
  );
}
