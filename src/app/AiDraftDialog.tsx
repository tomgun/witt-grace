// "Luo uusi puu kielimallilla" (UI_INVENTORY S-11.12/S-11.13, inv-ai-contrib §A): the task text is copied or
// downloaded, never sent; the AI's reply is pasted or opened, preflighted, previewed with three include toggles and
// installed only after the replacement dialog. A draft with ratings then opens in that AI's perspective, as in the
// prototype. File → Avaa JSON hands a draft file here through `stageDraftFromFile`.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DRAFT_SCHEMA,
  draftSummary,
  draftToProject,
  buildDraftPrompt,
  isAiProfile,
  parseAiDraft,
} from '../domain/index.ts';
import type { AiDraft, Mode } from '../domain/index.ts';
import { downloadText } from '../lib/files.ts';
import { newId, nowIso } from '../lib/providers.ts';
import { Modal } from './dialogs.tsx';
import {
  FILE_SIZE_LIMIT,
  inspectOrReport,
  showImportReport,
  showImportSizeError,
  singleIssueReport,
} from './ImportReportDialog.tsx';
import { getStore, useAppState, useTranslator } from './store.ts';

type Staged = { draft: AiDraft; sourceName: string };
const DRAFT_FORMAT_NAME = 'AI:n arvioitu puu v2';
/** The prototype keeps the topic and material textareas across openings within a session. */
let lastTopic = '';
let lastContext = '';
/** A draft arriving from File → Avaa JSON, consumed by the dialog when it mounts. */
let pendingDraft: Staged | null = null;

/** The prototype's `previewDraft` after the preflight: the whole draft is built once before any preview. */
function stageDraft(parsed: unknown, sourceName: string): Staged | null {
  try {
    const draft = parseAiDraft(parsed);
    draftToProject(draft, { now: nowIso(), newId });
    return { draft, sourceName };
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : 'Toiminto epäonnistui.';
    showImportReport(
      singleIssueReport(
        'draft',
        DRAFT_FORMAT_NAME,
        'IMPORT',
        message,
        'Korjaa tiedoston rakenne tai viittaukset.'
      ),
      sourceName
    );
    return null;
  }
}

/** File → Avaa JSON with a `witt-ai-draft-v2` file: open straight into the preview (the preflight already passed). */
export function stageDraftFromFile(parsed: unknown, sourceName: string): void {
  const staged = stageDraft(parsed, sourceName);
  if (!staged) return;
  pendingDraft = staged;
  getStore().openDialog('aiDraft');
}

