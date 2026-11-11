// Live collaboration UI (WG-030, UI_INVENTORY S-15): the collaboration dialog (start, invite, participants, end),
// the join dialog a link opens, the notice when a session ends, and the status chip beside the document title.
import { useState } from 'react';
import { MIN_PASSWORD_LENGTH, isRelayUrl, normalizePassword, parseInvite } from '../domain/index.ts';
import type { Signal } from '../domain/index.ts';
import { suggestPassword } from '../lib/p2p/keys.ts';
import type { CollabStatus } from '../lib/p2p/session.ts';
import {
  ENDED_TEXT,
  cancelJoin,
  closeCollab,
  inviteUrl,
  join,
  readSignal,
  startCollab,
  useJoinRequest,
} from './collab.ts';
import { Modal } from './dialogs.tsx';
import { getStore, useAppState, useTranslator } from './store.ts';

function CopyField({ id, value, label }: { id: string; value: string; label: string }) {
  const t = useTranslator();
  const [copied, setCopied] = useState(false);
  return (
    <div className="collab-link-row">
      <label className="visually-hidden" htmlFor={id}>
        {label}
      </label>
      <input id={id} data-testid={id} readOnly value={value} onFocus={(e) => e.target.select()} />
      <button
        type="button"
        className="btn quiet"
        onClick={() => {
          void navigator.clipboard?.writeText(value).then(
            () => setCopied(true),
            () => setCopied(false)
          );
        }}
      >
        {t('collabCopy')}
      </button>
      <span role="status" className="collab-copied">
        {copied ? t('collabCopied') : ''}
      </span>
    </div>
  );
}

function PrivacyNote({ signal }: { signal: Signal }) {
  const t = useTranslator();
  return (
    <div className="inspector-note collab-privacy" id="collabPrivacy">
      <p>{t('collabPrivacyStore')}</p>
      <p>{t('collabPrivacyPeers')}</p>
      <p>
        {signal.strategy === 'nostr'
          ? t('collabPrivacyNostr')
          : t('collabPrivacyRelay', { url: signal.urls.join(', ') })}
      </p>
    </div>
  );
}

function StartSection() {
  const t = useTranslator();
  const store = getStore();
  const remembered = readSignal();
  const [source, setSource] = useState<'current' | 'argument' | 'decision'>('current');
  const [strategy, setStrategy] = useState<Signal['strategy']>(remembered.strategy);
  const [relay, setRelay] = useState(remembered.strategy === 'relay' ? remembered.urls.join(' ') : '');
  const [busy, setBusy] = useState(false);
  const relayUrls = relay.split(/\s+/).filter(Boolean);
  const relayValid = relayUrls.length > 0 && relayUrls.length <= 5 && relayUrls.every(isRelayUrl);
  const signal: Signal =
    strategy === 'relay' && relayValid ? { strategy: 'relay', urls: relayUrls } : { strategy: 'nostr' };
  const start = async () => {
    setBusy(true);
    const ok = await startCollab(source, signal);
    setBusy(false);
    if (ok) store.openDialog('collab');
  };
  return (
    <>
      <p>{t('collabIntro')}</p>
      <fieldset className="collab-source">
        <legend>{t('collabWhat')}</legend>
        {(['current', 'argument', 'decision'] as const).map((value) => (
          <label key={value}>
            <input
              type="radio"
              name="collabSource"
              id={`collabSource-${value}`}
              checked={source === value}
              onChange={() => setSource(value)}
            />{' '}
            {value === 'current'
              ? t('collabSourceCurrent', { title: store.get().project.title })
              : t(value === 'argument' ? 'newBlankArgument' : 'newBlankDecision')}
          </label>
        ))}
      </fieldset>
      <PrivacyNote signal={signal} />
      <details className="collab-advanced">
        <summary>{t('collabAdvanced')}</summary>
        <label>
          <input
            type="radio"
            name="collabSignal"
            id="collabSignalNostr"
            checked={strategy === 'nostr'}
            onChange={() => setStrategy('nostr')}
          />{' '}
          {t('collabSignalNostr')}
        </label>
        <label>
          <input
            type="radio"
            name="collabSignal"
            id="collabSignalRelay"
            checked={strategy === 'relay'}
            onChange={() => setStrategy('relay')}
          />{' '}
          {t('collabSignalRelay')}
        </label>
        <input
          id="collabRelayUrl"
          data-testid="collab-relay-url"
          placeholder="wss://…"
          value={relay}
          disabled={strategy !== 'relay'}
          aria-label={t('collabSignalRelay')}
          onChange={(e) => setRelay(e.target.value)}
        />
        {strategy === 'relay' && !relayValid ? (
          <p className="inline-warning">{t('collabRelayInvalid')}</p>
        ) : null}
      </details>
      <div className="dialog-actions">
        <button type="button" className="btn quiet" onClick={() => store.openDialog(null)}>
          {t('cancel')}
        </button>
        <button
          type="button"
          id="btnCollabStart"
          className="btn primary"
          disabled={busy || (strategy === 'relay' && !relayValid)}
          onClick={() => void start()}
        >
          {busy ? t('collabConnecting') : t('collabStart')}
        </button>
      </div>
    </>
  );
}

