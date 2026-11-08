// The left panel: outline, the "Yhteydet ja perustelut" library pane and the add block (inv-panels §A).
import { useState } from 'react';
import { childrenOf, secondaryOverlapWarning, signedLinkImpact } from '../domain/index.ts';
import type { Node } from '../domain/index.ts';
import { newId } from '../lib/providers.ts';
import { addNode, canAttachLibraryReason, canEdit, openRepeatLibrary } from './actions.ts';
import { previewHandlers } from './ClaimPreview.tsx';
import { displayedPrimaryRelation, signed } from './derive.ts';
import type { Frame } from './projection.ts';
import { getStore, useAppState, useTranslator } from './store.ts';

function OutlineItem({ frame, node, depth }: { frame: Frame; node: Node; depth: number }) {
  const state = useAppState();
  const store = getStore();
  const { project } = state;
  if (!frame.projection.visibleIds.has(node.id)) return null;
  const focused = state.view.focus.mode !== 'all';
  const count = childrenOf(project, node.id).length;
  const classes = ['outline-item'];
  if (node.id === state.selectedId) classes.push('active');
  if (focused)
    classes.push(
      frame.projection.matchIds.has(node.id)
        ? 'focus-match'
        : frame.projection.contextIds.has(node.id)
          ? 'focus-context'
          : 'focus-muted'
    );
  const preview = previewHandlers(node.id, '.outline-text', store.setClaimPreview);
  return (
    <>
      <button
        type="button"
        className={classes.join(' ')}
        data-relation={displayedPrimaryRelation(frame, node)}
        data-testid={`outline-${node.id}`}
        style={{ paddingLeft: Math.min(12 + depth * 13, 62) }}
        title={node.title}
        onClick={() => store.select(node.id)}
        {...preview}
      >
        <i className="outline-marker" />
        <span className="outline-text">{node.title}</span>
        {count ? (
          <span className="outline-arrow">{frame.isNodeCollapsed(node) ? `▸${count}` : '▾'}</span>
        ) : null}
      </button>
      {childrenOf(project, node.id).map((child) => (
        <OutlineItem key={child.id} frame={frame} node={child} depth={depth + 1} />
      ))}
    </>
  );
}

