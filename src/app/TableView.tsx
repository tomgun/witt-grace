// The argument table and the mobile argument list, rebuilt from the prototype's renderTable and
// renderMobileArguments (UX-06, inv-review-vote-table §F). A read-only projection: every cell is text, the only
// edits are the mobile "+ Puoltava / − Vastainen" row. Ids and classes are the prototype's so the stylesheet and the
// same Playwright selectors apply.
import { useEffect, useRef, useState } from 'react';
import { assessmentDetails, isAiProfile, isGate, projectRows } from '../domain/index.ts';
import type { AssessmentDetails, InfluenceSummary, Node, TableRow, TableStance } from '../domain/index.ts';
import { newId } from '../lib/providers.ts';
import { canEdit } from './actions.ts';
import { displayedPrimaryRelation, importanceHint, importanceShort, signed } from './derive.ts';
import type { Frame } from './projection.ts';
import { getStore, useAppState, useTranslator } from './store.ts';
import {
  chainHint,
  detailEvaluationLines,
  detailIndividualLines,
  detailLinkLines,
  detailNotes,
  evaluationCells,
  lensFilteredDetails,
  mobileMetrics,
  mobileRelationWord,
  tableRelationName,
} from './tableFormat.ts';

interface TableState {
  projectId: string;
  query: string;
  stance: TableStance;
  expandedId: string | null;
}
const EMPTY: TableState = { projectId: '', query: '', stance: 'all', expandedId: null };
/** The prototype's `tableState`: it survives a tree/table toggle and resets when another document is loaded. */
const memory: { state: TableState } = { state: EMPTY };
/** The prototype focuses the search box when the table is chosen, not when a session boots into it. */
let bootMount = true;

/** The prototype's `influenceStatusTag`: a badge only for the ambiguous statuses, with the distribution as title. */
function StatusTag({ summary }: { summary: InfluenceSummary | null }) {
  const t = useTranslator();
  const status = summary?.status;
  const key =
    status === 'contradictory'
      ? 'influenceStatusContradictory'
      : status === 'neutral'
        ? 'influenceStatusNeutral'
        : status === 'mixed-neutral'
          ? 'influenceStatusMixedNeutral'
          : null;
  if (!key || !summary) return null;
  const title = t('influenceDistribution', {
    positive: summary.positive,
    negative: summary.negative,
    neutral: summary.neutral,
  });
  return (
    <span
      className={`influence-status influence-status-${status}`}
      title={title}
      aria-label={`${t(key)}. ${title}`}
    >
      {t(key)}
    </span>
  );
}

function DetailCard({ title, lines }: { title: string; lines: string[] }) {
  return (
    <section className="table-detail-card">
      <h3>{title}</h3>
      {lines.map((line, i) => (
        <p key={i}>{line}</p>
      ))}
    </section>
  );
}

