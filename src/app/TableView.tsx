import { useState } from 'react';
import { displayedStance, rootNode } from '../domain/index.ts';
import type { Node, Scores, Stance } from '../domain/index.ts';
import { balanceText, credenceText, influenceText } from './format.ts';
import { getStore, useAppState, useTranslator } from './store.ts';

interface Row {
  node: Node;
  depth: number;
  parent: Node | undefined;
  stance: Stance;
}

/** The argument table: every claim in logical order with its direct relation, its context and its review (UX-A08). */
export function TableView({ scores }: { scores: Scores }) {
  const state = useAppState();
  const t = useTranslator();
  const store = getStore();
  const { project, actorId } = state;
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'support' | 'oppose' | 'neutral' | 'option'>('all');
  const byParent = new Map<string | null, Node[]>();
  for (const node of project.nodes) {
    if (!byParent.has(node.parentId)) byParent.set(node.parentId, []);
    byParent.get(node.parentId)?.push(node);
  }
  const rows: Row[] = [];
  const walk = (node: Node, depth: number) => {
    const parent = node.parentId ? project.nodes.find((n) => n.id === node.parentId) : undefined;
    rows.push({
      node,
      depth,
      parent,
      stance: node.parentId === null ? 'root' : displayedStance(project, node, actorId),
    });
    for (const child of byParent.get(node.id) ?? []) walk(child, depth + 1);
  };
  const root = rootNode(project);
  if (root) walk(root, 0);
  const needle = query.trim().toLocaleLowerCase();
  const shown = rows.filter(
    (r) =>
      (filter === 'all' || r.stance === filter) &&
      (!needle || `${r.node.title} ${r.node.details}`.toLocaleLowerCase().includes(needle))
  );
  const stanceWord = (s: Stance) =>
    s === 'root'
      ? t('rootNote')
      : s === 'option'
        ? t('optionWord')
        : s === 'group'
          ? t('optionGroupAdd')
          : s === 'support'
            ? t('supportWord')
            : s === 'oppose'
              ? t('opposeWord')
              : t('neutralWord');
  return (
    <section className="table-area" aria-label={t('tableTitle')} data-testid="table-view">
      <div className="table-header">
        <div>
          <div className="eyebrow">{t('tableEyebrow')}</div>
          <h2>{t('tableTitle')}</h2>
          <p className="inspector-note">{t('tableIntro')}</p>
        </div>
        <div className="table-controls">
          <label className="visually-hidden" htmlFor="tableSearch">
            {t('tableSearchLabel')}
          </label>
          <input
            id="tableSearch"
            data-testid="table-search"
            type="search"
            placeholder={t('tableSearchLabel')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <label className="visually-hidden" htmlFor="tableFilter">
            {t('tableFilterLabel')}
          </label>
          <select
            id="tableFilter"
            data-testid="table-filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
          >
            <option value="all">{t('tableAll')}</option>
            <option value="support">{t('supportWord')}</option>
            <option value="oppose">{t('opposeWord')}</option>
            <option value="neutral">{t('neutralWord')}</option>
            {project.mode === 'decision' ? <option value="option">{t('optionWord')}</option> : null}
          </select>
          <span className="inspector-note" data-testid="table-count">
            {t('tableResults', { count: shown.length, total: rows.length })}
          </span>
        </div>
      </div>
      <table className="argument-table">
        <thead>
          <tr>
            <th scope="col">{t('tableColClaim')}</th>
            <th scope="col">{t('tableColRelation')}</th>
            <th scope="col">{t('tableColContext')}</th>
            <th scope="col">{t('tableColCredence')}</th>
            <th scope="col">{t('tableColInfluence')}</th>
            <th scope="col">{t('tableColIndex')}</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr>
              <td colSpan={6}>{t('tableNoResults')}</td>
            </tr>
          ) : null}
          {shown.map(({ node, depth, parent, stance }) => {
            const score = scores.get(node.id);
            const vote = project.votes.find((v) => v.nodeId === node.id && v.userId === actorId);
            const edge = project.edgeAssessments.find(
              (a) => a.subjectType === 'primary' && a.subjectId === node.id && a.userId === actorId
            );
            const selected = node.id === state.selectedId;
            return (
              <tr
                key={node.id}
                className={selected ? 'selected' : ''}
                data-testid={`table-row-${node.id}`}
                data-relation={stance}
              >
                <th scope="row" style={{ paddingLeft: 8 + depth * 14 }}>
                  <button
                    type="button"
                    className="btn quiet table-claim"
                    onClick={() => store.select(node.id)}
                    aria-current={selected ? 'true' : undefined}
                  >
                    {node.title}
                  </button>
                </th>
                <td>{stanceWord(stance)}</td>
                <td className="table-context">{parent?.title ?? ''}</td>
                <td>{node.kind === 'claim' ? credenceText(vote ? vote.confidence : null) : ''}</td>
                <td>
                  {node.kind === 'claim' && node.parentId ? influenceText(edge ? edge.influence : null) : ''}
                </td>
                <td>
                  {balanceText(score?.balance ?? null)}
                  {score?.incomplete ? ' *' : ''}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
