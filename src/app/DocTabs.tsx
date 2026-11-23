// The project's diagrams as tabs (owner 2026-11-23, WG-059, S-15). Shown when the project has a second diagram or
// a name, so one unnamed diagram looks as it did before tabs. The tablist follows the ARIA pattern: arrows move between tabs,
// Home and End go to the ends, F2 renames, Delete removes, Alt+arrows move the tab.
import { useEffect } from 'react';
import type { KeyboardEvent } from 'react';
import { diagramLabel, isPlainDocument } from '../domain/index.ts';
import { addDiagram, removeDiagram, renameDiagram, renameProject } from './actions.ts';
import { getStore, useAppState, useTranslator } from './store.ts';

export function DocTabs() {
  const state = useAppState();
  const t = useTranslator();
  const store = getStore();
  const { workbook, activeTab } = state;
  const count = workbook.documents.length;
  const shownId = state.project.id;
  // The shown tab stays in sight in a row that scrolls (a reload, an attached set, undo to another tab).
  useEffect(() => {
    document
      .querySelector('#docTabs .doc-tab.active')
      ?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [shownId, activeTab, count]);
  if (isPlainDocument(workbook)) return null;
  const locked = !!state.collab && state.collab.phase !== 'ended';
  const focusTab = (index: number) =>
    requestAnimationFrame(() => document.getElementById(`docTab-${index}`)?.focus());
  const show = (index: number) => {
    if (!store.selectTab(index) && index !== store.get().activeTab) return;
    focusTab(index);
  };
  const remove = async () => {
    if (locked || count < 2) return;
    await removeDiagram(activeTab);
    // Wherever the focus was (the tab, the × button that may now be disabled), it goes to the shown tab.
    if (!isPlainDocument(store.get().workbook)) focusTab(store.get().activeTab);
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
    if (step && e.altKey) {
      e.preventDefault();
      if (store.moveTab(activeTab, activeTab + step)) focusTab(activeTab + step);
    } else if (step) {
      e.preventDefault();
      show((activeTab + step + count) % count);
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      show(e.key === 'Home' ? 0 : count - 1);
    } else if (e.key === 'F2') {
      e.preventDefault();
      void renameDiagram();
    } else if (e.key === 'Delete') {
      e.preventDefault();
      void remove();
    }
  };
  return (
    <div id="docTabs" className="doc-tabs" data-testid="doc-tabs">
      <button
        type="button"
        id="projectName"
        className={`doc-tabs-project${workbook.title ? '' : ' unnamed'}`}
        title={t('projectRenameAction')}
        aria-label={`${t('projectRenameAction')}: ${workbook.title || t('projectUntitled')}`}
        onClick={() => void renameProject()}
      >
        {workbook.title || t('projectUntitled')}
      </button>
      <div className="doc-tabs-list" role="tablist" aria-label={t('projectTabs')} onKeyDown={onKey}>
        {workbook.documents.map((diagram, index) => (
          <button
            key={diagram.id}
            type="button"
            role="tab"
            id={`docTab-${index}`}
            className={`doc-tab${index === activeTab ? ' active' : ''}`}
            aria-selected={index === activeTab}
            tabIndex={index === activeTab ? 0 : -1}
            data-doc-id={diagram.id}
            data-mode={diagram.mode}
            title={diagramLabel(diagram)}
            aria-controls="workspaceMain"
            disabled={locked && index !== activeTab}
            onClick={() => show(index)}
            onDoubleClick={() => void renameDiagram()}
          >
            <span className="doc-tab-type">
              {t(diagram.mode === 'decision' ? 'modeDecision' : 'modeArgument')}
            </span>
            <span className="doc-tab-title">{diagramLabel(diagram)}</span>
          </button>
        ))}
      </div>
      <div className="doc-tabs-actions">
        <button
          type="button"
          id="btnTabLeft"
          className="doc-tab-action"
          title={t('tabMoveLeft')}
          aria-label={t('tabMoveLeft')}
          disabled={locked || activeTab === 0}
          onClick={() => store.moveTab(activeTab, activeTab - 1)}
        >
          ◀
        </button>
        <button
          type="button"
          id="btnTabRight"
          className="doc-tab-action"
          title={t('tabMoveRight')}
          aria-label={t('tabMoveRight')}
          disabled={locked || activeTab === count - 1}
          onClick={() => store.moveTab(activeTab, activeTab + 1)}
        >
          ▶
        </button>
        <button
          type="button"
          id="btnTabRename"
          className="doc-tab-action"
          title={t('tabRenameAction')}
          aria-label={t('tabRenameAction')}
          onClick={() => void renameDiagram()}
        >
          ✎
        </button>
        <button
          type="button"
          id="btnTabClose"
          className="doc-tab-action"
          title={t('tabClose')}
          aria-label={t('tabClose')}
          disabled={locked || count < 2}
          onClick={() => void remove()}
        >
          ×
        </button>
        <button
          type="button"
          id="btnTabAdd"
          className="doc-tab-action doc-tab-add"
          title={t('tabAddTitle')}
          disabled={locked}
          onClick={addDiagram}
        >
          {t('tabAdd')}
        </button>
      </div>
    </div>
  );
}