function RepeatPane({ frame }: { frame: Frame }) {
  const state = useAppState();
  const t = useTranslator();
  const store = getStore();
  const { project } = state;
  const editable = canEdit(state);
  const [title, setTitle] = useState('');
  const [semantic, setSemantic] = useState<'fact' | 'assumption' | 'value'>('fact');
  const [mode, setMode] = useState<'concept' | 'locked'>('concept');
  const [confidence, setConfidence] = useState('100');
  const [impact, setImpact] = useState('3');
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null);
  const selected = project.nodes.find((n) => n.id === state.selectedId);
  const parent = selected?.parentId ? project.nodes.find((n) => n.id === selected.parentId) : undefined;
  const links = project.links ?? [];
  const create = () => {
    const text = title.trim() || t('repeatDefaultTitle');
    if (!editable) {
      setStatus({ text: t('viewerCannotEdit'), error: true });
      return;
    }
    const id = newId();
    const ok =
      mode === 'locked'
        ? store.dispatch({
            type: 'shared.add',
            id,
            title: text,
            confidence: Number(confidence),
            influence: Number(impact),
          })
        : store.dispatch({ type: 'concept.add', id, title: text, semanticType: semantic });
    if (!ok) {
      setStatus({ text: t('repeatCreateFailed'), error: true });
      return;
    }
    setTitle('');
    store.selectLibraryReason({ type: mode === 'locked' ? 'locked' : 'concept', id });
    setStatus({ text: t('repeatCreated'), error: false });
    requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(`.repeat-card[data-reason-id="${CSS.escape(id)}"]`)
        ?.scrollIntoView({ block: 'nearest' });
      if (!title.trim()) {
        const input = document.querySelector<HTMLInputElement>('#inspector .repeat-inspector-label input');
        input?.focus();
        input?.select();
      }
    });
  };
  const records = [
    ...(project.reasonConcepts ?? []).map((reason) => ({ type: 'concept' as const, reason })),
    ...(project.sharedReasons ?? []).map((reason) => ({ type: 'locked' as const, reason })),
  ];
  const multiNodes = project.nodes.filter(
    (n) =>
      n.kind === 'claim' &&
      !n.reasonConceptId &&
      (n.parentId ? 1 : 0) + links.filter((l) => l.sourceId === n.id).length >= 2
  );
  const sel = state.selectedLibraryReason;
  const promoteDisabled =
    !editable ||
    !selected ||
    selected.kind !== 'claim' ||
    !selected.parentId ||
    !!selected.reasonConceptId ||
    !!selected.sharedReasonId ||
    !parent ||
    !['claim', 'option'].includes(parent.kind);
  return (
    <section id="repeatLibraryPane" className="repeat-library-pane" aria-label={t('contextOpen')}>
      <p className="repeat-library-intro">{t('repeatIntro')}</p>
      <form
        id="repeatCreateForm"
        className="repeat-create-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
      >
        <label htmlFor="repeatNewTitle">{t('repeatNewTitle')}</label>
        <input
          id="repeatNewTitle"
          type="text"
          maxLength={200}
          autoComplete="off"
          placeholder={t('repeatTitlePlaceholder')}
          value={title}
          data-testid="repeat-title"
          onChange={(e) => {
            setTitle(e.target.value);
            setStatus(null);
          }}
        />
        <details className="repeat-advanced">
          <summary>{t('repeatAdvanced')}</summary>
          <label htmlFor="repeatNewSemantic">{t('repeatSemantic')}</label>
          <p>{t('repeatSemanticHelp')}</p>
          <select
            id="repeatNewSemantic"
            data-testid="repeat-kind"
            value={semantic}
            onChange={(e) => setSemantic(e.target.value as typeof semantic)}
          >
            <option value="fact">{t('contextFact')}</option>
            <option value="assumption">{t('contextAssumption')}</option>
            <option value="value">{t('contextValue')}</option>
          </select>
          <label htmlFor="repeatNewMode">{t('repeatMode')}</label>
          <select id="repeatNewMode" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
            <option value="concept">{t('repeatIndependent')}</option>
            <option value="locked">{t('repeatLocked')}</option>
          </select>
          <div id="repeatNewLockedFields" hidden={mode !== 'locked'}>
            <label htmlFor="repeatNewConfidence">{t('sharedProb')}</label>
            <input
              id="repeatNewConfidence"
              type="number"
              min={0}
              max={100}
              step={1}
              value={confidence}
              onChange={(e) => setConfidence(e.target.value)}
            />
            <label htmlFor="repeatNewImpact">{t('sharedImpact')}</label>
            <input
              id="repeatNewImpact"
              type="number"
              min={-5}
              max={5}
              step={0.5}
              value={impact}
              onChange={(e) => setImpact(e.target.value)}
            />
          </div>
        </details>
        <button
          type="button"
          className="btn primary"
          id="btnRepeatCreate"
          data-testid="repeat-create"
          onClick={create}
        >
          {t('repeatCreate')}
        </button>
        <p
          id="repeatLibraryStatus"
          className={`repeat-library-status${status?.error ? ' is-error' : ''}`}
          role="status"
          aria-live="polite"
        >
          {status?.text ?? ''}
        </p>
      </form>
      <div className="repeat-library-heading">{t('repeatExisting')}</div>
      <div id="repeatCards" className="repeat-cards" role="list">
        {records.length === 0 ? <p className="repeat-empty">{t('repeatEmpty')}</p> : null}
        {records.map(({ type, reason }) => {
          const uses = project.nodes.filter((n) =>
            type === 'concept' ? n.reasonConceptId === reason.id : n.sharedReasonId === reason.id
          );
          const isSelected = sel?.type === type && sel.id === reason.id;
          return (
            <button
              key={`${type}:${reason.id}`}
              type="button"
              className={`repeat-card${isSelected ? ' selected' : ''}`}
              role="listitem"
              data-reason-type={type}
              data-reason-id={reason.id}
              data-testid={`repeat-card-${reason.id}`}
              draggable={editable}
              title={t('repeatDragHint')}
              onClick={() => store.selectLibraryReason({ type, id: reason.id })}
              onDragStart={(e) => {
                store.setDraggingLibraryReason({ type, id: reason.id });
                e.dataTransfer.effectAllowed = 'copy';
                e.dataTransfer.setData('text/plain', `witt-reason:${type}:${reason.id}`);
                e.currentTarget.classList.add('dragging');
              }}
              onDragEnd={(e) => {
                store.setDraggingLibraryReason(null);
                e.currentTarget.classList.remove('dragging');
              }}
            >
              <span className="repeat-card-tag">
                {t(type === 'locked' ? 'repeatLocked' : 'repeatIndependent')}
              </span>
              <strong className="repeat-card-name">{reason.title}</strong>
              <small className="repeat-card-foot">{t('repeatConnectionCount', { count: uses.length })}</small>
            </button>
          );
        })}
      </div>
      {multiNodes.length ? (
        <section id="repeatMultiUse" className="repeat-multi-use" aria-labelledby="repeatMultiTitle">
          <h3 id="repeatMultiTitle">{t('multiUseTitle')}</h3>
          <p className="repeat-library-intro">{t('multiUseIntro')}</p>
          <div id="repeatMultiCards" className="repeat-cards" role="list">
            {multiNodes.map((node) => (
              <button
                key={node.id}
                type="button"
                className={`repeat-card${sel?.type === 'linked-node' && sel.id === node.id ? ' selected' : ''}`}
                data-node-id={node.id}
                role="listitem"
                onClick={() => store.selectLibraryReason({ type: 'linked-node', id: node.id })}
              >
                <span className="repeat-card-tag">{t('multiUseTag')}</span>
                <strong className="repeat-card-name">{node.title}</strong>
                <small className="repeat-card-foot">
                  {t('repeatConnectionCount', {
                    count: links.filter((l) => l.sourceId === node.id).length + (node.parentId ? 1 : 0),
                  })}
                </small>
              </button>
            ))}
          </div>
        </section>
      ) : null}
      {links.length ? (
        <details id="repeatCrossLinks" className="repeat-cross-links">
          <summary>
            <span>{t('multiUseRoutes')}</span> <span id="repeatSecondaryCount">{links.length}</span>
          </summary>
          <p className="repeat-library-intro">{t('repeatCrossLinkHelp')}</p>
          <div id="repeatSecondaryCards" className="repeat-secondary-cards" role="list">
            {links.map((link) => {
              const source = project.nodes.find((n) => n.id === link.sourceId);
              const target = project.nodes.find((n) => n.id === link.targetId);
              if (!source || !target) return null;
              return (
                <button
                  key={link.id}
                  type="button"
                  className={`repeat-link-card${secondaryOverlapWarning(project, link) ? ' has-route-note' : ''}`}
                  data-link-id={link.id}
                  role="listitem"
                  title={t('linkShelfOpen')}
                  onClick={() => store.openModal({ kind: 'links', nodeId: source.id, linkId: link.id })}
                >
                  <span className="repeat-link-indicator">{signed(signedLinkImpact(link))}</span>
                  <span className="repeat-link-source">{source.title}</span>
                  <span className="repeat-link-arrow">→</span>
                  <span className="repeat-link-target">{target.title}</span>
                </button>
              );
            })}
          </div>
        </details>
      ) : null}
      <button
        type="button"
        className="btn quiet repeat-promote"
        id="btnRepeatPromote"
        disabled={promoteDisabled}
        onClick={() => {
          if (!selected) return;
          const conceptId = newId();
          if (store.dispatch({ type: 'concept.promote', nodeId: selected.id, conceptId }))
            store.selectLibraryReason({ type: 'concept', id: conceptId });
        }}
      >
        {t('repeatPromote')}
      </button>
      {/* Attach by click works through the inspector's target select; a dragged card is caught by the canvas cards. */}
      <span
        hidden
        data-can-attach={
          selected && sel ? String(canAttachLibraryReason(project, sel, selected.id, editable)) : undefined
        }
      />
      <span hidden data-frame-root={frame.rootId} />
    </section>
  );
}