/** The prototype's hard-coded Finnish `#aiDraftPreview` lines. */
export function draftPreviewLines(draft: AiDraft): string {
  const s = draftSummary(draft);
  return [
    `${s.title} (${s.mode})`,
    `AI: ${s.assessor}`,
    `${s.claims} solmua · ${s.sharedReasons} yhteisperustetta · ${s.links} lisäyhteyttä`,
    `${s.credenceRatings} uskottavuusarviota · ${s.influenceRatings} vaikutusarviota`,
    ...s.items.map((n) => `• ${n.title} (${n.relation}) · ${n.credence ?? '–'}% · ${n.influence ?? '–'}/5`),
    s.more ? `… ${s.more} lisää` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function AiDraftDialog() {
  const state = useAppState();
  const t = useTranslator();
  const store = getStore();
  const { project, language } = state;
  const [step, setStep] = useState<'prompt' | 'import'>('prompt');
  const [mode, setMode] = useState<Mode>(project.mode);
  const [topic, setTopic] = useState(lastTopic);
  const [context, setContext] = useState(lastContext);
  const [taskStatus, setTaskStatus] = useState('');
  const [paste, setPaste] = useState('');
  const [status, setStatus] = useState('');
  const [staged, setStaged] = useState<Staged | null>(pendingDraft);
  const [includeRatings, setIncludeRatings] = useState(true);
  const [includeComments, setIncludeComments] = useState(true);
  const [includeShared, setIncludeShared] = useState(true);
  const [previewError, setPreviewError] = useState('');
  const previewDetails = useRef<HTMLDetailsElement>(null);
  const previewArea = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    pendingDraft = null;
    if (!staged) document.getElementById('aiTopic')?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const task = useMemo(
    () => buildDraftPrompt({ mode, topic, context, language }),
    [mode, topic, context, language]
  );
  const close = () => {
    pendingDraft = null;
    store.openDialog(null);
  };
  const copyTask = async () => {
    try {
      await navigator.clipboard.writeText(task);
      setTaskStatus(t('aiTaskCopied'));
    } catch {
      if (previewDetails.current) previewDetails.current.open = true;
      previewArea.current?.focus();
      previewArea.current?.select();
      setTaskStatus(t('aiTaskManualCopy'));
    }
  };
  const previewDraft = (raw: string, sourceName = 'AI:n vastaus') => {
    const report = inspectOrReport(raw, { expected: 'draft' }, sourceName);
    if (!report.ok) return;
    const next = stageDraft(report.parsed, sourceName);
    if (!next) return;
    setIncludeRatings(true);
    setIncludeComments(true);
    setIncludeShared(true);
    setPreviewError('');
    setStaged(next);
  };
  const chooseFile = async (file: File) => {
    try {
      if (file.size > FILE_SIZE_LIMIT) {
        showImportSizeError(file.name, 5);
        return;
      }
      previewDraft(await file.text(), file.name);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };
  const applyDraft = async () => {
    if (!staged) return;
    try {
      const incoming = draftToProject(staged.draft, {
        includeRatings,
        includeComments,
        includeShared,
        now: nowIso(),
        newId,
      });
      const choice = await store.prepareReplacement(t('importConfirm', { title: incoming.title }));
      if (!choice) return;
      store.load(incoming);
      if (includeRatings) {
        const ai = incoming.users.find((u) => isAiProfile(u));
        if (ai)
          store.setView({
            indexMode: 'personal',
            viewAssessorId: ai.id,
            workflow: 'evaluate',
            layers: { ...state.view.layers, index: true, assessments: true },
            highlightOptions: incoming.mode === 'decision',
          });
      }
      close();
    } catch (error) {
      setPreviewError(error instanceof Error && error.message ? error.message : t('operationFailed'));
    }
  };

  if (staged) {
    return (
      <Modal
        open
        onClose={close}
        title={t('draftPreviewTitle')}
        id="aiDraftPreviewDialog"
        testId="ai-draft-preview-dialog"
        heading={false}
      >
        <div id="aiDraftPreview" className="proposal-preview-lines">
          {previewError || draftPreviewLines(staged.draft)}
        </div>
        <div className="proposal-options">
          <label>
            <input
              type="checkbox"
              id="draftIncludeRatings"
              checked={includeRatings}
              onChange={(e) => {
                setIncludeRatings(e.target.checked);
                if (!e.target.checked) setIncludeShared(false);
              }}
            />{' '}
            <span>{t('includeRatings')}</span>
          </label>
          <label>
            <input
              type="checkbox"
              id="draftIncludeComments"
              checked={includeComments}
              onChange={(e) => setIncludeComments(e.target.checked)}
            />{' '}
            <span>{t('includeComments')}</span>
          </label>
          <label>
            <input
              type="checkbox"
              id="draftIncludeShared"
              checked={includeShared}
              disabled={!includeRatings}
              onChange={(e) => setIncludeShared(e.target.checked)}
            />{' '}
            <span>{t('includeShared')}</span>
          </label>
        </div>
        <p className="ai-caution">{t('draftRatingNotice')}</p>
        <div className="dialog-actions">
          <button type="button" id="btnDraftApply" className="btn primary" onClick={() => void applyDraft()}>
            {t('draftOpen')}
          </button>
          <button type="button" id="btnDraftCancel" className="btn quiet" onClick={close}>
            {t('cancel')}
          </button>
        </div>
      </Modal>
    );
  }
  const creating = step === 'prompt';
  return (
    <Modal
      open
      onClose={close}
      title={t('draftTitle')}
      id="aiDialog"
      testId="ai-draft-dialog"
      className="action-dialog ai-review-dialog"
    >
      <div className="ai-dialog-inner">
        <p>{t('draftIntro')}</p>
        <div className="ai-flow-tabs" role="group" aria-label="AI-työn vaiheet">
          <button
            id="btnAIFlowPrompt"
            type="button"
            className={creating ? 'active' : ''}
            aria-pressed={creating}
            onClick={() => setStep('prompt')}
          >
            {t('aiDraftStepRequest')}
          </button>
          <button
            id="btnAIFlowImport"
            type="button"
            className={creating ? '' : 'active'}
            aria-pressed={!creating}
            onClick={() => setStep('import')}
          >
            {t('aiDraftStepImport')}
          </button>
        </div>
        <section id="aiDraftPromptStep" className="ai-flow-step" hidden={!creating}>
          <p className="inspector-note">{t('aiDraftStepHelp')}</p>
          <label htmlFor="aiMode">{t('draftMode')}</label>
          <select id="aiMode" value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
            <option value="argument">{t('modeArgument')}</option>
            <option value="decision">{t('modeDecision')}</option>
          </select>
          <label htmlFor="aiTopic">{t('aiTopicLabel')}</label>
          <textarea
            id="aiTopic"
            maxLength={5000}
            rows={2}
            placeholder={t('aiTopicPlaceholder')}
            value={topic}
            onChange={(e) => {
              lastTopic = e.target.value;
              setTopic(e.target.value);
            }}
          />
          <label htmlFor="aiContext">{t('draftContext')}</label>
          <textarea
            id="aiContext"
            maxLength={50000}
            rows={5}
            placeholder={t('draftContextPlaceholder')}
            value={context}
            onChange={(e) => {
              lastContext = e.target.value;
              setContext(e.target.value);
            }}
          />
          <p className="ai-task-choice-hint">{t('aiTaskChoiceHint')}</p>
          <div className="dialog-actions ai-actions ai-task-actions">
            <button type="button" id="btnAICopy" className="btn primary" onClick={() => void copyTask()}>
              {t('aiTaskCopy')}
            </button>
            <button
              type="button"
              id="btnAIDownloadPrompt"
              className="btn quiet"
              onClick={() => {
                downloadText('witt-ai-uusi-puu-tehtava.txt', task, 'text/plain;charset=utf-8');
                setTaskStatus(t('aiTaskDownloaded'));
              }}
            >
              {t('aiTaskDownloadSame')}
            </button>
          </div>
          <p id="aiDraftTaskStatus" className="ai-task-status" role="status" aria-live="polite">
            {taskStatus}
          </p>
          <details id="aiDraftPromptPreviewDetails" className="ai-task-detail" ref={previewDetails}>
            <summary>{t('aiTaskPreview')}</summary>
            <textarea
              id="aiPromptPreview"
              ref={previewArea}
              readOnly
              rows={9}
              style={{ width: '100%' }}
              aria-label="AI-tehtävän koko sisältö"
              value={task}
            />
          </details>
          <details id="aiDraftAdvanced" className="ai-task-detail ai-task-advanced">
            <summary>{t('aiTaskAdvanced')}</summary>
            <p>{t('aiTaskSchemaIncluded')}</p>
            <button
              type="button"
              id="btnAIDownloadSchema"
              className="btn quiet"
              onClick={() =>
                downloadText('witt-ai-draft-v2.schema.json', JSON.stringify(DRAFT_SCHEMA, null, 2) + '\n')
              }
            >
              {t('aiTaskDownloadSchema')}
            </button>
          </details>
          <div className="dialog-actions">
            <button
              type="button"
              id="btnAIToImport"
              className="btn primary"
              onClick={() => setStep('import')}
            >
              {t('aiDraftStepImport')}
            </button>
          </div>
        </section>
        <section id="aiDraftImportStep" className="ai-flow-step" hidden={creating}>
          <p className="inspector-note">{t('aiDraftImportHelp')}</p>
          <label htmlFor="aiDraftPaste">{t('draftResponsePaste')}</label>
          <textarea
            id="aiDraftPaste"
            rows={3}
            placeholder='{ "format": "witt-ai-draft-v2", ... }'
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
          />
          <input
            id="aiDraftInput"
            type="file"
            className="visually-hidden"
            accept="application/json,.json,.witt.json"
            ref={fileInput}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void chooseFile(file);
            }}
          />
          <div className="dialog-actions">
            <button
              type="button"
              id="btnAIImport"
              className="btn quiet"
              onClick={() => fileInput.current?.click()}
            >
              {t('draftChooseFile')}
            </button>
            <button
              type="button"
              id="btnAIShowPreview"
              className="btn primary"
              onClick={() => previewDraft(paste)}
            >
              {t('previewChanges')}
            </button>
          </div>
          <p id="aiStatus" role="status" aria-live="polite">
            {status}
          </p>
          <div className="dialog-actions">
            <button type="button" className="btn quiet" id="btnAIToPrompt" onClick={() => setStep('prompt')}>
              {t('aiBackToPrompt')}
            </button>
          </div>
        </section>
      </div>
    </Modal>
  );
}
