import { useState } from 'react';
import { canAttachReasonConcept } from '../domain/index.ts';
import type { ReasonConcept } from '../domain/index.ts';
import { newId } from '../lib/providers.ts';
import { pairText } from './format.ts';
import { getStore, useAppState, useTranslator } from './store.ts';

/** The card shelf of reusable reasons: create, see every use with its own ratings, attach to the selected node (UX-C01…C03). */
export function RepeatShelf() {
  const state = useAppState();
  const t = useTranslator();
  const store = getStore();
  const { project, actorId, selectedId } = state;
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<ReasonConcept['semanticType']>('fact');
  const concepts = project.reasonConcepts ?? [];
  const canEdit = project.users.find((u) => u.id === actorId)?.role !== 'viewer';
  const create = () => {
    const id = newId();
    const text = title.trim() || t('repeatDefaultTitle');
    if (store.dispatch({ type: 'concept.add', id, title: text, semanticType: kind })) {
      setTitle('');
      store.notify({ kind: 'info', text: t('repeatCreated') });
    }
  };
  return (
    <section className="repeat-shelf" aria-label={t('contextOpen')} data-testid="repeat-shelf">
      <p className="inspector-note">{t('repeatIntro')}</p>
      <form
        className="repeat-create"
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
      >
        <h3>{t('repeatNewTitle')}</h3>
        <label className="field">
          <span className="visually-hidden">{t('repeatEditName')}</span>
          <input
            data-testid="repeat-title"
            value={title}
            maxLength={200}
            placeholder={t('repeatTitlePlaceholder')}
            onChange={(e) => setTitle(e.target.value)}
            disabled={!canEdit}
          />
        </label>
        <label className="field">
          <span>{t('repeatSemantic')}</span>
          <select
            data-testid="repeat-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as ReasonConcept['semanticType'])}
          >
            <option value="fact">{t('contextFact')}</option>
            <option value="assumption">{t('contextAssumption')}</option>
            <option value="value">{t('contextValue')}</option>
          </select>
        </label>
        <button type="submit" className="btn primary" data-testid="repeat-create" disabled={!canEdit}>
          {t('repeatCreate')}
        </button>
      </form>
      <h3>{t('repeatExisting')}</h3>
      {concepts.length === 0 ? <p className="inspector-note">{t('repeatEmpty')}</p> : null}
      <div className="repeat-cards">
        {concepts.map((concept) => {
          const uses = project.nodes.filter((n) => n.reasonConceptId === concept.id);
          const attachable = !!selectedId && canAttachReasonConcept(project, concept.id, selectedId);
          return (
            <article key={concept.id} className="repeat-card" data-testid={`repeat-card-${concept.id}`}>
              <div className="repeat-card-tag">
                {t(
                  concept.semanticType === 'value'
                    ? 'contextValue'
                    : concept.semanticType === 'assumption'
                      ? 'contextAssumption'
                      : 'contextFact'
                )}
              </div>
              <strong>{concept.title}</strong>
              <small>{t('contextUses', { count: uses.length })}</small>
              <ul className="repeat-uses">
                {uses.map((use) => {
                  const target = project.nodes.find((n) => n.id === use.parentId);
                  const vote = project.votes.find((v) => v.nodeId === use.id && v.userId === actorId);
                  const edge = project.edgeAssessments.find(
                    (a) => a.subjectType === 'primary' && a.subjectId === use.id && a.userId === actorId
                  );
                  return (
                    <li key={use.id}>
                      <button
                        type="button"
                        className="btn quiet"
                        data-testid={`repeat-use-${use.id}`}
                        title={t('repeatOpenReview')}
                        onClick={() => store.select(use.id)}
                      >
                        → {target?.title ?? '—'} ·{' '}
                        {pairText(vote ? vote.confidence : null, edge ? edge.influence : null)}
                      </button>
                    </li>
                  );
                })}
              </ul>
              <button
                type="button"
                className="btn quiet"
                data-testid={`repeat-attach-${concept.id}`}
                disabled={!canEdit || !attachable}
                title={attachable ? t('repeatAttach') : t('repeatInvalidTarget')}
                onClick={() => {
                  const nodeId = newId();
                  if (
                    store.dispatch({ type: 'concept.attach', id: concept.id, parentId: selectedId, nodeId })
                  )
                    store.select(nodeId);
                }}
              >
                {t('repeatAttach')}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