export function LeftPanel({ frame }: { frame: Frame }) {
  const state = useAppState();
  const t = useTranslator();
  const { project } = state;
  const editable = canEdit(state);
  const selected = project.nodes.find((n) => n.id === state.selectedId);
  const repeatOpen = state.leftTab === 'repeat';
  const root = project.nodes.find((n) => n.parentId === null);
  const store = getStore();
  const votingOpen = project.votingRound?.status === 'open';
  return (
    <aside className="sidepanel leftpanel" aria-label={t('tree')} data-testid="outline">
      <div className="panel-heading">
        <div>
          <div className="eyebrow">{t('workArea')}</div>
          <h2>{t('tree')}</h2>
        </div>
        <span className="count-pill" id="nodeCount" data-testid="node-count">
          {project.nodes.length}
        </span>
      </div>
      <div className="left-panel-tabs" role="group" aria-label={`${t('repeatTreeTab')} / ${t('repeatTab')}`}>
        <button
          type="button"
          id="btnOutlineTab"
          className={repeatOpen ? '' : 'active'}
          aria-pressed={!repeatOpen}
          data-testid="left-tab-tree"
          onClick={() => {
            store.setLeftTab('tree');
            store.selectLibraryReason(null);
          }}
        >
          {t('repeatTreeTab')}
        </button>
        <button
          type="button"
          id="btnRepeatTab"
          className={repeatOpen ? 'active' : ''}
          aria-pressed={repeatOpen}
          data-testid="left-tab-repeat"
          onClick={openRepeatLibrary}
        >
          {t('repeatTab')}
        </button>
      </div>
      {repeatOpen ? (
        <RepeatPane frame={frame} />
      ) : (
        <div id="outlinePane" className="outline-pane">
          <div className="left-intro">{t('nodeIntro')}</div>
          <div className="sidepanel-label">{t('structure')}</div>
          <nav aria-label={t('tree')} id="treeOutline">
            {root ? <OutlineItem frame={frame} node={root} depth={0} /> : null}
          </nav>
        </div>
      )}
      {!repeatOpen ? (
        <div className="left-bottom">
          <div className="sidepanel-label">{t('addToSelected')}</div>
          <div className="add-row">
            <button
              type="button"
              className="btn support-add"
              id="btnSupport"
              data-testid="add-support"
              disabled={!editable || selected?.kind === 'group'}
              onClick={() => addNode('support')}
            >
              {t('supportAdd')}
            </button>
            <button
              type="button"
              className="btn oppose-add"
              id="btnOppose"
              data-testid="add-oppose"
              disabled={!editable || selected?.kind === 'group'}
              onClick={() => addNode('oppose')}
            >
              {t('opposeAdd')}
            </button>
            <button
              type="button"
              className="btn neutral-add"
              id="btnNeutral"
              title={t('neutralAdd')}
              disabled={!editable || selected?.kind === 'group'}
              onClick={() => addNode('neutral')}
            >
              0
            </button>
          </div>
          {project.mode === 'decision' ? (
            <>
              <button
                type="button"
                className="btn option-add"
                id="btnOption"
                data-testid="add-option"
                disabled={!editable || votingOpen}
                onClick={() => addNode('option', selected?.kind === 'group' ? selected.id : root?.id)}
              >
                {t('optionAdd')}
              </button>
              <button
                type="button"
                className="btn option-add"
                id="btnOptionGroup"
                data-testid="add-group"
                disabled={!editable || votingOpen}
                onClick={() => addNode('group', selected?.kind === 'group' ? selected.id : root?.id)}
              >
                {t('optionGroupAdd')}
              </button>
            </>
          ) : null}
          <button
            type="button"
            className="btn quiet reuse-reason-open"
            id="btnContextReasons"
            onClick={openRepeatLibrary}
          >
            {t('contextOpen')}
          </button>
          <p className="quiet-note">{t('localHint')}</p>
        </div>
      ) : null}
    </aside>
  );
}
