// "Tuo tai vie muutoksia ja arviointeja" (UI_INVENTORY S-11.24/S-11.26, inv-ai-contrib §B–C): the three steps of the
// prototype's contribution dialog. Step 1 builds the task text from the live document (copied or downloaded, never
// sent); step 2 preflights a pasted or opened proposal, previews the merge under the six category switches and
// per-item choices, and installs the accepted changes only on "Hyväksy ehdotukset"; step 3 exports the chosen local
// people's changes against the original file, each under their own name and id. File → Avaa JSON hands a proposal
// file here through `stageProposalFromFile`.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CONTRIBUTION_CATEGORIES,
  CONTRIBUTION_SCHEMA,
  applyContribution,
  buildContributionPrompt,
  exportContribution,
  isAiProfile,
  isContributionBundle,
  parseContributionBundle,
  previewContribution,
} from '../domain/index.ts';
import type {
  ContributionCategory,
  ContributionChoices,
  ContributionTask,
  Proposal,
} from '../domain/index.ts';
import { downloadText, pickTextFile } from '../lib/files.ts';
import { newId, nowIso } from '../lib/providers.ts';
import { canEdit } from './actions.ts';
import { Modal } from './dialogs.tsx';
import {
  FILE_SIZE_LIMIT,
  inspectOrReport,
  showImportReport,
  showImportSizeError,
  singleIssueReport,
  textByteLength,
} from './ImportReportDialog.tsx';
import { getStore, useAppState, useTranslator } from './store.ts';

type Staged = { proposal: Proposal; sourceName: string };
type Choices = Record<ContributionCategory, boolean>;
const PROPOSAL_FORMAT_NAME = 'WITT-/AI-muutosehdotus v2';
const ALL_ON: Choices = {
  claims: true,
  edits: true,
  links: true,
  sharedReasons: true,
  assessments: true,
  comments: true,
};
const CATEGORY_IDS: Record<ContributionCategory, string> = {
  claims: 'proposalClaims',
  edits: 'proposalEdits',
  links: 'proposalLinks',
  sharedReasons: 'proposalSharedReasons',
  assessments: 'proposalAssessments',
  comments: 'proposalComments',
};
const indices = (n: number): number[] => Array.from({ length: n }, (_, i) => i);
/** The preview form's starting values for a staged proposal: every item selected, the file's author as the source. */
function defaultsFor(staged: Staged | null): {
  claims: number[];
  edits: number[];
  kind: 'human' | 'ai';
  name: string;
  names: Record<string, string>;
} {
  const p = staged?.proposal;
  if (!p) return { claims: [], edits: [], kind: 'human', name: '', names: {} };
  if (isContributionBundle(p))
    return {
      claims: [],
      edits: [],
      kind: 'human',
      name: '',
      names: Object.fromEntries(p.contributors.map((c) => [c.sourceUserId, c.name])),
    };
  return {
    claims: indices(p.claims.length),
    edits: indices(p.edits.length),
    kind: p.author.kind,
    name: p.author.name,
    names: {},
  };
}
/** The prototype keeps the task select's value across openings within a session. */
let lastTask: ContributionTask = 'extend';
/** A proposal arriving from File → Avaa JSON, consumed by the dialog when it mounts. */
let pendingProposal: Staged | null = null;

/** The prototype's `previewContribution` after the preflight: the proposal is parsed at the boundary once. */
function stageProposal(parsed: unknown, sourceName: string): Staged | null {
  try {
    return { proposal: parseContributionBundle(parsed), sourceName };
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : 'Toiminto epäonnistui.';
    showImportReport(
      singleIssueReport(
        'contribution',
        PROPOSAL_FORMAT_NAME,
        'IMPORT',
        message,
        'Korjaa muutosehdotus ja varmista, että se vastaa nykyistä dokumenttia.'
      ),
      sourceName
    );
    return null;
  }
}

