// Native <dialog> hosts: the generic Modal, the notice bar, and the one-at-a-time modal requests from the store
// (confirm, text prompt, notice, move subtree, links) plus the small named dialogs (new work, about).
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { blankProject, getStore, useAppState, useTranslator } from './store.ts';
import type { ModalRequest } from './store.ts';
import { moveTargets } from './actions.ts';
import type { Frame } from './projection.ts';
import { HelpDialog } from './HelpDialog.tsx';
import { LinksDialog } from './LinksDialog.tsx';

/** A native <dialog> with focus trapping by the browser; Escape closes it. */
export function Modal({
  open,
  onClose,
  title,
  children,
  testId,
  id,
  className = 'action-dialog',
  heading = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  testId?: string;
  id?: string;
  className?: string;
  heading?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  const titleId = `${id ?? testId ?? 'dialog'}-title`;
  return (
    <dialog
      ref={ref}
      id={id}
      className={className}
      data-testid={testId}
      onClose={onClose}
      aria-labelledby={titleId}
    >
      <div className="dialog-inner">
        {heading ? (
          <div className="dialog-heading">
            <h2 id={titleId}>{title}</h2>
            <button type="button" className="btn icon-btn" aria-label="Sulje" onClick={onClose}>
              ×
            </button>
          </div>
        ) : (
          <h2 id={titleId}>{title}</h2>
        )}
        {open ? children : null}
      </div>
    </dialog>
  );
}

export function NoticeBar() {
  const { notice } = useAppState();
  const t = useTranslator();
  if (!notice) return null;
  return (
    <div
      className={`notice notice-${notice.kind}`}
      role={notice.kind === 'error' ? 'alert' : 'status'}
      data-testid="notice"
    >
      <span>{notice.text}</span>
      <button
        type="button"
        className="btn quiet"
        onClick={() => getStore().notify(null)}
        aria-label={t('close')}
      >
        ×
      </button>
    </div>
  );
}

function ConfirmDialog({ request }: { request: Extract<ModalRequest, { kind: 'confirm' }> }) {
  const t = useTranslator();
  const store = getStore();
  const done = (ok: boolean) => {
    store.closeModal();
    request.resolve(ok);
  };
  return (
    <Modal
      open
      onClose={() => done(false)}
      title={t('confirmationTitle')}
      id="confirmDialog"
      testId="confirm-dialog"
      heading={false}
    >
      <p id="confirmText">{request.text}</p>
      <div className="dialog-actions">
        <button type="button" className="btn quiet" id="confirmCancel" onClick={() => done(false)}>
          {t('cancel')}
        </button>
        <button
          type="button"
          className="btn primary"
          id="confirmAccept"
          data-testid="confirm-accept"
          onClick={() => done(true)}
        >
          {t('confirmContinue')}
        </button>
      </div>
    </Modal>
  );
}
function TextDialog({ request }: { request: Extract<ModalRequest, { kind: 'text' }> }) {
  const t = useTranslator();
  const store = getStore();
  const [value, setValue] = useState(request.initial);
  const done = (ok: boolean) => {
    store.closeModal();
    request.resolve(ok ? value : null);
  };
  return (
    <Modal
      open
      onClose={() => done(false)}
      title={request.heading || t('textDialogGeneric')}
      id="textDialog"
      testId="text-dialog"
      heading={false}
    >
      <form
        className="text-dialog-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) done(true);
        }}
      >
        <label htmlFor="textValue" id="textPrompt">
          {request.prompt}
        </label>
        <input
          id="textValue"
          type="text"
          maxLength={120}
          autoComplete="off"
          required
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <div className="dialog-actions">
          <button type="button" id="textCancel" className="btn quiet" onClick={() => done(false)}>
            {t('cancel')}
          </button>
          <button type="submit" id="textAccept" className="btn primary">
            {request.action || t('confirmContinue')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function NoticeDialog({ request }: { request: Extract<ModalRequest, { kind: 'notice' }> }) {
  const t = useTranslator();
  const store = getStore();
  return (
    <Modal
      open
      onClose={() => store.closeModal()}
      title={t('noticeTitle')}
      id="noticeDialog"
      testId="notice-dialog"
      heading={false}
    >
      <p id="noticeText">{request.text}</p>
      <div className="dialog-actions">
        <button type="button" className="btn primary" id="noticeClose" onClick={() => store.closeModal()}>
          {t('close')}
        </button>
      </div>
    </Modal>
  );
}
function MoveDialog({ request }: { request: Extract<ModalRequest, { kind: 'move' }> }) {
  const t = useTranslator();
  const store = getStore();
  const { project } = useAppState();
  const targets = moveTargets(project, request.nodeId);
  const [target, setTarget] = useState(targets[0]?.id ?? '');
  return (
    <Modal
      open
      onClose={() => store.closeModal()}
      title={t('moveSubtree')}
      id="moveNodeDialog"
      testId="move-dialog"
    >
      <label htmlFor="moveTargetSelect">{t('moveTarget')}</label>
      <select id="moveTargetSelect" value={target} onChange={(e) => setTarget(e.target.value)}>
        {targets.map((n) => (
          <option key={n.id} value={n.id}>
            {n.title}
          </option>
        ))}
      </select>
      <div className="dialog-actions">
        <button type="button" className="btn quiet" id="btnMoveCancel" onClick={() => store.closeModal()}>
          {t('cancel')}
        </button>
        <button
          type="button"
          className="btn primary"
          id="btnMoveConfirm"
          disabled={!target}
          onClick={() => {
            store.closeModal();
            if (target) store.dispatch({ type: 'node.move', id: request.nodeId, parentId: target });
          }}
        >
          {t('confirmMove')}
        </button>
      </div>
    </Modal>
  );
}

function NewWorkDialog() {
  const t = useTranslator();
  const store = getStore();
  const create = async (mode: 'argument' | 'decision') => {
    store.openDialog(null);
    const current = store.get().project;
    const hasWork = current.nodes.length > 1 || current.title !== blankProject(current.mode).title;
    if (hasWork && !(await store.askConfirm(t('newDocumentConfirm')))) return;
    store.load(blankProject(mode));
  };
  return (
    <Modal
      open
      onClose={() => store.openDialog(null)}
      title={t('newWorkTitle')}
      id="newWorkDialog"
      testId="new-work-dialog"
      className="action-dialog new-work-dialog"
    >
      <p>{t('newWorkIntro')}</p>
      <div className="new-work-actions">
        <button
          type="button"
          id="btnNewWorkArgument"
          data-testid="new-argument"
          className="btn quiet"
          onClick={() => void create('argument')}
        >
          {t('newBlankArgument')}
        </button>
        <button
          type="button"
          id="btnNewWorkDecision"
          data-testid="new-decision"
          className="btn quiet"
          onClick={() => void create('decision')}
        >
          {t('newBlankDecision')}
        </button>
        <button
          type="button"
          id="btnAIDraft"
          className="btn primary"
          onClick={() => store.openDialog('aiDraft')}
        >
          {t('newWithAI')}
        </button>
      </div>
      <p className="inspector-note">{t('newWorkNoSend')}</p>
    </Modal>
  );
}
function AboutDialog() {
  const t = useTranslator();
  const store = getStore();
  return (
    <Modal
      open
      onClose={() => store.openDialog(null)}
      title={t('aboutTitle')}
      id="aboutDialog"
      testId="about-dialog"
    >
      <p>
        <b>WITT</b> — Web Interactive Thinking Tool
      </p>
      <p>
        <b>{t('methodName')}</b> — Günther’s Reflective Argumentation &amp; Collaborative Evaluation Method
      </p>
      <p>{t('aboutPurpose')}</p>
      <p className="about-slogan">
        <span>{t('homeHeroFirst')}</span> <span>{t('homeHeroSecond')}</span>
      </p>
      <div className="dialog-actions">
        <button
          type="button"
          className="btn primary"
          id="btnAboutDone"
          onClick={() => store.openDialog(null)}
        >
          {t('close')}
        </button>
      </div>
    </Modal>
  );
}
function PlaceholderDialog({ name }: { name: string }) {
  const t = useTranslator();
  const store = getStore();
  return (
    <Modal open onClose={() => store.openDialog(null)} title={name} testId={`${name}-dialog`}>
      <p className="inline-warning">Tämä ikkuna on vielä toteuttamatta (ks. docs/ISSUE-PLAN.md).</p>
      <div className="dialog-actions">
        <button type="button" className="btn primary" onClick={() => store.openDialog(null)}>
          {t('close')}
        </button>
      </div>
    </Modal>
  );
}

/** Hosts the store's modal request and the small named dialogs. Larger dialogs mount from App. */
export function ModalHost({ frame, onShortcutsChanged }: { frame: Frame; onShortcutsChanged: () => void }) {
  const state = useAppState();
  const modal = state.modal;
  return (
    <>
      {modal?.kind === 'confirm' ? <ConfirmDialog request={modal} /> : null}
      {modal?.kind === 'text' ? <TextDialog request={modal} /> : null}
      {modal?.kind === 'notice' ? <NoticeDialog request={modal} /> : null}
      {modal?.kind === 'move' ? <MoveDialog request={modal} /> : null}
      {modal?.kind === 'links' ? <LinksDialog request={modal} frame={frame} /> : null}
      {state.dialog === 'newWork' ? <NewWorkDialog /> : null}
      {state.dialog === 'about' ? <AboutDialog /> : null}
      {state.dialog === 'help' ? <HelpDialog onShortcutsChanged={onShortcutsChanged} /> : null}
      {state.dialog && !['newWork', 'about', 'help', 'people', 'vote'].includes(state.dialog) ? (
        <PlaceholderDialog name={state.dialog} />
      ) : null}
    </>
  );
}
