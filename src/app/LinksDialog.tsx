// Legacy secondary links of one claim: signed strength, own review, group mean, removal (inv-inspector §17).
import { useEffect, useState } from 'react';
import {
  influenceSummary,
  personalInfluence,
  secondaryOverlapWarning,
  signedLinkImpact,
} from '../domain/index.ts';
import { canEdit } from './actions.ts';
import { signed } from './derive.ts';
import { Modal } from './dialogs.tsx';
import { InfluenceStatusTag } from './Inspector.tsx';
import type { Frame } from './projection.ts';
import { newId } from '../lib/providers.ts';
import { getStore, useAppState, useTranslator } from './store.ts';
import type { ModalRequest } from './store.ts';

export function LinksDialog({
  request,
  frame,
}: {
  request: Extract<ModalRequest, { kind: 'links' }>;
  frame: Frame;
}) {
  const state = useAppState();
  const t = useTranslator();
  const store = getStore();
  const { project, actorId } = state;
  const editable = canEdit(state);
  const source = project.nodes.find((n) => n.id === request.nodeId);
  const [drafts, setDrafts] = useState<Record<string, number>>({});
  useEffect(() => {
    if (request.linkId)
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLElement>(`.link-row[data-link-id="${CSS.escape(request.linkId!)}"]`)
          ?.scrollIntoView({ block: 'nearest' })
      );
  }, [request.linkId]);
  if (!source) return null;
  const me = project.users.find((u) => u.id === actorId);
  const links = (project.links ?? []).filter((l) => l.sourceId === source.id || l.targetId === source.id);
  void frame;
  return (
    <Modal
      open
      onClose={() => store.closeModal()}
      title={t('secondaryLinks')}
      id="linkDialog"
      testId="link-dialog"
      className="link-dialog"
      heading={false}
    >
      <div className="eyebrow">{t('linkPreviewLabel')}</div>
      <p id="linkSourceTitle" className="link-source-title">
        {source.title}
      </p>
      <p className="inline-warning">{t('linkScoreNotice')}</p>
      <h3>{t('existingLinksHeading')}</h3>
      <div id="existingLinks">
        {!links.length ? <p className="inline-warning">{t('noSecondaryLinks')}</p> : null}
        {links.map((link) => {
          const origin = project.nodes.find((n) => n.id === link.sourceId);
          const destination = project.nodes.find((n) => n.id === link.targetId);
          const current = drafts[link.id] ?? signedLinkImpact(link);
          const own = personalInfluence(project, 'secondary', link.id, actorId);
          const summary = influenceSummary(project, 'secondary', link.id);
          return (
            <div
              key={link.id}
              className={`link-row${request.linkId === link.id ? ' link-row-focused' : ''}`}
              data-link-id={link.id}
            >
              <div className="link-direction">
                {origin?.title} → {destination?.title}
              </div>
              <div className="link-fields">
                <input
                  type="range"
                  min={-5}
                  max={5}
                  step={0.5}
                  value={current}
                  aria-label={t('linkSignedAxis')}
                  disabled={!editable}
                  onChange={(e) => setDrafts({ ...drafts, [link.id]: Number(e.target.value) })}
                  onBlur={() => {
                    const strength = drafts[link.id];
                    if (strength === undefined || strength === signedLinkImpact(link)) return;
                    if (store.dispatch({ type: 'link.update', id: link.id, value: strength }))
                      store.dispatch({
                        type: 'review.influence',
                        id: newId(),
                        subjectType: 'secondary',
                        subjectId: link.id,
                        userId: actorId,
                        influence: strength,
                      });
                  }}
                />
                <output className="link-signed-output">{signed(current)}</output>
                <button
                  type="button"
                  className="btn danger"
                  disabled={!editable}
                  onClick={() => store.dispatch({ type: 'link.remove', id: link.id })}
                >
                  {t('removeLink')}
                </button>
              </div>
              <label className="profile-link-label">
                {t('profileInfluence')} · {me?.name ?? ''}
                <input
                  type="number"
                  min={-5}
                  max={5}
                  step={0.5}
                  disabled={!editable}
                  defaultValue={
                    own.current && own.record ? own.record.influence : own.relation.suggestedInfluence
                  }
                  aria-label={`${t('profileInfluence')} · ${me?.name ?? ''}`}
                  onChange={(e) =>
                    store.dispatch({
                      type: 'review.influence',
                      id: newId(),
                      subjectType: 'secondary',
                      subjectId: link.id,
                      userId: actorId,
                      influence: Number(e.target.value),
                    })
                  }
                />
              </label>
              <small className="profile-link-hint">
                {summary.count
                  ? `${t('profileMean')}: ${signed(Number((summary.mean ?? 0).toFixed(1)))} / 5 · ${summary.count}`
                  : t('profileSuggested')}
              </small>
              <InfluenceStatusTag summary={summary} />
              {own.record && !own.current ? (
                <small className="profile-stale">{t('profileStale')}</small>
              ) : null}
              {secondaryOverlapWarning(project, link) ? (
                <p className="link-route-note">{t('linkOverlapWarning')}</p>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="dialog-actions">
        <button type="button" id="linkClose" className="btn quiet" onClick={() => store.closeModal()}>
          {t('closeLinkDialog')}
        </button>
      </div>
    </Modal>
  );
}
