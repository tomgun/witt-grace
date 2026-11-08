import { childrenOf, rootNode } from '../domain/index.ts';
import type { Node, Project } from '../domain/index.ts';
import { getStore, useAppState, useTranslator } from './store.ts';

function OutlineItem({ project, node, depth }: { project: Project; node: Node; depth: number }) {
  const state = useAppState();
  const store = getStore();
  const children = childrenOf(project, node.id);
  return (
    <>
      <button
        type="button"
        className={`outline-item${state.selectedId === node.id ? ' active' : ''}`}
        data-relation={node.relation}
        data-testid={`outline-${node.id}`}
        style={{ paddingLeft: 12 + depth * 14 }}
        aria-current={state.selectedId === node.id ? 'true' : undefined}
        onClick={() => store.select(node.id)}
      >
        <span className="outline-marker" aria-hidden="true" />
        <span className="outline-text">{node.title}</span>
        {children.length ? <span className="outline-arrow">{node.collapsed ? '▸' : '▾'}</span> : null}
      </button>
      {node.collapsed
        ? null
        : children.map((child) => (
            <OutlineItem key={child.id} project={project} node={child} depth={depth + 1} />
          ))}
    </>
  );
}

/** The left panel: the tree as an outline (UX-A08 companion to the canvas). */
export function Outline() {
  const { project } = useAppState();
  const t = useTranslator();
  const root = rootNode(project);
  return (
    <aside className="sidepanel leftpanel" aria-label={t('tree')} data-testid="outline">
      <div className="panel-heading">
        <div>
          <div className="eyebrow">{t('workArea')}</div>
          <h2>{t('tree')}</h2>
        </div>
        <span className="count-pill" data-testid="node-count">
          {project.nodes.length}
        </span>
      </div>
      <div className="sidepanel-label">{t('structure')}</div>
      <nav aria-label={t('tree')} className="tree-outline">
        {root ? <OutlineItem project={project} node={root} depth={0} /> : null}
      </nav>
    </aside>
  );
}