/** File → Avaa JSON with a proposal or bundle file: open straight into the preview (the preflight already passed). */
export function stageProposalFromFile(parsed: unknown, sourceName: string): void {
  const staged = stageProposal(parsed, sourceName);
  if (!staged) return;
  pendingProposal = staged;
  getStore().openDialog('aiReview');
}

export function AiReviewDialog() {
  const state = useAppState();
  const t = useTranslator();
  const store = getStore();
  const { project, language } = state;
  const [task, setTask] = useState<ContributionTask>(lastTask);
  const [taskStatus, setTaskStatus] = useState('');
  const [paste, setPaste] = useState('');
  const [status, setStatus] = useState('');
  const [exportStatus, setExportStatus] = useState('');
  const [exporters, setExporters] = useState<ReadonlySet<string>>(
    () => new Set(project.users.filter((u) => !isAiProfile(u)).map((u) => u.id))
  );
  // A proposal handed over by File → Avaa JSON starts in the preview with the same defaults as a pasted one.
  const [staged, setStaged] = useState<Staged | null>(pendingProposal);
  const [choices, setChoices] = useState<Choices>(ALL_ON);
  const [selectedClaims, setSelectedClaims] = useState<number[]>(() => defaultsFor(pendingProposal).claims);
  const [selectedEdits, setSelectedEdits] = useState<number[]>(() => defaultsFor(pendingProposal).edits);
  const [sourceKind, setSourceKind] = useState<'human' | 'ai'>(() => defaultsFor(pendingProposal).kind);
  const [sourceName, setSourceName] = useState(() => defaultsFor(pendingProposal).name);
  const [names, setNames] = useState<Record<string, string>>(() => defaultsFor(pendingProposal).names);
  const previewDetails = useRef<HTMLDetailsElement>(null);
  const previewArea = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    pendingProposal = null;
  }, []);
  const taskText = useMemo(() => {
    try {
      return buildContributionPrompt({ language, task, project });
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }, [language, task, project]);

  const close = () => {
    pendingProposal = null;
    store.openDialog(null);
  };
  const copyTask = async () => {
    try {
      await navigator.clipboard.writeText(taskText);
      setTaskStatus(t('aiTaskCopied'));
    } catch {
      if (previewDetails.current) previewDetails.current.open = true;
      previewArea.current?.focus();
      previewArea.current?.select();
      setTaskStatus(t('aiTaskManualCopy'));
    }
  };
  /** The prototype's `previewContribution`: every switch on, every item selected, the file's author as the source. */
  const stage = (next: Staged) => {
    const d = defaultsFor(next);
    setChoices(ALL_ON);
    setSelectedClaims(d.claims);
    setSelectedEdits(d.edits);
    setSourceKind(d.kind);
    setSourceName(d.name);
    setNames(d.names);
    setStaged(next);
  };
  const previewProposal = (raw: string, name = 'Muutosehdotus') => {
    const report = inspectOrReport(raw, { expected: 'contribution', currentProject: project }, name);
    if (!report.ok) return;
    const next = stageProposal(report.parsed, name);
    if (next) stage(next);
  };
  const chooseFile = async (file: File) => {
    try {
      if (file.size > FILE_SIZE_LIMIT) {
        showImportSizeError(file.name, 5);
        return;
      }
      previewProposal(await file.text(), file.name);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  // ---- the preview: the merge runs in full on every change, exactly as the prototype's refreshProposal ----
  const bundle = staged && isContributionBundle(staged.proposal) ? staged.proposal : null;
  const nameOf = (sourceUserId: string, fallback: string) => (names[sourceUserId] ?? fallback).trim();
  const nameMissing = staged
    ? bundle
      ? bundle.contributors.some((c) => !nameOf(c.sourceUserId, c.name))
      : !sourceName.trim()
    : false;
  const currentChoices = (): ContributionChoices =>
    bundle
      ? {
          ...choices,
          names: Object.fromEntries(
            bundle.contributors.map((c) => [c.sourceUserId, nameOf(c.sourceUserId, c.name)])
          ),
        }
      : { ...choices, selectedClaims, selectedEdits, source: { kind: sourceKind, name: sourceName.trim() } };
  const preview = useMemo(
    () =>
      staged && !nameMissing
        ? previewContribution(project, staged.proposal, currentChoices(), { now: nowIso(), newId })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [project, staged, nameMissing, choices, selectedClaims, selectedEdits, sourceKind, sourceName, names]
  );
  const previewText = (): string => {
    if (!staged) return '';
    if (nameMissing) return bundle ? 'Jokaisella tekijällä on oltava nimi' : t('contributionUsername');
    if (!preview) return '';
    if (!preview.ok) return preview.message || t('operationFailed');
    const c = preview.result.counts;
    if (preview.kind === 'bundle')
      return [
        'Yhteinen muutos- ja arviointitiedosto – jokaisella omat tekijätiedot',
        ...preview.result.actors.map((a) => `${a.name} · ${a.kind === 'ai' ? 'AI' : 'Ihminen'} · ${a.id}`),
        `Uusia solmuja: ${c.claims} · muokkauksia: ${c.edits} · arviointeja: ${c.assessments} · kommentteja: ${c.comments}`,
        `Vanhat tekijältään tuntemattomat muokkaukset, joita ei sisällytetty: ${preview.result.unattributedEdits}`,
        'Tiedosto ei todista henkilöllisyyttä. Hyväksy vain luotettavasta lähteestä saatu sisältö.',
      ].join('\n');
    return [
      `${sourceKind === 'human' ? t('contributionHuman') : t('contributionAI')}: ${sourceName.trim()}`,
      `${t('contributionClaims')}: ${c.claims}`,
      `${t('contributionEdits')}: ${c.edits}`,
      `${t('contributionLinks')}: ${c.links}`,
      `${t('contributionShared')}: ${c.sharedReasons} + ${c.sharedAttachments}`,
      `${t('includeRatings')}: ${c.assessments}`,
      `${t('includeComments')}: ${c.comments}`,
      ...preview.assessmentRows.map((r) => `  ${r.label}: ${r.credence ?? '–'}% · ${r.influence ?? '–'}/5`),
      ...preview.commentRows.map((r) => `  ${r.label}: ${r.body}`),
      c.skippedDependent ? `Ohitettuja viittauksia pois jätettyihin solmuihin: ${c.skippedDependent}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  };
  const applyProposal = () => {
    if (!staged || nameMissing || !preview || !preview.ok) return;
    if (!canEdit(state)) {
      store.showMessage(t('viewerCannotEdit'));
      return;
    }
    const originalProfiles = new Set(project.users.map((u) => u.id));
    const aiWithRatings =
      !bundle &&
      !isContributionBundle(staged.proposal) &&
      staged.proposal.author.kind === 'ai' &&
      choices.assessments &&
      preview.result.counts.assessments > 0;
    let merged;
    try {
      merged = applyContribution(project, staged.proposal, currentChoices(), {
        now: nowIso(),
        newId,
        actorId: state.actorId,
      });
    } catch (error) {
      store.showMessage(error instanceof Error ? error.message : String(error));
      return;
    }
    store.load(merged.project);
    if (aiWithRatings) {
      const added = merged.project.users.find((u) => isAiProfile(u) && !originalProfiles.has(u.id));
      if (added)
        store.setView({
          indexMode: 'personal',
          viewAssessorId: added.id,
          workflow: 'evaluate',
          layers: { ...state.view.layers, index: true, assessments: true },
          highlightOptions: merged.project.mode === 'decision',
        });
    }
    close();
  };
  const setCategory = (key: ContributionCategory, on: boolean) =>
    setChoices((c) => ({
      ...c,
      [key]: on,
      ...(key === 'assessments' && !on ? { sharedReasons: false } : {}),
    }));
  const toggleItem = (kind: 'claims' | 'edits', i: number, on: boolean) => {
    const update = (list: number[]) =>
      on ? [...list, i].sort((a, b) => a - b) : list.filter((x) => x !== i);
    if (kind === 'claims') setSelectedClaims(update);
    else setSelectedEdits(update);
  };

  // ---- step 3: the chosen people's changes against the original file ----
  const exportChanges = async () => {
    const picked = await pickTextFile('application/json,.json,.witt.json');
    if (!picked) return;
    try {
      if (textByteLength(picked.text) > FILE_SIZE_LIMIT) throw new Error(t('importTooLarge'));
      const report = inspectOrReport(picked.text, { expected: 'project' }, picked.name);
      if (!report.ok) return;
      const selected = [...exporters];
      if (!selected.length) throw new Error('Valitse vähintään yksi käyttäjä');
      const result = exportContribution(report.parsed, store.get().project, selected);
      downloadText(
        `witt-yhteismuutokset-${nowIso().slice(0, 10)}.json`,
        JSON.stringify(result, null, 2) + '\n'
      );
      setExportStatus(
        `Viety ${result.contributors.length} käyttäjän muutokset omilla nimillään. ` +
          (result.unattributedEdits.length || result.unattributedLinks || result.unattributedComments
            ? `Huom. ${result.unattributedEdits.length} aiemman tekstimuokkauksen, ${result.unattributedLinks} yhteyden ja ${result.unattributedComments} kommentin tekijää ei voitu todentaa; niitä ei viety. Tallenna koko WITT-tiedosto säilyttääksesi ne.`
            : 'Tekijättömiä muokkauksia ei löytynyt.')
      );
      setStatus(t('savedFile'));
    } catch (error) {
      setExportStatus((error instanceof Error && error.message) || t('operationFailed'));
    }
  };

  if (staged) {
    const single = isContributionBundle(staged.proposal) ? null : staged.proposal;
    const nodeTitle = (nodeId: string) => project.nodes.find((n) => n.id === nodeId)?.title;
    return (
      <Modal
        open
        onClose={close}
        title={t('contributionPreviewTitle')}
        id="aiReviewPreviewDialog"
        testId="ai-review-preview-dialog"
        className="action-dialog contribution-preview-dialog"
        heading={false}
      >
        <div className="proposal-source" id="proposalSingleSource" hidden={!single}>
          <label htmlFor="proposalSourceKind">{t('contributionSource')}</label>
          <select
            id="proposalSourceKind"
            value={sourceKind}
            onChange={(e) => setSourceKind(e.target.value as 'human' | 'ai')}
          >
            <option value="human">{t('contributionHuman')}</option>
            <option value="ai">{t('contributionAI')}</option>
          </select>
          <label htmlFor="proposalSourceName">{t('contributionUsername')}</label>
          <input
            id="proposalSourceName"
            type="text"
            maxLength={120}
            required
            value={sourceName}
            onChange={(e) => setSourceName(e.target.value)}
          />
          <small>{t('contributionSourceNote')}</small>
        </div>
        <div id="proposalGroupSources" className="contribution-participants" hidden={!bundle}>
          {bundle ? (
            <>
              <strong>Tekijät ja arvioijat (nimet tulevat JSON-tiedostosta)</strong>
              {bundle.contributors.map((entry) => (
                <label key={entry.sourceUserId} className="contribution-exporter">
                  <span>{entry.sourceUserId.slice(0, 12)}</span>
                  <input
                    type="text"
                    maxLength={70}
                    value={names[entry.sourceUserId] ?? entry.name}
                    data-source-user-id={entry.sourceUserId}
                    onChange={(e) => setNames((n) => ({ ...n, [entry.sourceUserId]: e.target.value }))}
                  />
                  <small>{`${entry.patch.claims.length} uutta solmua · ${entry.patch.assessments.length} arviota`}</small>
                </label>
              ))}
            </>
          ) : null}
        </div>
        <fieldset className="proposal-options">
          <legend>{t('contributionSelect')}</legend>
          {CONTRIBUTION_CATEGORIES.map((key) => (
            <label key={key}>
              <input
                id={CATEGORY_IDS[key]}
                type="checkbox"
                checked={choices[key]}
                disabled={key === 'sharedReasons' && !choices.assessments}
                onChange={(e) => setCategory(key, e.target.checked)}
              />{' '}
              <span>
                {t(
                  key === 'claims'
                    ? 'contributionClaims'
                    : key === 'edits'
                      ? 'contributionEdits'
                      : key === 'links'
                        ? 'contributionLinks'
                        : key === 'sharedReasons'
                          ? 'contributionShared'
                          : key === 'assessments'
                            ? 'includeRatings'
                            : 'includeComments'
                )}
              </span>
            </label>
          ))}
        </fieldset>
        <div id="proposalItemChoices" className="proposal-item-choices">
          {single && single.claims.length ? (
            <fieldset className="proposal-item-group" data-kind="claims">
              <legend>{t('contributionClaims')}</legend>
              {single.claims.map((item, i) => (
                <label key={i}>
                  <input
                    type="checkbox"
                    checked={selectedClaims.includes(i)}
                    disabled={!choices.claims}
                    onChange={(e) => toggleItem('claims', i, e.target.checked)}
                  />
                  {`${item.relation}: ${item.title}`}
                </label>
              ))}
            </fieldset>
          ) : null}
          {single && single.edits.length ? (
            <fieldset className="proposal-item-group" data-kind="edits">
              <legend>{t('contributionEdits')}</legend>
              {single.edits.map((item, i) => (
                <label key={i}>
                  <input
                    type="checkbox"
                    checked={selectedEdits.includes(i)}
                    disabled={!choices.edits}
                    onChange={(e) => toggleItem('edits', i, e.target.checked)}
                  />
                  {`${nodeTitle(item.nodeId) || item.nodeId} → ${
                    item.title ||
                    item.details?.slice(0, 70) ||
                    item.semanticType ||
                    item.constraintStatus ||
                    ''
                  }`}
                </label>
              ))}
            </fieldset>
          ) : null}
        </div>
        <div id="aiReviewPreview" className="proposal-preview-lines" role="status" aria-live="polite">
          {previewText()}
        </div>
        <p className="ai-caution">{t('contributionWarning')}</p>
        <div className="dialog-actions">
          <button
            type="button"
            id="btnAIReviewApply"
            className="btn primary"
            disabled={nameMissing || !preview || !preview.ok}
            onClick={applyProposal}
          >
            {t('aiReviewApply')}
          </button>
          <button type="button" id="btnAIReviewReject" className="btn quiet" onClick={close}>
            {t('cancel')}
          </button>
        </div>
      </Modal>
    );
  }

  const people = project.users.filter((u) => !isAiProfile(u));
  const reviewCount = (id: string) =>
    project.votes.filter((v) => v.userId === id).length +
    (project.edgeAssessments ?? []).filter((a) => a.userId === id).length;
  return (
    <Modal
      open
      onClose={close}
      title={t('contributionTitle')}
      id="aiReviewDialog"
      testId="ai-review-dialog"
      className="action-dialog ai-review-dialog"
      heading={false}
    >
      <p>{t('contributionIntro')}</p>
      <div className="ai-flow-explainer">{t('aiProposalExplainer')}</div>
      <details className="ai-proposal-step" open>
        <summary>{t('aiProposalStep1')}</summary>
        <label htmlFor="aiReviewMode">{t('contributionTask')}</label>
        <select
          id="aiReviewMode"
          value={task}
          onChange={(e) => {
            lastTask = e.target.value as ContributionTask;
            setTask(lastTask);
          }}
        >
          <option value="extend">{t('contributionExtend')}</option>
          <option value="assess">{t('contributionAssess')}</option>
        </select>
        <p className="ai-task-choice-hint">{t('aiTaskChoiceHint')}</p>
        <div className="dialog-actions ai-actions ai-task-actions">
          <button id="btnAIReviewCopy" type="button" className="btn primary" onClick={() => void copyTask()}>
            {t('aiTaskCopy')}
          </button>
          <button
            id="btnAIReviewExport"
            type="button"
            className="btn quiet"
            onClick={() => {
              downloadText('witt-ai-muutosehdotus-tehtava.txt', taskText, 'text/plain;charset=utf-8');
              setTaskStatus(t('aiTaskDownloaded'));
            }}
          >
            {t('aiTaskDownloadSame')}
          </button>
        </div>
        <p id="aiReviewTaskStatus" className="ai-task-status" role="status" aria-live="polite">
          {taskStatus}
        </p>
        <details id="aiReviewPromptPreviewDetails" className="ai-task-detail" ref={previewDetails}>
          <summary>{t('aiTaskPreview')}</summary>
          <textarea
            id="aiReviewPromptPreview"
            ref={previewArea}
            readOnly
            rows={8}
            aria-label="AI-tehtävän koko sisältö"
            value={taskText}
          />
        </details>
        <details id="aiReviewAdvanced" className="ai-task-detail ai-task-advanced">
          <summary>{t('aiTaskAdvanced')}</summary>
          <p>{t('aiTaskSchemaIncluded')}</p>
          <button
            id="btnAIReviewSchema"
            type="button"
            className="btn quiet"
            onClick={() =>
              downloadText(
                'witt-contribution-v2.schema.json',
                JSON.stringify(CONTRIBUTION_SCHEMA, null, 2) + '\n'
              )
            }
          >
            {t('aiTaskDownloadSchema')}
          </button>
        </details>
      </details>
      <details className="ai-proposal-step">
        <summary>{t('aiProposalStep2')}</summary>
        <label htmlFor="aiReviewPaste">{t('contributionPaste')}</label>
        <textarea
          id="aiReviewPaste"
          rows={4}
          style={{ width: '100%' }}
          placeholder='{ "format": "witt-contribution-v2", ... }'
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
        />
        <input
          type="file"
          id="aiReviewInput"
          className="visually-hidden"
          accept="application/json,.json"
          ref={fileInput}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void chooseFile(file);
          }}
        />
        <div className="dialog-actions">
          <button
            id="btnAIReviewUpload"
            type="button"
            className="btn quiet"
            onClick={() => fileInput.current?.click()}
          >
            {t('contributionChooseFile')}
          </button>
          <button
            id="btnAIReviewImport"
            type="button"
            className="btn primary"
            onClick={() => previewProposal(paste)}
          >
            {t('previewChanges')}
          </button>
          <button id="btnAIReviewClose" type="button" className="btn quiet" onClick={close}>
            {t('close')}
          </button>
        </div>
        <p id="aiReviewStatus" role="status" aria-live="polite">
          {status}
        </p>
      </details>
      <details className="ai-proposal-step">
        <summary>{t('aiProposalStep3')}</summary>
        <p>{t('contributionMultiExportHelp')}</p>
        <div
          id="contributionExporterList"
          className="contribution-participants"
          role="group"
          aria-label="Vietävät käyttäjät"
        >
          {people.map((person) => (
            <label key={person.id} className="contribution-exporter">
              <input
                type="checkbox"
                value={person.id}
                data-export-user-id={person.id}
                checked={exporters.has(person.id)}
                onChange={(e) =>
                  setExporters((s) => {
                    const next = new Set(s);
                    if (e.target.checked) next.add(person.id);
                    else next.delete(person.id);
                    return next;
                  })
                }
              />
              <span>{person.name}</span>
              <small>{`${reviewCount(person.id)} arviota`}</small>
            </label>
          ))}
        </div>
        <p className="inspector-note">{t('contributionNameHelp')}</p>
        <button
          id="btnContributionEditUsers"
          className="btn quiet"
          type="button"
          onClick={() => store.openDialog('people')}
        >
          {t('contributionEditUsers')}
        </button>
        <div className="dialog-actions">
          <button
            type="button"
            id="btnWITTExport"
            className="btn primary"
            onClick={() => void exportChanges()}
          >
            {t('contributionHumanExport')}
          </button>
        </div>
        <p id="contributionExportStatus" role="status" aria-live="polite">
          {exportStatus}
        </p>
      </details>
    </Modal>
  );
}
