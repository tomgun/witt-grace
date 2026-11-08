// Local profiles (`#peopleDialog`): stable ids, editable names, vote shares, the active identity and the document's
// pooled-weighting choice. Names must stay unique; a removed profile takes its browser-side assessment pass with it
// (inv-review-vote-table §E).
import { useEffect, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { isAiProfile } from '../domain/index.ts';
import type { AssessmentWeighting, User } from '../domain/index.ts';
import { newId } from '../lib/providers.ts';
import { canEdit, isOwner } from './actions.ts';
import { passStore, removeAssessmentPass } from './assessmentPass.ts';
import { getStore, useAppState, useTranslator } from './store.ts';

const MAX_SHARES = 1000000000;
/** A text field commits on change (blur or Enter) like the prototype's `change` event. Enter is taken on keyup so
 * that a notice the commit opens does not receive the same key press on its freshly focused Close button. */
const blurOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
  if (event.key === 'Enter') event.currentTarget.blur();
};

export function PeopleDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const state = useAppState();
  const t = useTranslator();
  const store = getStore();
  const { project, actorId } = state;
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const owner = isOwner(state);
  const current = project.users.find((u) => u.id === actorId) ?? project.users[0];
  const roundOpen = project.votingRound?.status === 'open';
  const nameTaken = (name: string, except: string) =>
    project.users.some((u) => u.id !== except && u.name.toLocaleLowerCase() === name.toLocaleLowerCase());
  const guarded = (run: () => boolean): boolean => {
    if (!canEdit(store.get())) {
      store.showMessage(t('viewerCannotEdit'));
      return false;
    }
    return run();
  };

  const renameCurrent = (input: HTMLInputElement) => {
    const next = input.value.trim();
    if (!current || !next || isAiProfile(current) || nameTaken(next, current.id)) {
      store.showMessage(t('profileNameTaken'));
      input.value = current?.name ?? '';
      return;
    }
    if (next !== current.name)
      guarded(() => store.dispatch({ type: 'user.rename', id: current.id, name: next }));
  };
  const renameUser = (user: User, input: HTMLInputElement) => {
    const next = input.value.trim();
    if (!next || nameTaken(next, user.id)) {
      store.showMessage(t('profileNameTaken'));
      input.value = user.name;
      return;
    }
    if (next !== user.name) guarded(() => store.dispatch({ type: 'user.rename', id: user.id, name: next }));
  };
  const setShares = (user: User, input: HTMLInputElement) => {
    const n = Number(input.value);
    if (input.value.trim() === '' || !Number.isInteger(n) || n < 0 || n > MAX_SHARES) {
      store.showMessage(t('voteInvalidShares'));
      input.value = String(user.shares);
      return;
    }
    if (n !== user.shares) guarded(() => store.dispatch({ type: 'user.setShares', id: user.id, shares: n }));
  };
  const remove = async (user: User) => {
    if (!(await store.askConfirm(t('profileRemoveConfirm', { name: user.name })))) return;
    if (guarded(() => store.dispatch({ type: 'user.remove', id: user.id })))
      removeAssessmentPass(passStore(), project.id, user.id);
  };
  /** The prototype's `addLocalProfile(false)`: the new person is listed, not selected. */
  const addPerson = async () => {
    if (!owner || project.users.length >= 100) {
      store.showMessage(t('viewerCannotEdit'));
      return;
    }
    const name = (await store.askText(t('profileNewPrompt'), t('profileAdd'), t('profileAdd')))?.trim();
    if (!name) return;
    if (name.length > 120 || nameTaken(name, '')) {
      store.showMessage(t('profileNameTaken'));
      return;
    }
    guarded(() => store.dispatch({ type: 'user.add', id: newId(), name, shares: 1, role: 'editor' }));
  };

  return (
    <dialog
      ref={ref}
      id="peopleDialog"
      aria-labelledby="peopleTitle"
      data-testid="people-dialog"
      onClose={onClose}
    >
      <div className="dialog-inner">
        <div className="dialog-heading">
          <h2 id="peopleTitle">{t('profileManage')}</h2>
          <button
            type="button"
            aria-label={t('close')}
            className="btn icon-btn"
            id="btnClosePeople"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        {open ? (
          <>
            <p>{t('profilePrivacy')}</p>
            <div className="current-user-settings">
              <label htmlFor="currentUserName">{t('userRenameCurrent')}</label>
              <input
                type="text"
                id="currentUserName"
                key={`${current?.id}:${current?.name}`}
                maxLength={120}
                autoComplete="nickname"
                defaultValue={current?.name ?? ''}
                disabled={!current || isAiProfile(current)}
                onBlur={(e) => renameCurrent(e.currentTarget)}
                onKeyUp={blurOnEnter}
              />
              <p className="inspector-note">{t('userRenameHelp')}</p>
            </div>
            <div className="assessment-weight-controls">
              <label htmlFor="assessmentWeighting">{t('assessmentWeightingLabel')}</label>
              <select
                id="assessmentWeighting"
                data-testid="assessment-weighting"
                value={project.settings.assessmentWeighting}
                disabled={!owner}
                onChange={(e) =>
                  guarded(() => {
                    if (!isOwner(store.get())) {
                      store.showMessage(t('viewerCannotEdit'));
                      return false;
                    }
                    return store.dispatch({
                      type: 'project.setAssessmentWeighting',
                      weighting: e.target.value as AssessmentWeighting,
                    });
                  })
                }
              >
                <option value="structural">{t('assessmentWeightStructural')}</option>
                <option value="equal">{t('assessmentWeightEqual')}</option>
                <option value="shares">{t('assessmentWeightShares')}</option>
              </select>
              <p className="inspector-note">{t('assessmentWeightHint')}</p>
            </div>
            <div id="peopleList" data-testid="people-list">
              {project.users.map((user) => {
                const votes = project.votes.filter((v) => v.userId === user.id).length;
                const impacts = (project.edgeAssessments ?? []).filter((a) => a.userId === user.id).length;
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
                        key={user.name}
                        defaultValue={user.name}
                        maxLength={120}
                        disabled={!(owner || mine)}
                        aria-label={t('profileName')}
                        onBlur={(e) => renameUser(user, e.currentTarget)}
                        onKeyUp={blurOnEnter}
                      />
                    </label>
                    <label className="person-shares">
                      {t('votePersonShares')}
                      <input
                        key={user.shares}
                        type="number"
                        min={0}
                        max={MAX_SHARES}
                        step={1}
                        defaultValue={String(user.shares)}
                        disabled={!owner || roundOpen}
                        aria-label={`${t('votePersonShares')}: ${user.name}`}
                        onBlur={(e) => setShares(user, e.currentTarget)}
                        onKeyUp={blurOnEnter}
                      />
                    </label>
                    <small className="profile-counter">
                      {`${isAiProfile(user) ? 'AI · ' : ''}${votes} ${t('profileCredenceShort')} · ${impacts} ${t(
                        'profileInfluenceShort'
                      )}`}
                    </small>
                    <div className="profile-actions">
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
                          onClick={() => void remove(user)}
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
                id="btnAddPerson"
                data-testid="people-add"
                disabled={!owner || project.users.length >= 100}
                onClick={() => void addPerson()}
              >
                {t('profileAdd')}
              </button>
              <button type="button" className="btn primary" id="btnDialogClose" onClick={onClose}>
                {t('close')}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </dialog>
  );
}