function People({ status, onReissue }: { status: CollabStatus; onReissue?: (userId: string) => void }) {
  const t = useTranslator();
  const store = getStore();
  const link = store.collabLink();
  return (
    <section aria-labelledby="collabPeopleHeading">
      <h3 id="collabPeopleHeading">{t('collabPeople')}</h3>
      <ul id="collabPeople" data-testid="collab-people" className="collab-people">
        {status.people.map((person) => (
          <li key={person.userId}>
            <span>
              {person.online ? '●' : '○'} {person.name}
              {person.host ? ` · ${t('collabHostTag')}` : ''}
              {person.userId === status.selfUserId ? ` · ${t('collabYouTag')}` : ''}
              {person.online ? '' : ` · ${t('collabAway')}`}
            </span>
            {link?.role === 'host' && !person.host ? (
              <span className="collab-person-actions">
                {onReissue ? (
                  <button type="button" className="btn quiet" onClick={() => onReissue(person.userId)}>
                    {t('collabReissue')}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn quiet"
                  onClick={async () => {
                    if (await store.askConfirm(t('collabRemoveConfirm', { name: person.name })))
                      link.session.remove(person.userId);
                  }}
                >
                  {t('collabRemove')}
                </button>
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function HostSection({
  status,
  chosen,
  choose,
}: {
  status: CollabStatus;
  chosen: string;
  choose: (id: string) => void;
}) {
  const t = useTranslator();
  const store = getStore();
  const state = useAppState();
  const link = store.collabLink();
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'personal' | 'password'>('personal');
  const [password, setPassword] = useState(() => suggestPassword(state.language));
  const [busy, setBusy] = useState(false);
  /** Passwords made in this dialog, shown once beside their link (the host keeps only a verifier). */
  const [made, setMade] = useState<Record<string, string>>({});
  if (link?.role !== 'host') return null;
  const people = state.project.users.filter((u) => u.id !== status.selfUserId && u.profileKind !== 'ai');
  const hasLink = (id: string) =>
    status.invites.some((i) => i.userId === id) || status.people.some((p) => p.userId === id);
  const weak = mode === 'password' && normalizePassword(password).length < MIN_PASSWORD_LENGTH;
  const invite = async () => {
    if (!chosen && !name.trim()) return;
    if (mode === 'password' && !normalizePassword(password)) return;
    const target = chosen ? state.project.users.find((u) => u.id === chosen) : null;
    if (
      target &&
      hasLink(target.id) &&
      !(await store.askConfirm(t('collabReissueConfirm', { name: target.name })))
    )
      return;
    setBusy(true);
    const created = await link.session.invite(
      chosen ? { userId: chosen } : { name: name.trim() },
      mode === 'password' ? { mode, password } : { mode }
    );
    setBusy(false);
    const token = parseInvite(created);
    if (token.ok && mode === 'password') setMade({ ...made, [token.invite.access.token]: password });
    setName('');
    choose('');
    setPassword(suggestPassword(state.language));
  };
  return (
    <>
      <section aria-labelledby="collabGeneralHeading">
        <h3 id="collabGeneralHeading">{t('collabGeneralLink')}</h3>
        <p className="inspector-note">{t('collabGeneralHelp')}</p>
        <CopyField id="collabLink" value={inviteUrl(status.link ?? '')} label={t('collabGeneralLink')} />
        <label className="collab-check">
          <input
            type="checkbox"
            id="collabGeneralOpen"
            checked={status.generalOpen}
            onChange={(e) => link.session.setGeneralOpen(e.target.checked)}
          />{' '}
          {t('collabGeneralOpen')}
        </label>
      </section>
      <section aria-labelledby="collabInvitesHeading" id="collabInviteForm">
        <h3 id="collabInvitesHeading">{t('collabPersonal')}</h3>
        <p className="inspector-note">{t('collabPersonalHelp')}</p>
        <div className="collab-invite-row">
          {people.length ? (
            <select
              id="collabInviteProfile"
              aria-label={t('collabInviteProfile')}
              value={chosen}
              onChange={(e) => choose(e.target.value)}
            >
              <option value="">{t('collabInviteNew')}</option>
              {people.map((u) => (
                <option key={u.id} value={u.id}>
                  {hasLink(u.id) ? t('collabInviteReplaces', { name: u.name }) : u.name}
                </option>
              ))}
            </select>
          ) : null}
          {chosen ? null : (
            <input
              id="collabInviteName"
              data-testid="collab-invite-name"
              maxLength={110}
              placeholder={t('collabInviteName')}
              aria-label={t('collabInviteName')}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </div>
        <fieldset className="collab-mode">
          <legend className="visually-hidden">{t('collabInviteMode')}</legend>
          <label>
            <input
              type="radio"
              name="collabInviteMode"
              id="collabModePersonal"
              checked={mode === 'personal'}
              onChange={() => setMode('personal')}
            />{' '}
            {t('collabModePersonal')}
          </label>
          <label>
            <input
              type="radio"
              name="collabInviteMode"
              id="collabModePassword"
              checked={mode === 'password'}
              onChange={() => setMode('password')}
            />{' '}
            {t('collabModePassword')}
          </label>
        </fieldset>
        {mode === 'password' ? (
          <div className="collab-invite-row">
            <label className="visually-hidden" htmlFor="collabInvitePassword">
              {t('collabPassword')}
            </label>
            <input
              id="collabInvitePassword"
              data-testid="collab-invite-password"
              autoComplete="off"
              spellCheck={false}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="btn quiet"
              onClick={() => setPassword(suggestPassword(state.language))}
            >
              {t('collabPasswordSuggest')}
            </button>
          </div>
        ) : null}
        {weak ? (
          <p className="inline-warning">{t('collabPasswordWeak', { count: MIN_PASSWORD_LENGTH })}</p>
        ) : null}
        <p className="inspector-note">
          {mode === 'password' ? t('collabModePasswordHelp') : t('collabModePersonalHelp')}
        </p>
        <button
          type="button"
          id="btnCollabInvite"
          className="btn quiet"
          onClick={() => void invite()}
          disabled={
            busy || (!chosen && !name.trim()) || (mode === 'password' && !normalizePassword(password))
          }
        >
          {busy ? t('collabConnecting') : t('collabInviteCreate')}
        </button>
        <ul className="collab-invites" id="collabInvites">
          {status.invites.map((i) => (
            <li key={i.token}>
              <strong>{i.name}</strong> ·{' '}
              {i.locked
                ? t('collabInviteLocked', { count: i.failures })
                : i.mode === 'password'
                  ? t('collabInvitePassword')
                  : i.claimed
                    ? t('collabInviteUsed')
                    : t('collabInviteWaiting')}
              {i.locked ? (
                <button type="button" className="btn quiet" onClick={() => link.session.unlock(i.token)}>
                  {t('collabInviteUnlock')}
                </button>
              ) : null}
              {i.mode === 'personal' && i.claimed ? null : (
                <CopyField id={`collabInvite-${i.token}`} value={inviteUrl(i.link)} label={i.name} />
              )}
              {made[i.token] ? (
                <CopyField
                  id={`collabInvitePw-${i.token}`}
                  value={made[i.token] as string}
                  label={t('collabPassword')}
                />
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

/** Tiedosto → Kutsu muita mukaan… and Työskentele yhdessä: start, or manage the open session. */
export function CollabDialog() {
  const t = useTranslator();
  const store = getStore();
  const state = useAppState();
  const [chosen, choose] = useState('');
  const status = state.collab && state.collab.phase !== 'ended' ? state.collab : null;
  const close = () => store.openDialog(null);
  const reissue = (userId: string) => {
    choose(userId);
    document.getElementById('collabInviteForm')?.scrollIntoView({ block: 'nearest' });
  };
  return (
    <Modal
      open
      onClose={close}
      title={t('collabTitle')}
      id="collabDialog"
      testId="collab-dialog"
      className="action-dialog collab-dialog"
    >
      {!status ? <StartSection /> : null}
      {status?.role === 'host' ? <HostSection status={status} chosen={chosen} choose={choose} /> : null}
      {status ? <People status={status} {...(status.role === 'host' ? { onReissue: reissue } : {})} /> : null}
      {status ? (
        <>
          <p className="inspector-note">{t('collabKeepsCopy')}</p>
          <div className="dialog-actions">
            <button type="button" className="btn quiet" onClick={close}>
              {t('close')}
            </button>
            <button
              type="button"
              id={status.role === 'host' ? 'btnCollabEnd' : 'btnCollabLeave'}
              className="btn danger"
              onClick={async () => {
                const ask = status.role === 'host' ? t('collabEndConfirm') : t('collabLeaveConfirm');
                if (!(await store.askConfirm(ask))) return;
                close();
                await closeCollab();
              }}
            >
              {status.role === 'host' ? t('collabEnd') : t('collabLeave')}
            </button>
          </div>
        </>
      ) : null}
    </Modal>
  );
}

/** What an invite link opens: the name (general link) or the password, then connecting; refusals with a way out. */
export function JoinDialog() {
  const t = useTranslator();
  const request = useJoinRequest();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  if (!request) return null;
  const close = () => {
    const link = getStore().collabLink();
    cancelJoin();
    if (link?.role === 'participant') void closeCollab();
  };
  return (
    <Modal
      open
      onClose={close}
      title={t('collabJoinTitle')}
      id="joinDialog"
      testId="join-dialog"
      className="action-dialog collab-dialog"
    >
      {request.step === 'invalid' ? (
        <>
          <p className="inline-warning" role="alert">
            {t('collabInvalidLink')}
          </p>
          <div className="dialog-actions">
            <button type="button" className="btn primary" onClick={close}>
              {t('collabOpenWithout')}
            </button>
          </div>
        </>
      ) : null}
      {request.step === 'name' || request.step === 'password' ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (request.step === 'name' && name.trim()) void join(request.invite, { name: name.trim() });
            if (request.step === 'password' && password.trim()) void join(request.invite, { password });
          }}
        >
          <p>{request.step === 'name' ? t('collabJoinIntro') : t('collabJoinPasswordIntro')}</p>
          {request.step === 'name' ? (
            <>
              <label htmlFor="joinName">{t('collabJoinName')}</label>
              <input
                id="joinName"
                data-testid="join-name"
                autoFocus
                maxLength={110}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </>
          ) : (
            <>
              <label htmlFor="joinPassword">{t('collabPassword')}</label>
              <input
                id="joinPassword"
                data-testid="join-password"
                autoFocus
                autoComplete="off"
                spellCheck={false}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {request.wrong ? (
                <p className="inline-warning" role="alert">
                  {t('collabWrongPassword')}
                </p>
              ) : null}
            </>
          )}
          <PrivacyNote signal={request.invite.signal} />
          <div className="dialog-actions">
            <button type="button" className="btn quiet" onClick={close}>
              {t('cancel')}
            </button>
            <button
              type="submit"
              id="btnJoin"
              className="btn primary"
              disabled={request.step === 'name' ? !name.trim() : !password.trim()}
            >
              {t('collabJoin')}
            </button>
          </div>
        </form>
      ) : null}
      {request.step === 'connecting' ? (
        <>
          <p role="status">{t('collabConnectingHost')}</p>
          <PrivacyNote signal={request.invite.signal} />
          <div className="dialog-actions">
            <button type="button" className="btn quiet" onClick={close}>
              {t('cancel')}
            </button>
          </div>
        </>
      ) : null}
    </Modal>
  );
}

/** Why a session ended, for a participant; the document stays in this browser. */
export function CollabEndedDialog() {
  const t = useTranslator();
  const store = getStore();
  const { collab } = useAppState();
  if (
    !collab ||
    collab.phase !== 'ended' ||
    !collab.ended ||
    collab.ended === 'left' ||
    collab.role === 'host'
  )
    return null;
  const kept =
    collab.selfUserId !== null && collab.ended !== 'unreachable' && !collab.ended.startsWith('refused');
  return (
    <Modal
      open
      onClose={() => store.clearCollab()}
      title={t('collabTitle')}
      id="collabEndedDialog"
      testId="collab-ended"
    >
      <p role="alert">{t(ENDED_TEXT[collab.ended])}</p>
      {kept ? <p>{t('collabKeptCopy')}</p> : null}
      <div className="dialog-actions">
        {kept ? (
          <button
            type="button"
            className="btn quiet"
            onClick={() => {
              window.dispatchEvent(new CustomEvent('witt-save-file'));
              store.clearCollab();
            }}
          >
            {t('collabSaveFile')}
          </button>
        ) : null}
        <button
          type="button"
          id="btnCollabEndedOk"
          className="btn primary"
          onClick={() => store.clearCollab()}
        >
          {kept ? t('collabContinueAlone') : t('close')}
        </button>
      </div>
    </Modal>
  );
}

/** Beside the title: the session at a glance; opens the collaboration dialog. */
export function CollabChip() {
  const t = useTranslator();
  const store = getStore();
  const { collab } = useAppState();
  if (!collab || collab.phase === 'ended') return null;
  const online = collab.people.filter((p) => p.online).length;
  const text =
    collab.phase === 'reconnecting'
      ? t('collabReconnecting')
      : collab.phase !== 'active'
        ? t('collabConnecting')
        : collab.pending > 0
          ? t('collabPending', { count: collab.pending })
          : t('collabActive', { count: online });
  return (
    <button
      type="button"
      id="collabChip"
      data-testid="collab-chip"
      className="collab-chip"
      title={t('collabTitle')}
      onClick={() => store.openDialog('collab')}
    >
      <span aria-hidden="true">{collab.phase === 'active' ? '●' : '…'}</span>{' '}
      <span role="status">{text}</span>
    </button>
  );
}