export function TableView({ frame }: { frame: Frame }) {
  const state = useAppState();
  const t = useTranslator();
  const store = getStore();
  const { project, view, lens, importance, leadingOptionIds, projection } = frame;
  const ctx = frame;
  const [kept, setKept] = useState<TableState>(() => memory.state);
  const ts = kept.projectId === project.id ? kept : EMPTY;
  const update = (patch: Partial<Omit<TableState, 'projectId'>>) =>
    setKept({ ...ts, ...patch, projectId: project.id });
  useEffect(() => {
    memory.state = kept;
  }, [kept]);
  const rows = projectRows(project, ts);
  const evaluate = view.workflow === 'evaluate';
  const columns = evaluate ? 7 : 4;
  const editable = canEdit(state);
  const commentCounts = new Map<string, number>();
  for (const c of project.comments) commentCounts.set(c.nodeId, (commentCounts.get(c.nodeId) ?? 0) + 1);
  const linkCounts = new Map<string, number>();
  for (const link of project.links)
    for (const id of [link.sourceId, link.targetId]) linkCounts.set(id, (linkCounts.get(id) ?? 0) + 1);

  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const skip = bootMount && (!document.activeElement || document.activeElement === document.body);
    bootMount = false;
    if (skip) return;
    const raf = requestAnimationFrame(() => searchRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(raf);
  }, []);

  /** A created mobile claim scrolls into view once its card exists. */
  const pendingScroll = useRef<string | null>(null);
  useEffect(() => {
    const title = pendingScroll.current;
    if (title === null) return;
    pendingScroll.current = null;
    const target = [
      ...document.querySelectorAll<HTMLElement>('#mobileArguments .mobile-card .mobile-title'),
    ].find((el) => el.textContent === title);
    target?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  });

  const toggleExpanded = (id: string) => {
    store.select(id);
    update({ expandedId: ts.expandedId === id ? null : id });
  };
  /** "Näytä puussa": reveal the closed path, switch to the tree and centre the node. */
  const openInTree = (node: Node, resetDepth: boolean) => {
    store.select(node.id);
    store.setTableReveal(node.id);
    if (resetDepth && view.depthLimit !== null) {
      store.setDepthOverrides(new Map());
      store.setView({ depthLimit: null });
    }
    const byId = new Map(project.nodes.map((n) => [n.id, n]));
    const closed = new Set(store.get().explicitlyClosedIds);
    for (let item: Node | undefined = node; item; item = item.parentId ? byId.get(item.parentId) : undefined)
      closed.delete(item.id);
    store.setExplicitlyClosed(closed);
    store.setView({ presentation: 'tree' });
    store.requestCenter(node.id);
  };
  const addMobileChild = (parent: Node, relation: 'support' | 'oppose', input: HTMLInputElement) => {
    const value = input.value.trim();
    if (!value) {
      input.focus();
      return;
    }
    if (!editable) {
      store.showMessage(t('viewerCannotEdit'));
      return;
    }
    const id = newId();
    if (!store.dispatch({ type: 'node.add', id, parentId: parent.id, relation, title: value })) return;
    pendingScroll.current = value;
    // In a collaboration the row exists once the host commits it.
    store.afterNode(id, () => {
      store.select(id);
      update({ expandedId: id });
    });
  };
  const isAiAuthored = (node: Node) => project.users.some((u) => u.id === node.createdBy && isAiProfile(u));

  const renderRow = (row: TableRow) => {
    const { node } = row;
    const expanded = ts.expandedId === node.id;
    const classes = ['table-argument-row'];
    if (importance.importantIds.has(node.id)) classes.push('important-reason');
    if (leadingOptionIds.has(node.id)) classes.push('ai-leading-option');
    if (isGate(node)) classes.push('semantic-gate');
    if (state.selectedId === node.id) classes.push('selected');
    if (view.focus.mode !== 'all')
      classes.push(
        projection.matchIds.has(node.id)
          ? 'focus-match'
          : projection.contextIds.has(node.id)
            ? 'focus-context'
            : 'focus-muted'
      );
    const effect = importance.importantIds.has(node.id) ? importance.effects.get(node.id) : undefined;
    const relationName = tableRelationName(ctx, t, node);
    const direction = displayedPrimaryRelation(ctx, node);
    const chain = chainHint(t, row);
    const cells = evaluate ? evaluationCells(ctx, t, node) : null;
    const count =
      (view.layers.comments ? (commentCounts.get(node.id) ?? 0) : 0) + (linkCounts.get(node.id) ?? 0);
    const moreLabel = t(expanded ? 'tableLess' : 'tableMore');
    return (
      <tr key={node.id} className={classes.join(' ')} data-node-id={node.id}>
        <td className="table-claim-cell">
          <div
            className="table-claim-wrap"
            style={{ '--tree-depth': `${Math.min(row.depth, 9)}` } as React.CSSProperties}
          >
            {row.depth ? <span className="table-indent">↳</span> : null}
            <button
              type="button"
              className="table-claim-button"
              data-table-node-id={node.id}
              aria-expanded={expanded}
              aria-label={`${node.title} — ${moreLabel}`}
              onClick={() => toggleExpanded(node.id)}
            >
              {node.title}
            </button>
            {effect ? (
              <small className="reason-importance-badge" title={importanceHint(project, t, effect)}>
                {importanceShort(effect)}
              </small>
            ) : null}
            {node.semanticType && node.semanticType !== 'unspecified' ? (
              <small className="table-semantic">{t(`semantic_${node.semanticType}`)}</small>
            ) : null}
            {node.reasonConceptId ? <small className="table-semantic">{t('contextBadge')}</small> : null}
            {isAiAuthored(node) ? <small className="node-ai-author">AI</small> : null}
            {row.isCollapsedDescendant ? (
              <span
                className="table-hidden-marker"
                title={t('tableCollapsedNote')}
                aria-label={t('tableCollapsedNote')}
              >
                ◌
              </span>
            ) : null}
          </div>
        </td>
        <td className="table-relation-cell">
          <span
            className={`table-relation ${direction}`}
            title={node.parentId ? t('tableRelativeParent') : ''}
          >
            {relationName}
          </span>
          {chain ? (
            <small className="table-chain" title={chain.title}>
              {chain.text}
            </small>
          ) : null}
        </td>
        <td
          className="table-context-cell"
          title={row.parent ? row.ancestors.map((item) => item.title).join(' › ') : undefined}
        >
          {row.parent ? (
            <>
              <span className="table-parent">{row.parent.title}</span>
              {row.grandparent ? (
                <small className="table-grandparent">↳ {row.grandparent.title}</small>
              ) : null}
            </>
          ) : (
            <span className="table-no-context">—</span>
          )}
        </td>
        {cells ? (
          <>
            <td className="table-number" title={cells.provenance}>
              {cells.credence}
            </td>
            <td className="table-number" title={cells.provenance}>
              {cells.impact}
              <StatusTag summary={cells.status} />
            </td>
            <td className="table-number table-index">{cells.index}</td>
          </>
        ) : null}
        <td className="table-actions">
          <button
            type="button"
            className="btn quiet table-more"
            aria-expanded={expanded}
            onClick={() => toggleExpanded(node.id)}
          >
            {`${expanded ? '▴' : '▾'} ${moreLabel}${count ? ` · ${count}` : ''}`}
          </button>
        </td>
      </tr>
    );
  };

  const renderExpanded = (row: TableRow) => {
    const { node } = row;
    const raw = assessmentDetails(project, node.id);
    if (!raw) return null;
    const detail: AssessmentDetails = lensFilteredDetails(raw, lens);
    return (
      <tr key={`${node.id}-detail`} className="table-expanded-row">
        <td className="table-expanded-cell" colSpan={columns}>
          <div className="table-detail-grid">
            <DetailCard title={t('tableNotes')} lines={detailNotes(ctx, t, detail)} />
            {evaluate ? (
              <DetailCard title={t('tableEvaluations')} lines={detailEvaluationLines(ctx, t, detail)} />
            ) : null}
            {detail.reviews.length || detail.impactReviews.length ? (
              <DetailCard title={t('tableIndividual')} lines={detailIndividualLines(t, detail)} />
            ) : null}
            {detail.links.length ? (
              <DetailCard title={t('tableLinks')} lines={detailLinkLines(t, detail)} />
            ) : null}
          </div>
          <button type="button" className="btn quiet table-open-tree" onClick={() => openInTree(node, true)}>
            {t('tableOpenTree')}
          </button>
        </td>
      </tr>
    );
  };

  const renderMobileCard = (row: TableRow) => {
    const { node } = row;
    const expanded = ts.expandedId === node.id;
    const direction = displayedPrimaryRelation(ctx, node);
    const metrics =
      evaluate && node.kind !== 'decision' && node.kind !== 'group' ? mobileMetrics(ctx, t, node) : null;
    const detail = expanded ? assessmentDetails(project, node.id) : null;
    return (
      <article
        key={node.id}
        className={`mobile-card${state.selectedId === node.id ? ' is-selected' : ''}`}
        role="listitem"
      >
        <small className={`mobile-path mobile-relation ${direction}`}>
          {mobileRelationWord(ctx, t, row)}
        </small>
        <button
          type="button"
          className="mobile-title"
          aria-expanded={expanded}
          onClick={() => toggleExpanded(node.id)}
        >
          {node.title}
        </button>
        {row.parent ? (
          <small
            className="mobile-parent"
            title={row.grandparent ? row.ancestors.map((v) => v.title).join(' › ') : undefined}
          >
            ↳ {row.parent.title}
          </small>
        ) : null}
        {metrics ? (
          <div className="mobile-ratings">
            <span>{metrics.credence}</span>
            {metrics.index !== null ? <span>{metrics.index}</span> : null}
            {metrics.impact !== null ? <span>{metrics.impact}</span> : null}
            {metrics.impact !== null ? <StatusTag summary={metrics.status} /> : null}
          </div>
        ) : null}
        {expanded && detail ? (
          <div className="mobile-card-details">
            <p>{node.details || t('tableNoNotes')}</p>
            {detail.reviews
              .filter((v) => lens.userIds.has(v.userId))
              .map((item) => (
                <p key={item.id}>{`${item.name}: ${t('tableColCredence')} ${item.credence}/100`}</p>
              ))}
            {detail.impactReviews
              .filter((v) => lens.userIds.has(v.userId) && !v.stale)
              .map((item) => (
                <p key={item.id}>{`${item.name}: ${t('tableColInfluence')} ${signed(item.influence)}/5`}</p>
              ))}
            <button type="button" className="btn quiet" onClick={() => openInTree(node, false)}>
              {t('tableOpenTree')}
            </button>
            {editable ? (
              <MobileAddRow onAdd={(relation, input) => addMobileChild(node, relation, input)} />
            ) : null}
          </div>
        ) : null}
      </article>
    );
  };

  return (
    <section id="tableArea" className="table-area" aria-label={t('tableTitle')} data-testid="table-view">
      <div className="table-header">
        <div>
          <div className="eyebrow">{t('tableEyebrow')}</div>
          <h2>{t('tableTitle')}</h2>
          <p>{t('tableIntro')}</p>
        </div>
        <div className="table-filters">
          <label>
            <span className="visually-hidden">{t('tableSearchLabel')}</span>
            <input
              ref={searchRef}
              id="tableSearch"
              type="search"
              placeholder={t('tableSearchLabel')}
              autoComplete="off"
              value={ts.query}
              onChange={(e) => update({ query: e.target.value, expandedId: null })}
            />
          </label>
          <label>
            <span className="visually-hidden">{t('tableFilterLabel')}</span>
            <select
              id="tableFilter"
              aria-label={t('tableFilterLabel')}
              value={ts.stance}
              onChange={(e) => update({ stance: e.target.value as TableStance, expandedId: null })}
            >
              <option value="all">{t('tableAll')}</option>
              <option value="support">{t('supportWord')}</option>
              <option value="oppose">{t('opposeWord')}</option>
              <option value="option">{t('optionWord')}</option>
            </select>
          </label>
          <button
            type="button"
            id="btnReviewLensTable"
            className="btn quiet"
            title={t(lens.filtered ? 'lensFilteredHint' : 'lensAllHint')}
            aria-pressed={lens.filtered}
            onClick={() => store.openDialog('reviewLens')}
          >
            {lens.filtered
              ? `${t('reviewLens')} · ${lens.selectedCount}/${lens.totalCount}`
              : t('reviewLens')}
          </button>
          <label className="table-comments-toggle">
            <input
              id="tableComments"
              type="checkbox"
              checked={!!view.layers.comments}
              onChange={(e) => store.setView({ layers: { ...view.layers, comments: e.target.checked } })}
            />
            <span>{t('tableShowComments')}</span>
          </label>
        </div>
      </div>
      <div id="tableSummary" className="table-summary" role="status">
        {t('tableResults', { count: rows.length, total: project.nodes.length })}
      </div>
      <div id="reviewLensBanner" className="review-lens-banner" hidden={!lens.filtered}>
        {lens.filtered
          ? t('lensSelectedBanner', { selected: lens.selectedCount, total: lens.totalCount })
          : ''}
      </div>
      <div id="mobileArguments" className="mobile-arguments" role="list">
        {rows.map(renderMobileCard)}
      </div>
      <div id="tableScroll" className="table-scroll" tabIndex={0}>
        <table className="argument-table">
          <thead>
            <tr>
              <th>{t('tableColClaim')}</th>
              <th>{t('tableColRelation')}</th>
              <th>{t('tableColContext')}</th>
              <th className="table-evaluation-col">{t('tableColCredence')}</th>
              <th className="table-evaluation-col">{t('tableColInfluence')}</th>
              <th className="table-evaluation-col">{t('tableColIndex')}</th>
              <th>{t('tableColDetails')}</th>
            </tr>
          </thead>
          <tbody id="argumentTableBody">
            {rows.flatMap((row) =>
              ts.expandedId === row.node.id ? [renderRow(row), renderExpanded(row)] : [renderRow(row)]
            )}
            {rows.length === 0 ? (
              <tr>
                <td className="table-empty" colSpan={columns}>
                  {t('tableNoResults')}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** The prototype's mobile add row: a text field and the two stance buttons; an empty field only refocuses. */
function MobileAddRow({
  onAdd,
}: {
  onAdd: (relation: 'support' | 'oppose', input: HTMLInputElement) => void;
}) {
  const t = useTranslator();
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="mobile-add-row">
      <input
        ref={inputRef}
        type="text"
        maxLength={200}
        placeholder={t('mobileNewClaim')}
        aria-label={t('mobileNewClaim')}
      />
      <div className="mobile-add-actions">
        <button
          type="button"
          className="btn support-add"
          onClick={() => inputRef.current && onAdd('support', inputRef.current)}
        >
          {t('supportAdd')}
        </button>
        <button
          type="button"
          className="btn oppose-add"
          onClick={() => inputRef.current && onAdd('oppose', inputRef.current)}
        >
          {t('opposeAdd')}
        </button>
      </div>
    </div>
  );
}
