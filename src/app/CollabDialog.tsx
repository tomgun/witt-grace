// Live collaboration UI (WG-030, UI_INVENTORY S-15): the collaboration dialog (start, invite, participants, end),
// the join dialog a link opens, the notice when a session ends, and the status chip beside the document title.
import { useState } from 'react';
import {
  MIN_PASSWORD_LENGTH,
  isRelayUrl,
  isTurnUrl,
  normalizePassword,
  parseInvite,
  sameName,
} from '../domain/index.ts';
import type { Signal } from '../domain/index.ts';
import { suggestPassword } from '../lib/p2p/keys.ts';
import type { CollabStatus, InviteView } from '../lib/p2p/session.ts';
import {
  ENDED_TEXT,
  cancelJoin,
  closeCollab,
  inviteUrl,
  join,
  madePassword,
  readSignal,
  readTurn,
  rememberPassword,
  startCollab,
  useJoinRequest,
  writeTurn,
} from './collab.ts';
import { Modal } from './dialogs.tsx';
import { getStore, useAppState, useTranslator } from './store.ts';

/** A link or a password shown whole (wrapped, selectable at one click) with its own copy button. */
function CopyBlock({
  id,
  value,
  label,
  kind,
}: {
  id: string;
  value: string;
  label: string;
  kind: 'link' | 'password';
}) {
  const t = useTranslator();
  const [copied, setCopied] = useState(false);
  return (
    <div className={`collab-copy collab-copy-${kind}`}>
      <span className="collab-copy-label" id={`${id}-label`}>
        {label}
      </span>
      <code id={id} data-testid={id} className="collab-copy-value" aria-labelledby={`${id}-label`}>
        {value}
      </code>
      <button
        type="button"
        className="btn quiet"
        aria-label={`${t('collabCopy')}: ${label}`}
        onClick={() => {
          void navigator.clipboard?.writeText(value).then(
            () => setCopied(true),
            () => setCopied(false)
          );
        }}
      >
        <span role="status">{copied ? t('collabCopied') : t('collabCopy')}</span>
      </button>
    </div>
  );
}

function PrivacyNote({ signal, turn }: { signal: Signal; turn: string[] | null }) {
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
      {turn ? <p>{t('collabPrivacyTurn', { url: turn.join(', ') })}</p> : null}
    </div>
  );
}

/** This browser's TURN server: saved as typed (when valid), used by every later connection from this browser. */
function useTurnDraft() {
  const [draft, setDraft] = useState(() => {
    const saved = readTurn();
    return {
      urls: saved?.urls.join(' ') ?? '',
      username: saved?.username ?? '',
      credential: saved?.credential ?? '',
    };
  });
  const listOf = (urls: string) => urls.split(/\s+/).filter(Boolean);
  const validList = (list: string[]) => list.length <= 3 && list.every(isTurnUrl);
  const list = listOf(draft.urls);
  const update = (patch: Partial<typeof draft>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    const urls = listOf(next.urls);
    if (validList(urls))
      writeTurn(urls.length ? { urls, username: next.username, credential: next.credential } : null);
  };
  return { draft, update, valid: validList(list), active: validList(list) && list.length ? list : null };
}

function TurnFields({ turn }: { turn: ReturnType<typeof useTurnDraft> }) {
  const t = useTranslator();
  return (
    <fieldset className="collab-turn">
      <legend>{t('collabTurn')}</legend>
      <p className="inspector-note">{t('collabTurnHelp')}</p>
      <input
        id="collabTurnUrl"
        placeholder="turn:turn.example.org:3478"
        aria-label={t('collabTurn')}
        spellCheck={false}
        value={turn.draft.urls}
        onChange={(e) => turn.update({ urls: e.target.value })}
      />
      <div className="collab-invite-row">
        <input
          id="collabTurnUser"
          placeholder={t('collabTurnUser')}
          aria-label={t('collabTurnUser')}
          autoComplete="off"
          spellCheck={false}
          value={turn.draft.username}
          onChange={(e) => turn.update({ username: e.target.value })}
        />
        <input
          id="collabTurnCredential"
          type="password"
          placeholder={t('collabTurnCredential')}
          aria-label={t('collabTurnCredential')}
          autoComplete="off"
          value={turn.draft.credential}
          onChange={(e) => turn.update({ credential: e.target.value })}
        />
      </div>
      {turn.valid ? null : <p className="inline-warning">{t('collabTurnInvalid')}</p>}
    </fieldset>
  );
}

