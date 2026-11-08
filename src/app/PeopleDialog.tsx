import { isAiProfile } from '../domain/index.ts';
import type { AssessmentWeighting } from '../domain/index.ts';
import { newId } from '../lib/providers.ts';
import { Modal } from './dialogs.tsx';
import { getStore, useAppState, useTranslator } from './store.ts';

/** Local profiles: stable ids, editable names, vote shares, the pooled-weighting choice (U-01, V-03, G-03). */
export function PeopleDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const state = useAppState();
  const t = useTranslator();
  const store = getStore();
  const { project, actorId } = state;
  const owner = project.users.find((u) => u.id === actorId)?.role === 'owner';
  const roundOpen = project.votingRound?.status === 'open';
  const addPerson = () => {
    const name = window.prompt(t('profileNewPrompt'));
    if (!name?.trim()) return;
    const id = newId();
    if (store.dispatch({ type: 'user.add', id, name })) store.setActor(id);
  };
  return (
    <Modal open={open} onClose={onClose} title={t('profileManage')} testId="people-dialog">
      <p className="inspector-note">{t('profilePrivacy')}</p>
      <label className="field">
        <span>{t('assessmentWeightingLabel')}</span>
        <select
          data-testid="assessment-weighting"
          value={project.settings.assessmentWeighting}
          disabled={!owner}
          onChange={(e) =>
            store.dispatch({
              type: 'project.setAssessmentWeighting',
              weighting: e.target.value as AssessmentWeighting,
            })
          }
        >
          <option value="equal">{t('assessmentWeightEqual')}</option>
          <option value="shares">{t('assessmentWeightShares')}</option>
          <option value="structural">{t('assessmentWeightStructural')}</option>
        </select>
        <small className="inspector-note">{t('assessmentWeightHint')}</small>
      </label>
      <div data-testid="people-list">
        {project.users.map((user) => {
          const votes = project.votes.filter((v) => v.userId === user.id).length;
          const impacts = project.edgeAssessments.filter((a) => a.userId === user.id).length;
          const mine = user.id === actorId;
          return (
            <div
              key={user.id}
              className={`person-row${mine ? ' active-profile' : ''}`}
              data-testid={`person-${user.id}`}
            >
              <label>
                {t('profileName')}
                <input
                  defaultValue={user.name}
                  maxLength={120}
                  disabled={!(owner || mine)}
                  aria-label={`${t('profileName')}: ${user.name}`}
                  onBlur={(e) =>
                    e.target.value.trim() !== user.name &&
                    store.dispatch({ type: 'user.rename', id: user.id, name: e.target.value })
                  }
                />
              </label>
              <label>
                {t('votePersonShares')}
                <input
                  type="number"
                  min={0}
                  max={1000000000}
                  step={1}
                  defaultValue={user.shares}
                  disabled={!owner || roundOpen}
                  aria-label={`${t('votePersonShares')}: ${user.name}`}
                  onBlur={(e) => {
                    const n = Number(e.target.value);
                    if (!Number.isInteger(n) || n < 0 || n > 1000000000)
                      store.notify({ kind: 'error', text: t('voteInvalidShares') });
                    else if (n !== user.shares)
                      store.dispatch({ type: 'user.setShares', id: user.id, shares: n });
                  }}
                />
              </label>
              <div className="profile-actions">
                <small>
                  {isAiProfile(user) ? 'AI · ' : ''}
                  {votes} {t('profileCredenceShort')} · {impacts} {t('profileInfluenceShort')}
                </small>
                <button
                  type="button"
                  className="btn quiet"
                  disabled={mine}
                  onClick={() => store.setActor(user.id)}
                >
                  {mine ? t('profileSelected') : t('profileSwitch')}
                </button>
                {user.role !== 'owner' ? (
                  <button
                    type="button"
                    className="btn quiet"
                    disabled={!owner}
                    onClick={() =>
                      window.confirm(t('profileRemoveConfirm', { name: user.name })) &&
                      store.dispatch({ type: 'user.remove', id: user.id })
                    }
                  >
                    {t('profileRemove')}
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      <div className="dialog-actions">
        <button
          type="button"
          className="btn quiet"
          data-testid="people-add"
          disabled={!owner || project.users.length >= 100}
          onClick={addPerson}
        >
          {t('profileAdd')}
        </button>
        <button type="button" className="btn primary" onClick={onClose}>
          {t('close')}
        </button>
      </div>
    </Modal>
  );
}
