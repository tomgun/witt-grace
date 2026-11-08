import { useState } from 'react';
import { canReuseClaimAt } from '../domain/index.ts';
import { newId } from '../lib/providers.ts';
import { Modal } from './dialogs.tsx';
import { getStore, useAppState, useTranslator } from './store.ts';

/** "Liitä myös muihin solmuihin…": one claim becomes a reusable concept with a new, separately rated use (UX-C04). */
export function ReuseDialog({ sourceId, onClose }: { sourceId: string | null; onClose: () => void }) {
  const state = useAppState();
  const t = useTranslator();
  const store = getStore();
  const { project } = state;
  const [targetId, setTargetId] = useState('');
  const source = sourceId ? project.nodes.find((n) => n.id === sourceId) : undefined;
  const targets = source ? project.nodes.filter((n) => canReuseClaimAt(project, source.id, n.id)) : [];
  const attach = () => {
    if (!source || !targetId) return;
    const nodeId = newId();
    if (
      store.dispatch({
        type: 'concept.reuse',
        sourceId: source.id,
        targetId,
        conceptId: source.reasonConceptId ?? newId(),
        nodeId,
      })
    ) {
      store.select(nodeId);
      onClose();
    }
  };
  return (
    <Modal open={!!source} onClose={onClose} title={t('contextTitle')} testId="reuse-dialog">
      <p className="inspector-note">{t('contextIntro')}</p>
      <p>
        <strong>{source?.title}</strong>
      </p>
      <label className="field">
        <span>{t('repeatChooseTarget')}</span>
        <select data-testid="reuse-target" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
          <option value="">{t('repeatChooseTarget')}…</option>
          {targets.map((n) => (
            <option key={n.id} value={n.id}>
              {n.title.slice(0, 60)}
            </option>
          ))}
        </select>
      </label>
      {targets.length === 0 ? <p className="inspector-note">{t('repeatInvalidTarget')}</p> : null}
      <p className="inspector-note">{t('repeatPerTargetAssessments')}</p>
      <div className="dialog-actions">
        <button type="button" className="btn quiet" onClick={onClose}>
          {t('cancel')}
        </button>
        <button
          type="button"
          className="btn primary"
          data-testid="reuse-attach"
          disabled={!targetId}
          onClick={attach}
        >
          {t('repeatAttach')}
        </button>
      </div>
    </Modal>
  );
}