function StartSection() {
  const t = useTranslator();
  const store = getStore();
  const remembered = readSignal();
  const turn = useTurnDraft();
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
      <PrivacyNote signal={signal} turn={turn.active} />
      <details className="collab-advanced">
        <summary>{t('collabAdvanced')}</summary>
        <fieldset>
          <legend>{t('collabSignal')}</legend>
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
        </fieldset>
        <TurnFields turn={turn} />
      </details>
      <div className="dialog-actions">
        <button type="button" className="btn quiet" onClick={() => store.openDialog(null)}>
          {t('cancel')}
        </button>
        <button
          type="button"
          id="btnCollabStart"
          className="btn primary"
          disabled={busy || (strategy === 'relay' && !relayValid) || !turn.valid}
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

/** One personal invite: its link and (while this tab knows it) its password together, and what can be done to it. */
function InviteCard({ invite, fresh = false }: { invite: InviteView; fresh?: boolean }) {
  const t = useTranslator();
  const store = getStore();
  const { language } = useAppState();
  const link = store.collabLink();
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (link?.role !== 'host') return null;
  const password = madePassword(invite.token);
  const isPassword = invite.mode === 'password';
  const state = invite.locked
    ? t('collabInviteLocked', { count: invite.failures })
    : invite.claimed
      ? t('collabInviteUsed')
      : t('collabInviteWaiting');
  const save = async () => {
    if (draft === null || !normalizePassword(draft)) return;
    setBusy(true);
    await link.session.setPassword(invite.token, draft);
    rememberPassword(invite.token, draft);
    setBusy(false);
    setDraft(null);
  };
  return (
    <div className="collab-invite-card" data-token={invite.token}>
      <div className="collab-invite-head">
        <strong>{invite.name}</strong>
        <span>
          {isPassword ? t('collabInvitePassword') : t('collabInviteKindPersonal')} · {state}
        </span>
      </div>
      {invite.mode === 'personal' && invite.claimed ? (
        <p className="inspector-note">{t('collabInviteClaimedNote')}</p>
      ) : (
        <CopyBlock
          id={`collabInvite-${invite.token}`}
          value={inviteUrl(invite.link)}
          label={t('collabLinkLabel')}
          kind="link"
        />
      )}
      {isPassword && draft === null ? (
        password ? (
          <CopyBlock
            id={`collabInvitePw-${invite.token}`}
            value={password}
            label={t('collabPassword')}
            kind="password"
          />
        ) : (
          <p className="inspector-note">{t('collabPasswordHidden')}</p>
        )
      ) : null}
      {fresh && isPassword && password ? <p className="inspector-note">{t('collabSendSeparately')}</p> : null}
      {isPassword && draft !== null ? (
        <div className="collab-password-edit">
          <label htmlFor={`collabNewPassword-${invite.token}`}>{t('collabPasswordNew')}</label>
          <div className="collab-invite-row">
            <input
              id={`collabNewPassword-${invite.token}`}
              autoComplete="off"
              spellCheck={false}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button type="button" className="btn quiet" onClick={() => setDraft(suggestPassword(language))}>
              {t('collabPasswordSuggest')}
            </button>
          </div>
          {normalizePassword(draft).length < MIN_PASSWORD_LENGTH ? (
            <p className="inline-warning">{t('collabPasswordWeak', { count: MIN_PASSWORD_LENGTH })}</p>
          ) : null}
          <p className="inspector-note">{t('collabPasswordChangeHelp')}</p>
          <div className="collab-invite-actions">
            <button type="button" className="btn quiet" onClick={() => setDraft(null)}>
              {t('cancel')}
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={busy || !normalizePassword(draft)}
              onClick={() => void save()}
            >
              {t('collabPasswordSave')}
            </button>
          </div>
        </div>
      ) : null}
      {draft === null && (isPassword || invite.locked) ? (
        <div className="collab-invite-actions">
          {isPassword ? (
            <button type="button" className="btn quiet" onClick={() => setDraft(suggestPassword(language))}>
              {t('collabPasswordChange')}
            </button>
          ) : null}
          {invite.locked ? (
            <button type="button" className="btn quiet" onClick={() => link.session.unlock(invite.token)}>
              {t('collabInviteUnlock')}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

type Who = 'anyone' | 'named';

function HostSection({
  status,
  who,
  setWho,
  chosen,
  choose,
}: {
  status: CollabStatus;
  who: Who;
  setWho: (who: Who) => void;
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
  /** The invite just made: shown in place of the form, link and password together, until the next one. */
  const [created, setCreated] = useState<string | null>(null);
  if (link?.role !== 'host') return null;
  const people = state.project.users.filter((u) => u.id !== status.selfUserId && u.profileKind !== 'ai');
  const hasLink = (id: string) =>
    status.invites.some((i) => i.userId === id) || status.people.some((p) => p.userId === id);
  const target = chosen ? state.project.users.find((u) => u.id === chosen) : undefined;
  const weak = mode === 'password' && normalizePassword(password).length < MIN_PASSWORD_LENGTH;
  /** A new name someone in the document or the session already has: pick that person from the list instead. */
  const taken =
    !chosen &&
    name.trim() !== '' &&
    [...state.project.users, ...status.invites, ...status.people].some((p) => sameName(p.name, name));
  const fresh = created ? status.invites.find((i) => i.token === created) : undefined;
  const others = status.invites.filter((i) => i.token !== fresh?.token);
  const invite = async () => {
    if (!chosen && (!name.trim() || taken)) return;
    if (mode === 'password' && !normalizePassword(password)) return;
    if (
      target &&
      hasLink(target.id) &&
      !(await store.askConfirm(t('collabReissueConfirm', { name: target.name })))
    )
      return;
    setBusy(true);
    let made: string;
    try {
      made = await link.session.invite(
        chosen ? { userId: chosen } : { name: name.trim() },
        mode === 'password' ? { mode, password } : { mode }
      );
    } catch {
      // The name was taken in the meantime; the form shows why once the status catches up.
      return;
    } finally {
      setBusy(false);
    }
    const parsed = parseInvite(made);
    if (!parsed.ok) return;
    if (mode === 'password') rememberPassword(parsed.invite.access.token, password);
    setCreated(parsed.invite.access.token);
  };
  const another = () => {
    setCreated(null);
    setName('');
    choose('');
    setPassword(suggestPassword(state.language));
  };
  return (
    <>
      <section aria-labelledby="collabInviteHeading" id="collabInviteForm">
        <h3 id="collabInviteHeading">{t('collabInviteHeading')}</h3>
        <fieldset className="collab-choice">
          <legend>{t('collabWho')}</legend>
          <label>
            <input
              type="radio"
              name="collabWho"
              id="collabWhoAnyone"
              checked={who === 'anyone'}
              onChange={() => setWho('anyone')}
            />{' '}
            {t('collabWhoAnyone')}
          </label>
          <label>
            <input
              type="radio"
              name="collabWho"
              id="collabWhoNamed"
              checked={who === 'named'}
              onChange={() => setWho('named')}
            />{' '}
            {t('collabWhoNamed')}
          </label>
        </fieldset>
        {who === 'anyone' ? (
          <div className="collab-invite-card">
            <p className="inspector-note">{t('collabGeneralHelp')}</p>
            <CopyBlock
              id="collabLink"
              value={inviteUrl(status.link ?? '')}
              label={t('collabGeneralLink')}
              kind="link"
            />
            <label className="collab-check">
              <input
                type="checkbox"
                id="collabGeneralOpen"
                checked={status.generalOpen}
                onChange={(e) => link.session.setGeneralOpen(e.target.checked)}
              />{' '}
              {t('collabGeneralOpen')}
            </label>
          </div>
        ) : fresh ? (
          <div id="collabInviteResult" className="collab-invite-result">
            <p role="status">
              <strong>{t('collabInviteReady', { name: fresh.name })}</strong>
            </p>
            <InviteCard invite={fresh} fresh />
            <button type="button" id="btnCollabInviteAnother" className="btn quiet" onClick={another}>
              {t('collabInviteAnother')}
            </button>
          </div>
        ) : (
          <div className="collab-invite-card">
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
            {taken ? (
              <p className="inline-warning" role="alert" id="collabInviteNameTaken">
                {t('collabInviteNameTaken')}
              </p>
            ) : null}
            {target && hasLink(target.id) ? (
              <p className="inline-warning" id="collabReissueNote">
                {t('collabReissueNote', { name: target.name })}
              </p>
            ) : null}
            <fieldset className="collab-choice">
              <legend>{t('collabInviteMode')}</legend>
              <label>
                <input
                  type="radio"
                  name="collabInviteMode"
                  id="collabModePersonal"
                  checked={mode === 'personal'}
                  onChange={() => setMode('personal')}
                />{' '}
                <span>
                  <strong>{t('collabModePersonal')}</strong>
                  <span className="collab-choice-help">{t('collabModePersonalHelp')}</span>
                </span>
              </label>
              <label>
                <input
                  type="radio"
                  name="collabInviteMode"
                  id="collabModePassword"
                  checked={mode === 'password'}
                  onChange={() => setMode('password')}
                />{' '}
                <span>
                  <strong>{t('collabModePassword')}</strong>
                  <span className="collab-choice-help">{t('collabModePasswordHelp')}</span>
                </span>
              </label>
            </fieldset>
            {mode === 'password' ? (
              <>
                <label htmlFor="collabInvitePassword">{t('collabPassword')}</label>
                <div className="collab-invite-row">
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
                {weak ? (
                  <p className="inline-warning">{t('collabPasswordWeak', { count: MIN_PASSWORD_LENGTH })}</p>
                ) : null}
              </>
            ) : null}
            <button
              type="button"
              id="btnCollabInvite"
              className="btn primary"
              onClick={() => void invite()}
              disabled={
                busy ||
                (!chosen && (!name.trim() || taken)) ||
                (mode === 'password' && !normalizePassword(password))
              }
            >
              {busy ? t('collabConnecting') : t('collabInviteCreate')}
            </button>
          </div>
        )}
      </section>
      {others.length ? (
        <section aria-labelledby="collabInvitesHeading">
          <h3 id="collabInvitesHeading">{t('collabPersonal')}</h3>
          <p className="inspector-note">{t('collabPersonalHelp')}</p>
          <ul className="collab-invites" id="collabInvites">
            {others.map((i) => (
              <li key={i.token}>
                <InviteCard invite={i} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

/** Tiedosto → Kutsu muita mukaan… and Työskentele yhdessä: start, or manage the open session. */
export function CollabDialog() {
  const t = useTranslator();
  const store = getStore();
  const state = useAppState();
  const [who, setWho] = useState<Who>('anyone');
  const [chosen, choose] = useState('');
  const status = state.collab && state.collab.phase !== 'ended' ? state.collab : null;
  const close = () => store.openDialog(null);
  const reissue = (userId: string) => {
    setWho('named');
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
      {status?.role === 'host' ? (
        <HostSection status={status} who={who} setWho={setWho} chosen={chosen} choose={choose} />
      ) : null}
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
  const turn = useTurnDraft();
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
              {request.taken ? (
                <p className="inline-warning" role="alert">
                  {t('collabJoinNameTaken')}
                </p>
              ) : null}
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
          <PrivacyNote signal={request.invite.signal} turn={turn.active} />
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
          <PrivacyNote signal={request.invite.signal} turn={turn.active} />
          <div className="dialog-actions">
            <button type="button" className="btn quiet" onClick={close}>
              {t('cancel')}
            </button>
          </div>
        </>
      ) : null}
      {request.step === 'failed' ? (
        <>
          <p className="inline-warning" role="alert">
            {t(ENDED_TEXT[request.cause])}
          </p>
          <details className="collab-advanced" open={request.cause === 'no-direct'}>
            <summary>{t('collabAdvanced')}</summary>
            <TurnFields turn={turn} />
          </details>
          <div className="dialog-actions">
            <button type="button" className="btn quiet" onClick={close}>
              {t('cancel')}
            </button>
            <button
              type="button"
              id="btnJoinRetry"
              className="btn primary"
              disabled={!turn.valid}
              onClick={() => void join(request.invite, request.given)}
            >
              {t('collabRetry')}
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
    collab.selfUserId !== null &&
    collab.ended !== 'unreachable' &&
    collab.ended !== 'no-direct' &&
    !collab.ended.startsWith('refused');
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
