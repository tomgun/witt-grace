/* WITT / GRACE Method browser UI – no dependencies, no telemetry, no network calls.
 * This is a functioning local-first prototype. Future React Flow UI can reuse
 * the domain concepts and .witt.json format.
 */
(function () {
  'use strict';
  const Core = globalThis.WittCore;
  const Layout = globalThis.WittViewLayout;
  const I18n = globalThis.WittI18n;
  const Keyboard = globalThis.WittKeyboard;
  const History = globalThis.WittHistory;
  const Table = globalThis.WittTableModel;
  const Examples = globalThis.WittExamples;
  const Lens = globalThis.WittReviewLens;
  const Workspace = globalThis.WittWorkspace;
  const AIStarter = globalThis.WittAIStarter;
  const AIRoundtrip = globalThis.WittAIRoundtrip;
  const AIDraft = globalThis.WittAIDraftV2;
  const Contributions = globalThis.WittContributions;
  const Library = globalThis.WittDocumentLibrary;
  const DiagramExport = globalThis.WittDiagramExport;
  const AssessorView = globalThis.WittAssessorView;
  const ImportValidation = globalThis.WittImportValidation;
  const ProjectImportSchema = globalThis.WittProjectImportSchema;
  if (!Core || !Layout || !I18n || !Keyboard || !History || !Table || !Examples || !Lens || !Workspace || !AIStarter || !AIDraft || !Contributions || !DiagramExport || !AssessorView || !ImportValidation || !ProjectImportSchema) throw Error('WITT modules are missing');
  // Some embedded previews have an opaque origin and deny persistent browser
  // storage. Keep the editor usable for this tab, but warn that reload loses
  // everything and never describe the ephemeral fallback as an autosave.
  const storageState = (() => {
    try {
      const candidate = window.localStorage;
      const probe = '__witt_storage_probe_' + Math.random().toString(36).slice(2);
      candidate.setItem(probe, 'ok');
      candidate.removeItem(probe);
      return { storage: candidate, temporary: false };
    } catch (_) {
      const values = new Map();
      return { temporary: true, storage: {
        getItem: key => values.has(key) ? values.get(key) : null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: key => values.delete(key),
        clear: () => values.clear()
      }};
    }
  })();
  const storage = storageState.storage;
  const t = (key, params) => I18n.t(key, params);
  let locale = I18n.getLocale();
  let focusOnly = false;
  const $ = id => document.getElementById(id);
  const STORAGE = 'witt-project-v3';
  const VIEW_STORAGE = 'witt-view-v1';
  // Appearance is separate from argument content. Additional visual-only skins
  // stay in this browser, while the current v5 document stores the base theme.
  const APPEARANCE_STORAGE = 'witt-appearance-v1';
  const APPEARANCES = ['light','dark','paper','cosmos','hologram','manuscript-book','manuscript-pen','bitberg'];
  let specialAppearance = null;
  try {
    const oldAppearance = storage.getItem(APPEARANCE_STORAGE);
    const savedAppearance = oldAppearance==='studio-daw'?'bitberg':oldAppearance;
    if (['cosmos','hologram','manuscript-book','manuscript-pen','bitberg'].includes(savedAppearance)) specialAppearance = savedAppearance;
  } catch (_) { /* Appearance choice remains usable even with blocked storage. */ }
  const effectiveAppearance = () => specialAppearance || project.theme;
  function changeAppearance(next) {
    if (!APPEARANCES.includes(next)) return;
    if (['cosmos','hologram','manuscript-book','manuscript-pen','bitberg'].includes(next)) {
      specialAppearance = next;
      try { storage.setItem(APPEARANCE_STORAGE, next); } catch (_) { /* optional */ }
      render();
    } else {
      specialAppearance = null;
      try { storage.removeItem(APPEARANCE_STORAGE); } catch (_) { /* optional */ }
      if (project.theme !== next) mutation(() => { project.theme = next; });
      else render();
    }
  }
  const CARD_W = 252;
  let project;
  let actorId;
  let selectedId;
  let scores = new Map();
  let personalScores = new Map();
  let importantNodeIds = new Set();
  let importanceEffects = new Map();
  let leadingOptionIds = new Set();
  // The displayed assessor is independent of the active editing identity.
  function viewedAssessorId() {
    return view.indexMode==='personal' && project?.users.some(u=>u.id===view.viewAssessorId)
      ? view.viewAssessorId : actorId;
  }
  function viewedAssessor() { return project.users.find(u=>u.id===viewedAssessorId()); }
  function choosePerspective(id) {
    if(id==='shared') { view.indexMode='shared';view.viewAssessorId=null; }
    else if(id==='personal') { view.indexMode='personal';view.viewAssessorId=null; }
    else if(id.startsWith('assessor:') && project.users.some(u=>u.id===id.slice(9))) {
      view.indexMode='personal';view.viewAssessorId=id.slice(9);
    } else return;
    saveView();render();
  }
  function selectedPerspective(){
    return view.indexMode==='shared'?'shared':view.viewAssessorId&&view.viewAssessorId!==actorId?'assessor:'+view.viewAssessorId:'personal';
  }
  function updateLeadingOptions(){
    leadingOptionIds=new Set();
    if(!view.highlightOptions||project.mode!=='decision'||view.indexMode!=='personal')return;
    const report=AssessorView.summary(project,Core,viewedAssessorId());
    leadingOptionIds=new Set(report.leadingIds);
  }
  const shownScore = id => view.indexMode==='personal' ? personalScores.get(id) : scores.get(id);
  // A terminal claim's internal score equals its entered credence by design.
  // It is NOT a separate derived result: do not label that same number twice.
  function derivedResult(node, result) {
    return Core.indexAssessable(node) && result?.score!=null &&
      (result.contributions||[]).some(item=>!item.missing);
  }
  // UI and all visual exports share the same signed -100..+100 argument scale.
  // 50 in the internal evidence evaluator corresponds exactly to visible 0.
  function balanceText(internal, digits=1) {
    const value=Core.argumentBalance(internal);
    if(value===null)return '—';
    const rounded=Number(value.toFixed(digits));
    return (rounded>0?'+':'')+rounded.toFixed(digits);
  }
  function balanceDeltaText(internalDelta, digits=1) {
    if(!Number.isFinite(internalDelta))return '—';
    const rounded=Number((2*internalDelta).toFixed(digits));
    return (rounded>0?'+':'')+rounded.toFixed(digits);
  }
  const resultText = (node, result, digits=1) => derivedResult(node,result)
    ? balanceText(result.score,digits)+(result.incomplete?' †':'') : '—';
  function shownInfluence(node) {
    if (!node.parentId || ['option','group'].includes(node.relation)) return null;
    if (view.indexMode==='personal') {
      if(node.sharedReasonId)return Core.sharedReason(project,node.sharedReasonId)?.influence ?? null;
      const personal=Core.personalInfluence(project,'primary',node.id,viewedAssessorId());
      return personal.current?personal.record.influence:null;
    }
    // Show the signed, correctly weighted consensus USED in the parent score;
    // not the authored structural magnitude, and never invent absent reviews.
    const edge=scores.get(node.parentId)?.contributions?.find(item=>item.id===node.id);
    return edge && !edge.missing && Number.isFinite(edge.impact) ? edge.impact : null;
  }
  function displayedPrimaryRelation(node) {
    if (!node.parentId || ['option','group'].includes(node.relation)) return node.relation;
    // Collective and personal views use their own signed impact. In the absence
    // of a current review, the authored +/- template remains a proposal.
    return Core.directionFromInfluence(shownInfluence(node),node.relation);
  }
  // Assessments describe a claim's own assessed credence and its exact parent
  // relation. They are not the recursive argument balance of the subtree.
  // Use the same actual, weighted values as evaluate() rather than the
  // unweighted diagnostic influenceSummary() or authored placeholder values.
  function nodeAssessmentSnapshot(node) {
    const fields=Core.assessmentFields(node);
    if (!fields.credence && !fields.impact) return null;
    const personal=view.indexMode==='personal';
    const mode=Core.assessmentWeighting(project);
    const shared=node.sharedReasonId?Core.sharedReason(project,node.sharedReasonId):null;
    const filtered=!personal && lens?.filtered && !shared;
    const review=personal?Core.personalCredence(project,node.id,viewedAssessorId()):null;
    const aggregated=personal?null:Core.getBaseConfidence(project,node);
    const credence=!fields.credence?null:shared?shared.confidence:personal?review?.confidence??null:filtered?null:aggregated?.base??null;
    const impact=!fields.impact?null:shared?shared.influence:filtered?null:shownInfluence(node);
    const averaging=!personal && mode!=='structural' && !shared;
    const provenance=shared?t('assessmentSummaryFixed')
      : personal ? t('assessmentSummaryPersonal',{name:viewedAssessor()?.name||''})
      : filtered ? t('assessmentSummaryFiltered')
      : mode==='shares'?t('assessmentSummaryWeighted')
      : mode==='equal'?t('assessmentSummaryMean')
      : t('assessmentSummaryStructural');
    const fmt=num=>Number.isInteger(num)?String(num):Number(num.toFixed(1)).toString();
    // The unreviewed main thesis requires no own credence vote. Do not put
    // a spurious '— Arviot' chip beside its valid evidence-derived balance.
    if(node.parentId===null && node.kind==='claim' && !shared && mode!=='structural' &&
       (personal?!review:aggregated?.votesCount===0)) return null;
    const p=credence===null?'—':fmt(credence)+'%';
    const w=impact===null?'—':signed(Number(impact.toFixed(1)));
    const value=fields.impact ? `${p}/${w}` : p;
    return {value,provenance,averaging,filtered,credence,impact};
  }
  function recalculateImportance(){
    importantNodeIds = new Set();
    importanceEffects = new Map();
    // A filtered collective review lens suppresses the shared index. Do not
    // label an unfiltered numerical calculation as if the subset produced it.
    if (view.indexMode==='shared' && lens?.filtered) return;
    const evaluated = view.indexMode==='personal' ? personalScores : scores;
    const localEffects = Core.marginalIndexEffects(project, evaluated);
    importanceEffects = Core.marginalTargetEffects(project, evaluated, localEffects);
    if (!view.showImportance) return;
    // Each decision option is its own argument. Rank within its branch,
    // rather than letting one large branch suppress all other options.
    const byTarget = new Map();
    for (const item of importanceEffects.values()) {
      if (item.magnitude<=1e-9) continue;
      if (!byTarget.has(item.targetId)) byTarget.set(item.targetId, []);
      byTarget.get(item.targetId).push(item);
    }
    for (const candidates of byTarget.values()) {
      candidates.sort((a,b)=>b.magnitude-a.magnitude||a.childId.localeCompare(b.childId));
      for (const item of candidates.slice(0,Math.ceil(candidates.length*.2)))
        importantNodeIds.add(item.sourceId||item.childId);
    }
  }
  function importanceText(effect) {
    return t('importanceTargetChange', {change: balanceDeltaText(effect.delta,2)});
  }
  function importanceShort(effect) {
    return balanceDeltaText(effect.delta,1)+' p';
  }
  function importanceHint(effect) {
    const target=project.nodes.find(n=>n.id===effect.targetId);
    const parent=project.nodes.find(n=>n.id===effect.parentId);
    const main=t('importanceTargetWhatIf', {target:target?.title||'',
      without:balanceText(effect.targetWithoutScore), current:balanceText(effect.targetCurrentScore),
      change:balanceDeltaText(effect.delta,2)});
    const local=t('importanceWhatIf', {parent:parent?.title||'',
      without:balanceText(effect.localWithoutScore), current:balanceText(effect.localCurrentScore),
      change:balanceDeltaText(effect.localDelta,2)});
    return main+' | '+local+(effect.provisional?' '+t('importanceProvisional'):'');
  }
  let projection;
  const tableState = { query: '', stance: 'all', expandedId: null };
  let lens = null;
  let reviewIds = null; // null = all; only view data, never exported or used for ballots
  let tutorial = null;
  let tutorialPosition = null; // draggable help; never part of the argument document
  let tableRevealId = null; // temporary view-only reveal of a closed path from table
  const explicitlyClosedIds = new Set(); // user collapse wins over temporary peeks
  const depthOverrides = new Map(); // view-only subtree exceptions during depth playback
  const ballotDrafts = new Map(); // edits not yet submitted, survive vote-dialog redraws
  let nodePositions = new Map();
  let nodeDirections = new Map();
  const LAYER_PRESETS = {
    text: { labels: false, details: false, index: false, assessments: false, confidence: false, impact: false, comments: false, counts: false, links: false },
    analysis: { labels: true, details: true, index: true, assessments: true, confidence: false, impact: false, comments: true, counts: true, links: false },
    all: { labels: true, details: true, index: true, assessments: false, confidence: true, impact: true, comments: true, counts: true, links: true }
  };
  const LAYER_NAMES = Object.keys(LAYER_PRESETS.all);
  const ZONE_STORAGE='witt-zones-v1';
  function loadZones(){
    const mobile=typeof window!=='undefined'&&window.innerWidth<=1000;
    try{const v=JSON.parse(storage.getItem(ZONE_STORAGE)||'null');if(v&&typeof v==='object')
      return Object.fromEntries(['left','top','right','bottom'].map(k=>[k,typeof v[k]==='boolean'?v[k]:k==='bottom'?false:k==='left'?!mobile:true]));}
    catch(_){}
    return {left:!mobile,top:true,right:true,bottom:false};
  }
  const zones=loadZones();
  function applyZones(){
    for(const key of ['left','top','right','bottom']){
      document.body.classList.toggle(`zone-${key}-hidden`,!zones[key]);
      document.body.classList.toggle(`zone-${key}-visible`,zones[key]);
      const button=$('btnZone'+key[0].toUpperCase()+key.slice(1));
      button.setAttribute('aria-pressed',String(zones[key]));button.classList.toggle('active',zones[key]);
    }
    $('bottomZone').hidden=!zones.bottom;
    if(project){const node=project.nodes.find(n=>n.id===selectedId);
      $('bottomSelectedNode').textContent=node?.title||'';
      for(const id of ['btnEditMenuMove','btnEditMenuDelete','btnBottomMove','btnBottomDelete'])$(id).disabled=!node?.parentId||!canEdit();
      for(const id of ['btnEditMenuSupport','btnEditMenuOppose','btnEditMenuNeutral','btnBottomSupport','btnBottomOppose','btnBottomNeutral'])$(id).disabled=!canEdit()||node?.kind==='group';
      $('btnEditMenuOption').hidden=project.mode!=='decision';
      $('btnEditMenuOption').disabled=!canEdit()||project.votingRound?.status==='open';
      $('btnEditMenuCollapse').disabled=!node||!Core.childrenOf(project,node.id).length;
      $('btnEditMenuCollapse').textContent=t(node&&isNodeCollapsed(node)?'expandSubtree':'collapseSubtree');
    }
  }
  function toggleZone(key){zones[key]=!zones[key];try{storage.setItem(ZONE_STORAGE,JSON.stringify(zones));}catch(_){}
    applyZones();if(project&&view.presentation==='tree')requestAnimationFrame(cameraApply);
  }
  function loadView() {
    let saved = {};
    try { saved = JSON.parse(storage.getItem(VIEW_STORAGE)) || {}; } catch (_) { /* optional UI preferences */ }
    const layers = { ...LAYER_PRESETS.text };
    for (const key of LAYER_NAMES) if (typeof saved.layers?.[key] === 'boolean') layers[key] = saved.layers[key];
    return { presentation: saved.presentation === 'table' ? 'table' : saved.presentation === 'tree' ? 'tree' : (typeof window!=='undefined'&&window.innerWidth<=600?'table':'tree'), orientation: Layout.ORIENTATIONS.includes(saved.orientation) ? saved.orientation : 'horizontal', workflow: ['explore', 'evaluate'].includes(saved.workflow) ? saved.workflow : 'explore', layers, focus: { mode: ['all', 'support', 'oppose'].includes(saved.focus?.mode) ? saved.focus.mode : 'all',
      anchorId: typeof saved.focus?.anchorId === 'string' ? saved.focus.anchorId : null }, layersOpen: false, dockCollapsed: typeof saved.dockCollapsed==='boolean' ? saved.dockCollapsed : true, dockHidden:saved.dockHidden===undefined?true:saved.dockHidden===true, dockScreenPosition:saved.dockScreenPosition&&Number.isFinite(saved.dockScreenPosition.x)&&Number.isFinite(saved.dockScreenPosition.y)?{x:saved.dockScreenPosition.x,y:saved.dockScreenPosition.y}:null, fourWayOffsets: {}, indexMode:saved.indexMode==='personal'?'personal':'shared',viewAssessorId:typeof saved.viewAssessorId==='string'?saved.viewAssessorId:null,highlightOptions:!!saved.highlightOptions, showImportance:!!saved.showImportance,showSharedReasons:saved.showSharedReasons!==false,showRecurringInTree:saved.showRecurringInTree!==false,dragFromText:saved.dragFromText!==false,compactVisible:!!saved.compactVisible,depthLimit:Number.isInteger(saved.depthLimit)&&saved.depthLimit>=0?saved.depthLimit:null,depthCompact:saved.depthCompact!==false };
  }
  let view = loadView();
  // v5 four-way offsets belong to the document. Browser view preferences
  // affect presentation only and never replace saved document layout.
  function saveView() {
    try { storage.setItem(VIEW_STORAGE, JSON.stringify({ presentation: view.presentation, orientation: view.orientation, workflow: view.workflow, layers: view.layers, focus: view.focus, dockCollapsed:view.dockCollapsed,dockHidden:view.dockHidden,dockScreenPosition:view.dockScreenPosition, indexMode:view.indexMode,viewAssessorId:view.viewAssessorId,highlightOptions:view.highlightOptions, showImportance:view.showImportance, showSharedReasons:view.showSharedReasons,showRecurringInTree:view.showRecurringInTree,dragFromText:view.dragFromText,compactVisible:view.compactVisible,depthLimit:view.depthLimit,depthCompact:view.depthCompact })); }
    catch (_) { /* project import/export is unaffected by UI preference storage */ }
    // Version 5 stores manual four-way placement in project.layout, not browser prefs.
  }
  function currentPreset() {
    return Object.entries(LAYER_PRESETS).find(([, layers]) => LAYER_NAMES.every(key => layers[key] === view.layers[key]))?.[0] || 'custom';
  }
  function cardHeight() {
    const l = view.layers;
    const density = ['index', 'assessments', 'confidence', 'impact', 'comments', 'counts', 'links'].filter(key => l[key]).length;
    if (!l.labels && !l.details && density === 0) return 94;
    if (density <= 2 && !l.assessments && !l.confidence && !l.impact && !l.comments) return 154;
    return 176;
  }
  let camera = { x: 80, y: 80, scale: 0.82 };
  const history = History.createHistory(60);
  const snapshot = () => History.snapshot(project, view.fourWayOffsets, explicitlyClosedIds);
  let contextNodeId = null;
  let selectedLibraryReason=null;
  let repeatPaneOpen=false;
  let draggingLibraryReason=null;
  let moveNodeId = null;
  let linkNodeId = null;
  let inlineEditorActive = false;
  let inspectorAdvancedOpen = false;
  const SHORTCUT_STORAGE = 'witt-keybindings-v1';
  const SHORTCUT_DEFAULTS = Object.freeze({
    support:'+', oppose:'-', option:'*', table:'T', focus:'F', assessment:'R', help:'?', arrange:'Alt+A'
  });
  const SHORTCUT_CHOICES = ['+','-','*','Ctrl+Enter','Ctrl+Shift+Enter','Ctrl+Alt+Enter','Alt+1','Alt+2','Alt+3','Alt+4','Alt+5','Alt+6','Alt+A','Alt+F','Alt+H','Alt+R','Alt+T','F','H','R','T','?'];
  const SHORTCUT_LABELS = {support:'supportAdd',oppose:'opposeAdd',option:'optionAdd',table:'tableView',focus:'focusTree',assessment:'assessmentStart',help:'shortcutsButton',arrange:'arrange'};
  let shortcuts = {...SHORTCUT_DEFAULTS};
  try {
    const candidate = {...SHORTCUT_DEFAULTS,...JSON.parse(storage.getItem(SHORTCUT_STORAGE) || '{}')};
    // Upgrade the unchanged v0.10 defaults, not deliberate custom mappings.
    const oldDefaults = {support:'Ctrl+Enter', oppose:'Ctrl+Shift+Enter', table:'T', focus:'F', assessment:'R', help:'?', arrange:'Alt+A'};
    const raw = JSON.parse(storage.getItem(SHORTCUT_STORAGE) || 'null');
    if (raw && Object.keys(oldDefaults).every(k => raw[k] === oldDefaults[k])) {
      candidate.support = '+';
      candidate.oppose = '-';
    }
    const values = Object.values(candidate);
    if (Object.keys(SHORTCUT_DEFAULTS).every(k=>SHORTCUT_CHOICES.includes(candidate[k])) && new Set(values).size===values.length)
      shortcuts = candidate;
  } catch (_) { /* storage is optional */ }
  function shortcutEventName(event) {
    if (event.key === 'Control' || event.key === 'Meta' || event.key === 'Alt' || event.key === 'Shift') return '';
    const modifiers = [];
    if (event.ctrlKey || event.metaKey) modifiers.push('Ctrl');
    if (event.altKey) modifiers.push('Alt');
    if (event.shiftKey && event.key.length > 1) modifiers.push('Shift');
    const key = event.key.length === 1 && event.key !== '?' ? event.key.toUpperCase() : event.key;
    modifiers.push(key);
    return modifiers.join('+');
  }
  function shortcutFor(event) {
    const key = shortcutEventName(event);
    return Object.keys(shortcuts).find(action=>shortcuts[action]===key) || null;
  }
  const displayShortcut = key => key ? key.replaceAll('Ctrl','Ctrl/Cmd') : '';
  function updateShortcutHelpText() {
    const current = $('shortcutCurrentAdd');
    if (current) current.textContent = t('shortcutCurrentAdd', {
      support: displayShortcut(shortcuts.support), oppose: displayShortcut(shortcuts.oppose)
    });
  }
  function renderShortcutSettings() {
    const area=$('shortcutSettings'); area.replaceChildren();
    for(const [action, translation] of Object.entries(SHORTCUT_LABELS)) {
      const id='shortcut-'+action;
      const label=el('label','',t(translation));label.htmlFor=id;
      const select=el('select');select.id=id;select.setAttribute('aria-label',t(translation));
      for(const choice of SHORTCUT_CHOICES) {
        const option=el('option','',choice.replaceAll('Ctrl','Ctrl/Cmd'));
        option.value=choice;select.append(option);
      }
      select.value=shortcuts[action];
      select.onchange=()=>{
        const next={...shortcuts,[action]:select.value};
        if(new Set(Object.values(next)).size!==Object.values(next).length) {
          $('shortcutSettingsStatus').textContent=t('shortcutConflict');select.value=shortcuts[action];return;
        }
        shortcuts=next;
        try {storage.setItem(SHORTCUT_STORAGE,JSON.stringify(shortcuts));}catch (_){}
        $('shortcutSettingsStatus').textContent=t('shortcutSaved');
        updateShortcutTitles();
        updateShortcutHelpText();
      };
      area.append(label,select);
    }
  }
  function updateShortcutTitles() {
    $('btnAssess').title=t('assessmentStart')+' ('+displayShortcut(shortcuts.assessment)+')';
    $('btnFocusView').title=shortcuts.focus;
    $('btnTreeView').title=shortcuts.table;
    $('btnTableView').title=shortcuts.table;
    $('btnLayout').title=t('arrange')+' ('+shortcuts.arrange+')';
    $('assessmentShortcutHint').textContent=displayShortcut(shortcuts.assessment);
    $('focusShortcutHint').textContent=displayShortcut(shortcuts.focus);
    $('helpShortcutHint').textContent=displayShortcut(shortcuts.help);
    $('btnKeyboardTop').title=t('shortcutsButton')+' ('+shortcuts.help+')';
    updateShortcutHelpText();
  }
  function openShortcutHelp() { renderShortcutSettings();updateShortcutHelpText();$('shortcutSettingsStatus').textContent='';$('helpDialog').showModal(); }
  const ASSESSMENT_PREFIX = 'witt-assessment-pass-v2:';
  const PROFILE_PREFIX = 'witt-assessor-v1:';
  let assessment = { order: [], done: new Set(), cursorId: null, finished: false };
  // Native <dialog> works in embedded previews where window.confirm/alert are blocked.
  // All messages use textContent: imported claim text is never parsed as HTML.
  async function askConfirm(message, buttonLabel = t('confirmContinue')) {
    const dialog = $('confirmDialog');
    $('confirmText').textContent = message;
    $('confirmAccept').textContent = buttonLabel;
    dialog.returnValue = 'cancel';
    const outcome = new Promise(resolve => {
      dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true });
    });
    dialog.showModal();
    $('confirmCancel').focus();
    return outcome;
  }
  async function askText(message, heading=t('textDialogGeneric'),action=t('confirmContinue')) {
    const dialog = $('textDialog');
    $('textPrompt').textContent = message;
    $('textDialogTitle').textContent = heading;
    $('textAccept').textContent = action;
    $('textValue').value = '';
    dialog.returnValue = 'cancel';
    const outcome = new Promise(resolve => {
      dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm' ? $('textValue').value : null), { once: true });
    });
    dialog.showModal();
    $('textValue').focus();
    return outcome;
  }
  function showMessage(message) {
    $('noticeText').textContent = message;
    if (!$('noticeDialog').open) $('noticeDialog').showModal();
    $('noticeClose').focus();
  }
  function chooseFile() {
    const input = $('fileInput');
    input.value = ''; // selecting the same file again must work
    try {
      if (typeof input.showPicker === 'function') input.showPicker();
      else input.click();
    } catch (_) {
      // showPicker can be blocked in cross-origin embedded contexts.
      input.click();
    }
  }
  const el = (tag, className, content) => {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (content !== undefined) e.textContent = String(content);
    return e;
  };

  /* IndexedDB library is explicitly saved, not a side effect of autosave.
   * Revisions guard against stale tabs; browser storage is not a backup. */
  let libraryRepo=null,libraryOpenPromise=null,libraryFailure=null;
  const knownLibraryRevisions=new Map();
  function initLibrary(){
    if(libraryOpenPromise)return libraryOpenPromise;
    if(!Library){libraryFailure=Error('Kirjastomoduulia ei ladattu');return Promise.resolve(null);}
    libraryOpenPromise=Library.open().then(async repo=>{
      libraryRepo=repo;
      const prior=await repo.get(project.id);
      if(prior && JSON.stringify(prior.document)===JSON.stringify(project)) knownLibraryRevisions.set(project.id,prior.revision);
      return repo;
    }).catch(err=>{libraryFailure=err;console.warn('WITT IndexedDB unavailable',err);return null;});
    return libraryOpenPromise;
  }
  function libraryWarning(message){
    if ($('libraryStatus')) $('libraryStatus').textContent=message;
    if ($('saveStatus')) $('saveStatus').textContent=message;
  }
  async function saveCurrentToLibrary(){
    const repo=await initLibrary();
    if(!repo) {showMessage(t('libraryUnavailable'));return false;}
    try {
      const safe=Core.validateProject(project);
      const known=knownLibraryRevisions.get(safe.id);
      if(known===undefined){
        const existing=await repo.get(safe.id);
        if(existing) {
          // Imported documents can share an ID with a library copy. Never
          // overwrite an unrecognized revision without explicit approval.
          if(!await askConfirm(t('libraryOverwriteConfirm',{title:safe.title})))return false;
          knownLibraryRevisions.set(safe.id,existing.revision);
        }
      }
      const revision=knownLibraryRevisions.get(safe.id)||null;
      const result=await repo.put(safe,revision);
      knownLibraryRevisions.set(safe.id,result.revision);
      return true;
    } catch(error) {
      showMessage(t('librarySaveFailed')+' ('+error.message+')');return false;
    }
  }
  async function libraryRows(){
    const target=$('libraryList');target.replaceChildren();
    const repo=await initLibrary();
    if(!repo){$('libraryStatus').textContent=`${t('libraryUnavailable')}: ${libraryFailure?.message||'IndexedDB'}`;return;}
    let rows;
    try{rows=await repo.list();}catch(err){$('libraryStatus').textContent=err.message;return;}
    $('libraryStatus').textContent=`${rows.length} ${t('librarySavedCount')}`;
    for(const row of rows){
      const item=el('div','library-entry');item.setAttribute('role','listitem');
      const title=el('div','library-title');
      title.append(el('strong','',row.title+(row.id===project.id?' · '+t('libraryCurrent'):'')),
        el('small','',`${row.nodeCount} ${t('exampleClaims')} · ${formatWorkspaceTime(row.savedAt)} · v${row.revision}`));
      const actions=el('div','library-actions');
      const action=(label,handler)=>{const button=el('button','btn quiet',label);button.type='button';button.onclick=handler;actions.append(button);};
      action(t('libraryOpen'),async()=>{
        try {
          const fresh=await repo.get(row.id);if(!fresh)throw Error(t('libraryMissing'));
          const next=Core.validateProject(fresh.document);
          if(!await prepareReplacement(t('importConfirm',{title:next.title})))return;
          const oldRevision=knownLibraryRevisions.get(next.id);
          knownLibraryRevisions.set(next.id,fresh.revision);
          if(!replaceProject(next)) {if(oldRevision===undefined)knownLibraryRevisions.delete(next.id);else knownLibraryRevisions.set(next.id,oldRevision);return;}
          $('libraryDialog').close();enterEditor();
        }catch(err){$('libraryStatus').textContent=err.message;}
      });
      action(t('libraryRename'),async()=>{
        const value=await askText(t('libraryRenamePrompt'),t('libraryRename'),t('libraryRename'));
        if(!value?.trim())return;
        try{
          const fresh=await repo.get(row.id);if(!fresh)throw Error(t('libraryMissing'));
          if(fresh.revision!==row.revision)throw Error(t('libraryConflict'));
          if(row.id===project.id){
            mutation(()=>{project.title=value.trim();});
            if(!await saveCurrentToLibrary())return;
          } else {
            const updated=Core.validateProject({...fresh.document,title:value.trim(),updatedAt:new Date().toISOString()});
            await repo.put(updated,fresh.revision);
          }
          await libraryRows();
        }catch(err){$('libraryStatus').textContent=err.message;}
      });
      action(t('libraryDuplicate'),async()=>{
        try{
          const fresh=await repo.get(row.id);if(!fresh)throw Error(t('libraryMissing'));
          const copy=Core.validateProject(fresh.document);
          copy.id=Core.uid();copy.title=copy.title+' '+t('libraryCopySuffix');
          copy.createdAt=new Date().toISOString();copy.updatedAt=copy.createdAt;
          await repo.put(Core.validateProject(copy),null);
          await libraryRows();
        }catch(err){$('libraryStatus').textContent=err.message;}
      });
      if(row.id!==project.id)action(t('libraryDelete'),async()=>{
        if(!await askConfirm(t('libraryDeleteConfirm',{title:row.title}),t('libraryDelete')))return;
        try{await repo.remove(row.id,row.revision);knownLibraryRevisions.delete(row.id);await libraryRows();}
        catch(err){$('libraryStatus').textContent=err.message;}
      });
      item.append(title,actions);target.append(item);
    }
    if(!rows.length)target.append(el('p','inline-warning',t('libraryEmpty')));
  }
  async function openLibrary(){
    $('libraryDialog').showModal();
    $('libraryStatus').textContent=t('libraryLoading');
    await libraryRows();
  }
  let hydrationFailed = false;
  function hydrate() {
    try {
      const active = Workspace.rawActive(storage);
      if (active) return Core.validateProject(JSON.parse(active.raw));
    } catch (error) {
      hydrationFailed = true;
      console.warn('WITT local recovery failed; original browser data remains untouched', error);
    }
    return Core.createDemoProject();
  }
  function persist(label = t('savedBrowser')) {
    try {
      Workspace.persist(storage, project);
      hydrationFailed = false;
      $('saveStatus').textContent = storageState.temporary ? t('sessionOnlyStatus') : label;
      return true;
    } catch (error) {
      $('saveStatus').textContent = t('saveFailed');
      console.warn(error);
      return false;
    }
  }
  // A single active draft is autosaved. Replacing it is a conscious action:
  // discard, or explicitly save a snapshot to the document library first.
  // No document history is created. The user explicitly chooses whether
  // to discard or save the current document in the library.
  async function prepareReplacement(confirmText) {
    if (!hasSavedWork()) return true;
    const dialog=$('replaceDialog');
    $('replaceDescription').textContent=confirmText;
    const active=Workspace.activeSummary(storage,project,storageState.temporary);
    $('replaceCurrentName').textContent=active.title||t('homeTimeUnknown');
    $('replaceCurrentInfo').textContent=[active.mode?t(active.mode==='decision'?'modeDecision':'modeArgument'):null,
      active.nodeCount===null?null:t('replaceNodeCount',{count:active.nodeCount})].filter(Boolean).join(' · ');
    $('replaceEditedAt').textContent=formatWorkspaceTime(active.editedAt);
    $('replaceAutosavedAt').textContent=active.sessionOnly?t('replaceSessionOnly'):formatWorkspaceTime(active.browserSavedAt);
    dialog.returnValue='cancel';
    const decision=new Promise(resolve=>dialog.addEventListener('close',()=>resolve(dialog.returnValue),{once:true}));
    dialog.showModal();
    $('replaceCancel').focus();
    const choice=await decision;
    if(choice==='discard')return true;
    if(choice==='save')return await saveCurrentToLibrary();
    return false;
  }
  function reviewSelectionKey() { return `witt-review-view-v1:${project.id}`; }
  function loadReviewSelection() {
    try {
      const saved = JSON.parse(storage.getItem(reviewSelectionKey()) || 'null');
      reviewIds = Array.isArray(saved) ? saved.filter(id => project.users.some(u => u.id === id)) : null;
    } catch (_) { reviewIds = null; }
  }
  function setReviewSelection(next) {
    const valid = next === null ? null : [...new Set(next)].filter(id => project.users.some(u=>u.id===id));
    // A full selection is equivalent to the unfiltered view. Restore the shared
    // index there; subsets must never display it as though it had been recomputed.
    const humans = project.users.filter(u=>!Core.isAIProfile(u)).map(u=>u.id);
    reviewIds = valid === null || (valid.length===humans.length && humans.every(id=>valid.includes(id))) ? null : valid;
    try { storage.setItem(reviewSelectionKey(), JSON.stringify(reviewIds)); } catch (_) { /* optional view state */ }
    render();
  }
  function userProfile() { return project.users.find(u => u.id === actorId) || project.users[0]; }
  function restoreActor() {
    let id = null;
    try { id = storage.getItem(PROFILE_PREFIX + project.id); } catch (_) { /* optional preference */ }
    actorId = project.users.some(u => u.id === id) ? id : project.users[0].id;
  }
  async function addLocalProfile(selectNew) {
    if (!isOwner() || project.users.length >= 100) { showMessage(t('viewerCannotEdit')); return; }
    const name = await askText(t('profileNewPrompt'),t('profileAdd'),t('profileAdd'));
    if (!name?.trim()) return;
    const newId = Core.uid();
    const success = mutation(() => {
      const next = name.trim();
      if (next.length > 120 || project.users.some(u => u.name.toLocaleLowerCase() === next.toLocaleLowerCase())) throw Error(t('profileNameTaken'));
      project.users.push({ id: newId, name: next, shares: 1, role: 'editor' });
    });
    if (success && selectNew) chooseActor(newId);
    if (success && $('peopleDialog').open) renderPeople();
  }
  function chooseActor(id) {
    if (id === '__add_local_user__') {
      // Restore the real identity while the name dialog is open. A special
      // option must never become the active author of an edit or rating.
      for (const selectId of ['actorSelect','actorQuickSelect']) $(selectId).value=actorId;
      if (!isOwner()) { showMessage(t('viewerCannotEdit')); return; }
      if (project.users.length >= 100) { showMessage(t('profileNameTaken')); return; }
      void addLocalProfile(true);
      return;
    }
    if (!project.users.some(u => u.id === id)) return;
    actorId = id;
    try { storage.setItem(PROFILE_PREFIX + project.id, id); } catch (_) { /* optional preference */ }
    render();
  }
  function ownClaimAssessment(nodeId) { return Core.personalCredence(project, nodeId, actorId); }
  function ownPrimaryAssessment(nodeId) { return Core.personalInfluence(project, 'primary', nodeId, actorId); }
  const signed = value => value > 0 ? `+${value}` : String(value);
  function influenceStatusTag(summary) {
    const status = summary?.status;
    const key = status === 'contradictory' ? 'influenceStatusContradictory'
      : status === 'neutral' ? 'influenceStatusNeutral'
      : status === 'mixed-neutral' ? 'influenceStatusMixedNeutral' : null;
    if (!key) return null;
    const badge = el('span', `influence-status influence-status-${status}`, t(key));
    badge.title = t('influenceDistribution', summary);
    badge.setAttribute('aria-label', `${t(key)}. ${badge.title}`);
    return badge;
  }
  function canEdit() { return project.users.find(u => u.id === actorId)?.role !== 'viewer'; }
  function isOwner() { return project.users.find(u => u.id === actorId)?.role === 'owner'; }
  function mutation(operation, { fit = false, afterValidate = null } = {}) {
    if (!canEdit()) { showMessage(t('viewerCannotEdit')); return false; }
    const before = snapshot();
    const oldProject = JSON.stringify(project);
    // If the operation replaces the entire project (e.g. importing a reviewed
    // multi-author proposal), its embedded provenance must win over the active
    // local UI profile. Only tag edits performed in-place by this user.
    const originalReference = project;
    try {
      operation();
      if (project === originalReference) {
        const previous = JSON.parse(oldProject);
        const previousNodes=new Map(previous.nodes.map(n=>[n.id,n]));
        for(const node of project.nodes){const prev=previousNodes.get(node.id);
          if(prev&&['title','details','semanticType','constraintStatus'].some(k=>node[k]!==prev[k]))node.lastEditedBy=actorId;
        }
        const previousLinks=new Set(previous.links.map(l=>l.id));
        for(const link of project.links)if(!previousLinks.has(link.id)&&!link.createdBy)link.createdBy=actorId;
      }
      project = Core.validateProject(project);
      if (afterValidate) { afterValidate(); project = Core.validateProject(project); }
      view.fourWayOffsets=project.layout.fourWayOffsets;
    } catch (error) {
      project = Core.validateProject(History.unpack(before).project);
      showMessage(error.message || t('operationFailed'));
      return false;
    }
    if (JSON.stringify(project) === oldProject) return false;
    project.updatedAt = new Date().toISOString();
    history.record(before, snapshot());
    persist(); render();
    if (fit) requestAnimationFrame(fitViewport);
    return true;
  }
  function replaceProject(next) {
    const validated = Core.validateProject(next);
    try { Workspace.persist(storage, validated); }
    catch (error) { showMessage(t('saveFailed') + ' (' + error.message + ')'); return false; }
    project = validated;
    view.fourWayOffsets=project.layout.fourWayOffsets;
    selectedId = Core.rootNode(project).id;
    tableState.query = ''; tableState.stance = 'all'; tableState.expandedId = null;
    tableRevealId = null;
    selectedLibraryReason=null;
    explicitlyClosedIds.clear();
    view.compactVisible=false; view.depthLimit=null;depthOverrides.clear();ballotDrafts.clear(); // New document starts in manual mode.
    $('tableSearch').value = ''; $('tableFilter').value = 'all';
    restoreActor();
    loadReviewSelection();
    view.focus = { mode: 'all', anchorId: selectedId };
    view.fourWayOffsets=project.layout.fourWayOffsets;
    saveView(); history.reset();
    $('saveStatus').textContent = t(storageState.temporary ? 'sessionOnlyStatus' : 'savedBrowser'); render();
    requestAnimationFrame(fitViewport);
    return true;
  }
  function restore(snapshotData) {
    const state = History.unpack(snapshotData);
    project = Core.validateProject(state.project);
    view.fourWayOffsets = project.layout.fourWayOffsets;
    explicitlyClosedIds.clear();
    for (const id of state.explicitlyClosedIds || []) explicitlyClosedIds.add(id);
    tableRevealId = null;
    if (!project.users.some(u => u.id === actorId)) restoreActor();
    saveView(); persist(); render();
  }
  function undo() {
    const previous = history.undo(snapshot());
    if (previous !== null) restore(previous);
  }
  function redo() {
    const next = history.redo(snapshot());
    if (next !== null) restore(next);
  }
  /* Evaluation walkthrough stores only navigation/completion in this browser.
   * Credence + signed parent influence are actual document changes, included
   * in exported JSON and undo history. Nothing here is a group decision ballot.
   */
  function assessmentStorageKey() { return `${ASSESSMENT_PREFIX}${project.id}:${actorId}`; }
  function assessmentFingerprint(id) {
    const node = project.nodes.find(n => n.id === id);
    if (!node) return null;
    const parent = project.nodes.find(n => n.id === node.parentId);
    const fields=Core.assessmentFields(node);
    const vote = fields.credence ? ownClaimAssessment(id) : null;
    const edge = fields.impact ? ownPrimaryAssessment(id) : null;
    return JSON.stringify([node.title, node.details, node.parentId, parent?.title || '',
      node.relation, vote?.confidence ?? null,
      edge?.current ? edge.record.influence : null, edge?.relation.fingerprint || null]);
  }
  function loadAssessmentPass() {
    const order = Core.assessmentOrder(project);
    let saved = {};
    try { saved = JSON.parse(storage.getItem(assessmentStorageKey()) || '{}'); }
    catch (_) { /* Storage is convenience, never a requirement. */ }
    const allowed = new Set(order);
    const done = new Set(Array.isArray(saved.doneIds) ? saved.doneIds.filter(id => allowed.has(id) && saved.fingerprints?.[id] === assessmentFingerprint(id)) : []);
    const cursorId = allowed.has(saved.cursorId) ? saved.cursorId : order.find(id => !done.has(id)) || order[0] || null;
    assessment = { order, done, cursorId, finished: false };
  }
  function saveAssessmentPass() {
    try { storage.setItem(assessmentStorageKey(), JSON.stringify({ cursorId: assessment.cursorId, doneIds: [...assessment.done],
      fingerprints: Object.fromEntries([...assessment.done].map(id => [id, assessmentFingerprint(id)])) })); }
    catch (_) { /* Local storage may be disabled; data is still exported normally. */ }
  }
  function assessmentRender() {
    const total = assessment.order.length;
    const idx = Math.max(0, assessment.order.indexOf(assessment.cursorId));
    const reviewed = assessment.done.size;
    $('assessmentProgress').max = Math.max(1,total);
    $('assessmentProgress').value = reviewed;
    $('assessmentReviewed').textContent = t('assessmentReviewed', { reviewed, total });
    $('assessmentStep').textContent = assessment.finished ? t('assessmentSummary') : t('assessmentStep', { current:idx+1, total });
    $('assessmentTitle').textContent = t(project.mode === 'decision' ? 'assessmentTitleDecision' : 'assessmentTitle');
    $('assessmentQuestion').hidden = assessment.finished;
    $('assessmentFinish').hidden = !assessment.finished;
    $('btnAssessPrev').disabled = !total || (!assessment.finished && idx === 0);
    $('btnAssessSkip').hidden = assessment.finished;
    $('btnAssessNext').hidden = assessment.finished;
    if (assessment.finished) {
      $('assessmentFinishTitle').textContent = reviewed === total ? t('assessmentCompleted') : t('assessmentIncomplete');
      $('assessmentFinishText').textContent = t('assessmentSummaryDetail', { reviewed, total });
      $('btnAssessUnreviewed').hidden = reviewed === total;
      return;
    }
    const node = project.nodes.find(n => n.id === assessment.cursorId);
    if (!node) return;
    const parent = project.nodes.find(n => n.id === node.parentId);
    const fields = Core.assessmentFields(node);
    const hasEdge = fields.impact;
    $('assessmentContext').textContent = parent
      ? t(parent.kind === 'option' ? 'assessmentParentOption' : parent.kind === 'decision' ? 'assessmentParentDecision' : 'assessmentParent', { parent: parent.title })
      : t('assessmentRoot');
    // Only the target TYPE selects the fixed question template. A node's
    // content never changes the template. Do not generate prose from titles.
    $('assessmentInfluenceLabel').textContent = t(parent?.kind === 'option'
      ? 'assessmentInfluenceOption' : 'assessmentInfluenceClaim');
    $('assessmentClaim').textContent = node.title;
    $('assessmentDetails').textContent = node.details || '';
    $('assessmentCredenceField').hidden = !fields.credence;
    $('assessmentImpactField').hidden = !hasEdge;
    const claim = fields.credence ? ownClaimAssessment(node.id) : null;
    const impact = hasEdge ? ownPrimaryAssessment(node.id) : null;
    $('assessmentProfile').textContent = t('profileActive', { name: userProfile().name });
    if (fields.credence) {
      $('assessmentCredence').value = String(claim?.confidence ?? node.confidence);
      $('assessmentCredenceNumber').value = String(claim?.confidence ?? node.confidence);
    }
    if (hasEdge) {
      $('assessmentInfluence').value = String(impact?.current ? impact.record.influence : Core.signedInfluence(node));
      assessmentUpdateInfluence();
      // Parent-type-specific fixed wording is already set above; the source
      // and target titles are presented separately in the assessment context.
    }
    $('assessmentNotYet').textContent = ((!fields.credence || claim) && (!hasEdge || impact?.current)) ? '' : t('profileSuggested');
    $('assessmentReviewedMarker').textContent = assessment.done.has(node.id) ? t('assessmentAlreadyReviewed') : t('assessmentNotReviewed');
    $('btnAssessNext').textContent = idx === total-1 ? t('assessmentSaveFinish') : t('assessmentSaveNext');
    $('btnAssessSkip').textContent = idx === total-1 ? t('assessmentSkipFinish') : t('assessmentSkip');
  }
  function focusAssessmentInput() {
    // The dialog is scrollable on mobile. Move focus to the new question header,
    // not a slider near the bottom: otherwise advancing hides the question.
    $('assessmentClaim').setAttribute('tabindex','-1');
    $('assessmentClaim').focus({preventScroll:true});
    $('assessmentDialog').scrollTop = 0;
  }
  function assessmentUpdateInfluence() {
    const n = Number($('assessmentInfluence').value);
    $('assessmentInfluenceValue').textContent = n > 0 ? `+${n}` : String(n);
  }
  function startAssessment() {
    if (!canEdit()) return;
    // Enter Evaluate without resetting user's independent layer choices.
    if (view.workflow !== 'evaluate') { view.workflow = 'evaluate'; saveView(); render(); }
    loadAssessmentPass();
    if (!assessment.order.length) { showMessage(t('assessmentNone')); return; }
    // Leave the selected node and view settings untouched; all collapsed
    // descendants are in the review queue regardless of canvas visibility.
    const dialog = $('assessmentDialog');
    assessmentRender(); dialog.showModal();
    focusAssessmentInput();
  }
  function moveAssessment(direction, saveCurrent = false) {
    const idx = assessment.order.indexOf(assessment.cursorId);
    if (idx < 0) return;
    if (saveCurrent) {
      const currentNode = project.nodes.find(n => n.id === assessment.cursorId);
      const fields = Core.assessmentFields(currentNode);
      const credence = fields.credence ? Number($('assessmentCredenceNumber').value) : null;
      if (fields.credence && (!Number.isFinite(credence) || credence < 0 || credence > 100 || !Number.isInteger(credence))) {
        showMessage(t('assessmentInvalidCredence')); return;
      }
      const influence = fields.impact ? Number($('assessmentInfluence').value) : null;
      // One review step can contain a factual claim (+ relation), or a
      // subjective value's relation only. Decision options have neither.
      if (!mutation(() => Core.applyPersonalAssessment(project, assessment.cursorId, actorId, credence, influence))) return;
      assessment.done.add(assessment.cursorId);
    }
    const next = idx + direction;
    if (next >= assessment.order.length) {
      assessment.finished = true;
    } else if (next >= 0) {
      assessment.cursorId = assessment.order[next]; assessment.finished = false;
    }
    saveAssessmentPass(); assessmentRender();
    if (!assessment.finished) focusAssessmentInput();
    else $('btnAssessUnreviewed').hidden ? $('btnAssessRestart').focus() : $('btnAssessUnreviewed').focus();
  }
  function closeAssessment() { $('assessmentDialog').close(); saveAssessmentPass(); }
  function arrangeTree() {
    if(view.depthLimit!==null){view.depthCompact=true;saveView();render();requestAnimationFrame(fitViewport);return;}
    // The original positions remain intact when only the visible folded tree
    // should be compacted. Restoring the full view restores manual placement.
    if(project.nodes.some(n=>n.collapsed) && view.focus.mode==='all'){
      view.compactVisible=true;saveView();render();requestAnimationFrame(fitViewport);return;
    }
    view.compactVisible=false;saveView();
    if (!canEdit()) { showMessage(t('viewerCannotEdit')); return; }
    if (view.orientation === 'four-way') {
      const before = snapshot();
      view.fourWayOffsets = {};
      project.layout.fourWayOffsets = view.fourWayOffsets;
      project.updatedAt = new Date().toISOString();
      history.record(before, snapshot());
      persist();saveView(); render(); requestAnimationFrame(fitViewport);
    } else mutation(() => Core.autoLayout(project), { fit: true });
  }

  /* One path for the card, inspector, context menu and keyboard command.
   * The explicit close takes priority over table-peek and focus-peek layers.
   */
  function isNodeCollapsed(node) {
    if(view.depthLimit === null)return !!node.collapsed;
    return Core.childrenOf(project,node.id).some(child=>!projection.visibleIds.has(child.id));
  }
  function setSubtreeCollapsed(nodeId, collapsed) {
    const node = project.nodes.find(n => n.id === nodeId);
    if (!node || !Core.childrenOf(project, nodeId).length) return false;
    const next = typeof collapsed === 'boolean' ? collapsed : !isNodeCollapsed(node);
    if(view.depthLimit !== null){
      depthOverrides.set(nodeId,next); // closed=true, open=false: whole-branch override
      if(next && Core.descendants(project,nodeId).includes(selectedId))selectedId=nodeId;
      render();requestAnimationFrame(fitViewport);
      return true;
    }
    if(!canEdit())return false;
    if (node.collapsed === next) return false;
    const beforeReveal = tableRevealId;
    const beforeSelected = selectedId;
    const wasExplicit = explicitlyClosedIds.has(nodeId);
    tableRevealId = null;
    if (next) {
      explicitlyClosedIds.add(nodeId);
      if (Core.descendants(project, nodeId).includes(selectedId)) selectedId = nodeId;
    } else explicitlyClosedIds.delete(nodeId);
    const ok = mutation(() => { project.nodes.find(n => n.id === nodeId).collapsed = next; });
    if (!ok) {
      tableRevealId = beforeReveal;
      selectedId = beforeSelected;
      if (wasExplicit) explicitlyClosedIds.add(nodeId);
      else explicitlyClosedIds.delete(nodeId);
      render();
    }
    return ok;
  }

  function toggleOptionBranches() {
    if(project.mode!=='decision'||(!canEdit()&&view.depthLimit===null))return;
    const options=project.nodes.filter(n=>n.relation==='option'&&Core.childrenOf(project,n.id).length);
    if(!options.length)return;
    if(view.depthLimit!==null){
      const collapse=options.some(n=>!isNodeCollapsed(n));
      for(const option of options)depthOverrides.set(option.id,collapse);
      if(collapse && options.some(n=>Core.descendants(project,n.id).includes(selectedId)))selectedId=Core.rootNode(project).id;
      render();requestAnimationFrame(fitViewport);return;
    }
    const collapse=options.some(n=>!n.collapsed);
    if(collapse&&options.some(n=>Core.descendants(project,n.id).includes(selectedId)))selectedId=Core.rootNode(project).id;
    tableRevealId=null;
    for(const node of options){
      if(collapse)explicitlyClosedIds.add(node.id);
      else explicitlyClosedIds.delete(node.id);
    }
    view.compactVisible=collapse;
    saveView();
    const changed=mutation(()=>{for(const n of options)n.collapsed=collapse;},{fit:true});
    if(!changed){render();requestAnimationFrame(fitViewport);}
  }
  function toggleCompactVisible() {
    if(view.depthLimit!==null)view.depthCompact=!view.depthCompact;
    else view.compactVisible=!view.compactVisible;
    saveView();render();requestAnimationFrame(fitViewport);
  }
  function selectNode(nodeId, focus = false) {
    if (!project.nodes.some(node => node.id === nodeId)) return;
    selectedId = nodeId;
    selectedLibraryReason=null;
    if (nodeId !== tableRevealId) tableRevealId = null;
    render();
    if (focus) focusSelectedNode();
  }
  function focusSelectedNode() {
    const node = [...$('nodesLayer').querySelectorAll('.node')].find(n => n.dataset.id === selectedId);
    if (node) node.focus({preventScroll:true});
  }
  function centerSelectedNode() {
    const node = project.nodes.find(n => n.id === selectedId);
    if (!node) return;
    const pos = visualPosition(node);
    const vp = $('viewport');
    if (vp.clientWidth && vp.clientHeight) {
      camera.x = vp.clientWidth / 2 - (pos.x + CARD_W / 2) * camera.scale;
      camera.y = vp.clientHeight / 2 - (pos.y + cardHeight() / 2) * camera.scale;
      cameraApply();
    }
    focusSelectedNode();
  }
  function hasSavedWork() {
    try { return Workspace.hasSavedWork(storage); }
    catch (_) { return false; }
  }
  function formatWorkspaceTime(value) {
    if (!value || Number.isNaN(Date.parse(value))) return t('homeTimeUnknown');
    try { return new Intl.DateTimeFormat(locale, { dateStyle:'medium',timeStyle:'short' }).format(new Date(value)); }
    catch (_) { return value; }
  }
  function renderHomeWorkspace() {
    const saved = hasSavedWork();
    const meta = (()=>{try{return Workspace.readMeta(storage);}catch(_){return {};}})();
    const current = $('homeCurrentWork');
    current.hidden = !saved;
    const canContinue = saved && !hydrationFailed;
    const continueButton = $('btnHomeContinue');
    continueButton.hidden = !canContinue;
    continueButton.classList.toggle('primary', canContinue);
    continueButton.classList.toggle('home-primary', canContinue);
    continueButton.classList.toggle('quiet', !canContinue);
    continueButton.classList.toggle('home-secondary', !canContinue);
    const newButton = $('btnHomeNew');
    newButton.classList.toggle('primary', !canContinue);
    newButton.classList.toggle('home-primary', !canContinue);
    newButton.classList.toggle('quiet', canContinue);
    newButton.classList.toggle('home-secondary', canContinue);
    if (saved) {
      $('homeCurrentTitle').textContent = meta.active?.id === project.id ? meta.active.title : (hydrationFailed ? t('homeUnreadable') : project.title);
      $('homeBrowserSave').textContent = formatWorkspaceTime(meta.active?.id === project.id ? meta.active.savedAt : null);
    }
    const detail = (event) => event?.filename ? `${event.filename} · ${formatWorkspaceTime(event.at)}` : t('homeNotYet');
    $('homeLatestOpen').textContent = detail(meta.lastOpenedJson);
    $('homeLatestExport').textContent = detail(meta.lastExportedJson);
    $('homeSaveWarning').hidden = !hydrationFailed;
    $('homeSessionWarning').hidden = !storageState.temporary;
    $('homeBrowserSaveLabel').textContent = t(storageState.temporary ? 'homeSessionSaveLabel' : 'homeBrowserSaveLabel');
  }
  function showHome() {
    closeContextMenu(false);
    focusOnly = false;
    document.body.classList.remove('witt-focus');
    document.body.classList.add('home-active');
    renderHomeWorkspace();
    $('homeLocaleSelect').value = locale;
    $('tutorialPanel').hidden = true;
    (hasSavedWork() && !hydrationFailed ? $('btnHomeContinue') : $('btnHomeNew')).focus();
  }
  function enterEditor() {
    document.body.classList.remove('home-active');
    renderTutorial();
    refreshCanvasButtons();
    requestAnimationFrame(() => {fitViewport(); $('viewport').focus({preventScroll:true});});
  }
  function showAbout() { $('aboutDialog').showModal(); }

  function refreshCanvasButtons() {
    document.body.classList.toggle('witt-focus', focusOnly);
    for (const id of ['btnFocusView', 'btnFocusQuick']) {
      const btn = $(id); btn.textContent = focusOnly ? `⛶ ${t('exitFocus')}` : `⛶ ${t('focusTree')}`;
      btn.title = focusOnly ? t('exitFocus') : t('focusTree');
      btn.setAttribute('aria-pressed', String(focusOnly));
    }
    const orientationNames = { horizontal: 'leftRight', vertical: 'topDown', 'four-way': 'fourDirections' };
    const orientationArrows = { horizontal: '→', vertical: '↓', 'four-way': '✣' };
    $('orientationSelect').value = view.orientation;
    for (const option of $('orientationSelect').options) option.textContent = `${orientationArrows[option.value]} ${t(orientationNames[option.value])}`;
    const btn = $('btnOrientationQuick');
    btn.textContent = `${orientationArrows[view.orientation]} ${t(orientationNames[view.orientation])}`;
    btn.title = `${t('changeOrientation')}: ${t(orientationNames[view.orientation])}`;
    btn.setAttribute('aria-label', btn.title);
    btn.setAttribute('aria-pressed', String(view.orientation !== 'horizontal'));
  }
  function toggleFocus(force) {
    if (view.presentation === 'table') view.presentation = 'tree';
    focusOnly = typeof force === 'boolean' ? force : !focusOnly;
    refreshCanvasButtons();
    requestAnimationFrame(fitViewport);
  }
  function toggleOrientation() {
    view.orientation = Layout.ORIENTATIONS[(Layout.ORIENTATIONS.indexOf(view.orientation) + 1) % Layout.ORIENTATIONS.length];
    saveView(); refreshCanvasButtons();
    renderNodes(); requestAnimationFrame(fitViewport);
  }
  function updateReviewLensButtons() {
    for (const id of ['btnReviewLens','btnReviewLensTable','btnReviewLensQuick']) {
      const button=$(id);
      button.textContent = lens.filtered ? `${t('reviewLens')} · ${lens.selectedCount}/${lens.totalCount}` : t('reviewLens');
      button.title = lens.filtered ? t('lensFilteredHint') : t('lensAllHint');
      button.setAttribute('aria-pressed', String(lens.filtered));
    }
    $('reviewLensBanner').hidden = !lens.filtered;
    $('reviewLensBanner').textContent = lens.filtered ? t('lensSelectedBanner', {selected:lens.selectedCount,total:lens.totalCount}) : '';
  }
  function renderExampleCards() {
    const list=$('exampleCards'); list.replaceChildren();
    for(const entry of Examples.list()) {
      const card=el('button','example-card');card.type='button';
      card.append(el('strong','',entry.title),el('small','',entry.description),
        el('small','',`${entry.nodeCount} ${t('exampleClaims')} · ${entry.participants.length} ${t('examplePeople')}`));
      card.onclick=async()=>{
        if(!await prepareReplacement(t('demoConfirm')))return;
        const sample=Examples.get(entry.id);
        if(!sample)return;
        sample.id=Core.uid(); // New workspace, never overwrite the library fixture.
        tutorial=null;
        if(!replaceProject(sample))return;
        $('examplesDialog').close();
        enterEditor();
        if(project.users.length>1) view.workflow='evaluate';
        saveView();render();
      };
      list.append(card);
    }
  }
  function openExamples() {renderExampleCards();$('examplesDialog').showModal();}
  function renderReviewLensDialog() {
    const target=$('lensPeople');target.replaceChildren();
    for (const u of project.users) {
      const label=el('label','lens-person'); const cb=el('input');cb.type='checkbox';cb.checked=lens.userIds.has(u.id);
      cb.setAttribute('aria-label',u.name+(Core.isAIProfile(u)?' · AI':''));
      cb.onchange=()=>{
        const next=new Set(lens.userIds); if(cb.checked)next.add(u.id);else next.delete(u.id);
        setReviewSelection([...next]); renderReviewLensDialog();
      };
      label.append(cb,el('span','',u.name+(Core.isAIProfile(u)?' · AI':'')));target.append(label);
    }
    const insights=$('lensInsights');insights.replaceChildren();
    insights.append(el('h3','',t('lensDifferences')));
    insights.append(el('p','influence-legend',t('influenceStatusLegend')));
    if (!lens.disagreements.length) insights.append(el('p','',t('lensNotEnough')));
    else for(const r of lens.disagreements.slice(0,5)) {
      const div=el('div','lens-insight-item');
      div.append(el('strong','',r.title),el('small','',`${t(r.kind==='credence'?'lensCredence':'lensInfluence')} · ${t('lensRange')}: ${r.rawSpread.toFixed(r.rawSpread%1?1:0)} ${r.units} · ${r.count} ${t('examplePeople')}`));
      if (r.kind === 'impact') {
        const tag = influenceStatusTag(r);
        if (tag) div.append(tag);
        div.append(el('small','',t('influenceDistribution',r)));
      }
      div.append(el('small','',r.details.join(' · ')));
      insights.append(div);
    }
    insights.append(el('h3','',t('lensSimilarity')));
    if(!lens.comparisons.length)insights.append(el('p','',t('lensNotEnough')));
    else for(const c of lens.comparisons.slice(0,3)) {
      const div=el('div','lens-insight-item'); div.append(el('strong','',`${c.a} + ${c.b}`),el('small','',`${t('lensMeanDifference')}: ${c.distance.toFixed(1)} / 100 · ${c.shared} ${t('lensShared')}`));insights.append(div);
    }
    insights.append(el('p','',t('lensNoInference')));
  }
  function openReviewLens() {lens=Lens.projectLens(project,reviewIds);renderReviewLensDialog();$('reviewLensDialog').showModal();}
  const tutorialAnchors=[null,null,null,null,'btnWorkflowEvaluate','btnTableView','btnLayout',null];
  function showMessyTutorialTree() {
    if(!tutorial || tutorial.messShown) return;
    tutorial.messShown=true;
    const before=snapshot();
    const root=Core.rootNode(project);
    // Even when the user skips earlier steps, provide two sample reasons
    // so the intentionally disorganized tree remains a meaningful demo.
    if(!project.nodes.some(n=>n.parentId===root.id&&n.relation==='support')){
      Core.addChild(project,root.id,'support',actorId).title=t('supportAdd');
    }
    if(!project.nodes.some(n=>n.parentId===root.id&&n.relation==='oppose')){
      Core.addChild(project,root.id,'oppose',actorId).title=t('opposeAdd');
    }
    project.nodes.filter(n=>n.parentId===root.id).forEach((node,i)=>{
      node.position={x:root.position.x+230+(i%2)*24,y:root.position.y+24+(i%3)*25};
    });
    project.updatedAt=new Date().toISOString();
    project=Core.validateProject(project);
    history.record(before,snapshot());
    persist();
    view.presentation='tree'; view.orientation='horizontal';
    view.dockCollapsed=false;view.layersOpen=true;
    saveView();
    requestAnimationFrame(()=>{render();fitViewport();});
  }
  function tutorialCheck() {
    if(!tutorial)return;
    const rootId=tutorial.rootId;
    const rootChildren=project.nodes.filter(n=>n.parentId===rootId);
    if(tutorial.step===0){const c=rootChildren.find(n=>n.relation==='support');if(c){tutorial.supportId=c.id;tutorial.step=1;}}
    if(tutorial.step===1&&tutorial.supportId){const n=project.nodes.find(n=>n.id===tutorial.supportId);if(n&&n.title!=='Puoltava argumentti')tutorial.step=2;}
    if(tutorial.step===2){const c=rootChildren.find(n=>n.relation==='oppose');if(c){tutorial.opposeId=c.id;tutorial.step=3;}}
    if(tutorial.step===3&&tutorial.opposeId){const n=project.nodes.find(n=>n.id===tutorial.opposeId);if(n&&n.title!=='Vastustava argumentti')tutorial.step=4;}
    if(tutorial.step===4&&tutorial.supportId){const voted=Core.personalCredence(project,tutorial.supportId,actorId);const impact=Core.personalInfluence(project,'primary',tutorial.supportId,actorId);if(voted&&impact.current)tutorial.step=5;}
    if(tutorial.step===5&&view.presentation==='table'){tutorial.step=6;showMessyTutorialTree();}
  }
  function renderTutorial() {
    const panel=$('tutorialPanel');
    for(const node of document.querySelectorAll('.tutorial-highlight'))node.classList.remove('tutorial-highlight');
    if(!tutorial || document.body.classList.contains('home-active')) {panel.hidden=true;return;}
    panel.hidden=false;
    $('tutorialProgress').textContent = tutorial.step===7 ? t('tutorialComplete') : t('tutorialProgress',{current:tutorial.step+1,total:7});
    $('tutorialHeading').textContent=t(tutorial.step===7?'tutorialComplete':'tutorialHeading');
    const stepKey = `tutorialStep${tutorial.step}`;
    $('tutorialText').textContent=t(stepKey) + (tutorial.step===0 ? ` (${shortcuts.support.replace('Ctrl','Ctrl/Cmd')})` : tutorial.step===2 ? ` (${shortcuts.oppose.replace('Ctrl','Ctrl/Cmd')})` : '');
    $('tutorialNext').textContent=t(tutorial.step===7?'tutorialDone':'tutorialSkip');
    $('tutorialTarget').hidden=tutorial.step===7;
    const id=tutorialAnchors[tutorial.step];const target=id?$(id):null;
    if(target)target.classList.add('tutorial-highlight');
    const root = [...$('nodesLayer').querySelectorAll('.node')].find(n=>n.dataset.id===tutorial.rootId);
    const action = tutorial.step===0 ? 'support' : tutorial.step===2 ? 'oppose' : null;
    if(action && root)root.querySelector(`.node-add[data-relation="${action}"]`)?.classList.add('tutorial-highlight');
    const editId=tutorial.step===1?tutorial.supportId:tutorial.step===3?tutorial.opposeId:null;
    if(editId)[...$('nodesLayer').querySelectorAll('.node')].find(n=>n.dataset.id===editId)?.classList.add('tutorial-highlight');
    if(tutorialPosition) {
      panel.style.left=tutorialPosition.x+'px';panel.style.top=tutorialPosition.y+'px';
      panel.style.right='auto';panel.style.bottom='auto';
    } else {panel.style.left='';panel.style.top='';panel.style.right='';panel.style.bottom='';}
  }
  // The view settings panel is a floating viewport-level tool, not part of
  // the (clipped) argument canvas. First open anchors beside the trigger;
  // subsequent user drags are device-local and persist across reopenings.
  function viewDockSafeTop() {
    const toolbar=document.querySelector('.toolbar'), topbar=document.querySelector('.topbar');
    const bar=toolbar&&getComputedStyle(toolbar).display!=='none'?toolbar:topbar;
    return Math.min(window.innerHeight-48,Math.max(8,(bar?.getBoundingClientRect().bottom||0)+7));
  }
  function placeViewDock() {
    const panel=$('viewDock');
    if(panel.hidden || document.body.classList.contains('home-active'))return;
    const minTop=viewDockSafeTop();
    // Leave a usable drag handle under the permanent workspace controls.
    const availableHeight=Math.max(110,window.innerHeight-minTop-8);
    panel.style.maxHeight=(window.innerWidth<=760?Math.min(420,availableHeight):availableHeight)+'px';
    const bound=(value,min,max)=>Math.max(min,Math.min(value,Math.max(min,max)));
    const apply=(x,y)=>{
      panel.style.left=bound(x,8,window.innerWidth-panel.offsetWidth-8)+'px';
      panel.style.top=bound(y,minTop,window.innerHeight-panel.offsetHeight-8)+'px';
      panel.style.right='auto'; panel.style.bottom='auto';
    };
    const stored=view.dockScreenPosition;
    if(stored) {apply(stored.x,stored.y);return;}
    const anchor=$('btnViewSettings').getBoundingClientRect();
    const gap=7, width=panel.offsetWidth, height=panel.offsetHeight;
    // Prefer below the trigger; place above it only if the whole panel fits.
    let top=anchor.bottom+gap;
    if(top+height>window.innerHeight-8 && anchor.top-height-gap>=8)top=anchor.top-height-gap;
    apply(anchor.left,top);
  }
  function initViewDockDrag(){
    const handle=$('dockMove'),panel=$('viewDock');
    // Moving out of .canvas-area removes overflow clipping, so the panel can
    // actually be dragged over a side rail or header when requested.
    document.querySelector('.app-shell').appendChild(panel);
    const apply=(x,y)=>{
      const bound=(value,min,max)=>Math.max(min,Math.min(value,Math.max(min,max)));
      const minTop=viewDockSafeTop();
      panel.style.left=bound(x,8,window.innerWidth-panel.offsetWidth-8)+'px';
      panel.style.top=bound(y,minTop,window.innerHeight-panel.offsetHeight-8)+'px';
      panel.style.right='auto';panel.style.bottom='auto';
    };
    const remember=()=>{
      const rect=panel.getBoundingClientRect();
      if(rect.width&&!panel.hidden){
        view.dockScreenPosition={x:rect.left,y:rect.top};saveView();
      }
    };
    handle.addEventListener('pointerdown',event=>{
      if(event.button!==0)return;
      event.preventDefault();
      const rect=panel.getBoundingClientRect();
      const begin={x:event.clientX,y:event.clientY,left:rect.left,top:rect.top};
      handle.setPointerCapture(event.pointerId);
      const move=e=>apply(begin.left+e.clientX-begin.x,begin.top+e.clientY-begin.y);
      const stop=()=>{handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',stop);handle.removeEventListener('pointercancel',stop);remember();};
      handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',stop);handle.addEventListener('pointercancel',stop);
    });
    handle.addEventListener('keydown',event=>{
      const vector={ArrowLeft:[-24,0],ArrowRight:[24,0],ArrowUp:[0,-24],ArrowDown:[0,24]}[event.key];
      if(!vector)return;
      event.preventDefault();event.stopPropagation();
      const rect=panel.getBoundingClientRect();
      apply(rect.left+vector[0],rect.top+vector[1]);remember();
    });
    handle.ondblclick=()=>{view.dockScreenPosition=null;saveView();placeViewDock();};
    window.addEventListener('resize',()=>{
      if(view.dockHidden)return;
      requestAnimationFrame(placeViewDock);
    });
    requestAnimationFrame(placeViewDock);
  }
  function showViewDock() {
    if(view.presentation==='table')selectPresentation('tree');
    view.dockHidden=false;view.dockCollapsed=false;view.layersOpen=true;
    saveView();renderViewControls();
    requestAnimationFrame(placeViewDock);
    $('viewPreset').focus({preventScroll:true});
  }
  function hideViewDock() {
    view.dockHidden=true;saveView();renderViewControls();
  }
  function toggleViewDock(){if(view.dockHidden)showViewDock();else hideViewDock();}
  function initTutorialDrag() {
    const handle=$('tutorialMove'),panel=$('tutorialPanel');
    const clampPoint=(x,y)=>({
      x:Math.max(6,Math.min(x,window.innerWidth-panel.offsetWidth-6)),
      y:Math.max(6,Math.min(y,window.innerHeight-panel.offsetHeight-6))
    });
    const apply=p=>{tutorialPosition=clampPoint(p.x,p.y); panel.style.left=tutorialPosition.x+'px'; panel.style.top=tutorialPosition.y+'px';panel.style.right='auto';panel.style.bottom='auto';};
    handle.addEventListener('pointerdown',e=>{
      if(e.button!==0||!tutorial)return;
      e.preventDefault();const rect=panel.getBoundingClientRect();
      const x=e.clientX,y=e.clientY,start={x:rect.left,y:rect.top};
      handle.setPointerCapture(e.pointerId);
      const move=ev=>apply({x:start.x+ev.clientX-x,y:start.y+ev.clientY-y});
      const stop=()=>{handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',stop);handle.removeEventListener('pointercancel',stop);};
      handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',stop);handle.addEventListener('pointercancel',stop);
    });
    handle.addEventListener('keydown',e=>{
      const movement={ArrowLeft:[-24,0],ArrowRight:[24,0],ArrowUp:[0,-24],ArrowDown:[0,24]}[e.key];
      if(!movement)return;
      e.preventDefault();e.stopPropagation();
      const rect=panel.getBoundingClientRect();apply({x:rect.left+movement[0],y:rect.top+movement[1]});
    });
    window.addEventListener('resize',()=>{if(tutorialPosition&&tutorial&&!panel.hidden)apply(tutorialPosition);});
  }
  async function startTutorial() {
    if(!await prepareReplacement(t('newDocumentConfirm')))return;
    const doc=Core.createBlankProject('argument');
    doc.title=t('tutorialDocumentTitle');
    doc.nodes[0].title=t('tutorialRootClaim');
    doc.nodes[0].details=t('tutorialRootDetail');
    if(!replaceProject(doc))return;
    view.presentation='tree';view.workflow='explore';view.layers={...LAYER_PRESETS.text};
    saveView();
    tutorialPosition=null;
    tutorial={step:0,rootId:Core.rootNode(project).id,supportId:null,opposeId:null};
    enterEditor();render();
  }
  function tutorialShowTarget() {
    if(!tutorial)return;
    if(tutorial.step===0||tutorial.step===2){
      selectNode(tutorial.rootId);
      const actionName=tutorial.step===0?'support':'oppose';
      const root=[...$('nodesLayer').querySelectorAll('.node')].find(n=>n.dataset.id===tutorial.rootId);
      const action=root?.querySelector(`.node-add[data-relation="${actionName}"]`);
      if(window.innerWidth<=760 || !action?.getClientRects().length)addNode(actionName,tutorial.rootId);
      else action.focus({preventScroll:true});
      return;
    }
    if(tutorial.step===1||tutorial.step===3){const id=tutorial.step===1?tutorial.supportId:tutorial.opposeId;if(id) {selectNode(id);startInlineEdit(id);}return;}
    if(tutorial.step===4){view.workflow='evaluate';view.layers={...LAYER_PRESETS.analysis};saveView();if(tutorial.supportId)selectedId=tutorial.supportId;render();return;}
    if(tutorial.step===5)selectPresentation('table');
    if(tutorial.step===6) { arrangeTree(); tutorial.step=7;renderTutorial(); }
  }
  function render() {
    hideClaimPreview();
    refreshCanvasButtons();
    document.body.dataset.theme = effectiveAppearance();
    $('themeSelect').value = effectiveAppearance();
    $('homeThemeSelect').value = effectiveAppearance();
    if (!project.nodes.some(n => n.id === selectedId)) selectedId = Core.rootNode(project).id;
    if (!project.users.some(u => u.id === actorId)) actorId = project.users[0].id;
    if (!project.nodes.some(n => n.id === view.focus.anchorId)) view.focus.anchorId = Core.rootNode(project).id;
    projection = Core.focusProjection(project, view.focus.anchorId, view.focus.mode);
    if (tableRevealId && view.presentation === 'tree') {
      const byId = new Map(project.nodes.map(n => [n.id, n]));
      for (let item = byId.get(tableRevealId); item; item = byId.get(item.parentId)) {
        projection.visibleIds.add(item.id);
        projection.contextIds.add(item.id);
      }
      projection.nodes = project.nodes.filter(n => projection.visibleIds.has(n.id));
    }
    if(view.depthLimit !== null){
      const depthView=Layout.depthProjection(project.nodes,Math.min(view.depthLimit,Layout.maxTreeDepth(project.nodes)),depthOverrides);
      if(!depthView.visibleIds.has(selectedId) && view.presentation==='tree')selectedId=Core.rootNode(project).id;
      projection={...projection,nodes:depthView.nodes,visibleIds:depthView.visibleIds,
        matchIds:new Set([...projection.matchIds].filter(id=>depthView.visibleIds.has(id))),
        contextIds:new Set([...projection.contextIds].filter(id=>depthView.visibleIds.has(id))),
        peekIds:new Set(),matches:[...projection.matchIds].filter(id=>depthView.visibleIds.has(id)).length};
    }else projection = Core.respectExplicitCollapse(project, projection, explicitlyClosedIds);
    if(!view.showRecurringInTree){
      const byId=new Map(project.nodes.map(n=>[n.id,n]));
      const hidden=new Set();
      function isHidden(id){
        if(hidden.has(id))return true;
        const node=byId.get(id);if(!node)return false;
        if(node.sharedReasonId||node.reasonConceptId){hidden.add(id);return true;}
        if(node.parentId&&isHidden(node.parentId)){hidden.add(id);return true;}
        return false;
      }
      const visibleIds=new Set([...projection.visibleIds].filter(id=>!isHidden(id)));
      projection={...projection,visibleIds,nodes:projection.nodes.filter(n=>visibleIds.has(n.id))};
    }
    if (document.activeElement !== $('projectTitle')) $('projectTitle').value = project.title;
    $('workflowSelect').value = view.workflow;
    for(const button of document.querySelectorAll('[data-workflow]')){const active=button.dataset.workflow===view.workflow;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));}
    $('modeArgument').classList.toggle('active', project.mode === 'argument');
    $('modeDecision').classList.toggle('active', project.mode === 'decision');
    $('nodeCount').textContent = project.nodes.length;
    $('btnUndo').disabled = !history.canUndo;
    $('btnRedo').disabled = !history.canRedo;
    $('btnUndoQuick').disabled = !history.canUndo;
    $('btnAssess').disabled = !canEdit(); $('btnAssessQuick').disabled = !canEdit();
    $('btnOption').hidden = project.mode !== 'decision';
    $('btnOptionGroup').hidden = project.mode !== 'decision';
    $('btnVoting').hidden = project.mode !== 'decision';
    for (const id of ['btnSupport','btnOppose','btnNeutral']) $(id).disabled = !canEdit() || project.nodes.find(n=>n.id===selectedId)?.kind==='group';
    for (const id of ['btnOption','btnOptionGroup']) $(id).disabled = !canEdit() || project.votingRound?.status==='open';
    renderActorSelect();
    scores = Core.evaluate(project);
    personalScores = view.indexMode==='personal'?Core.evaluateAssessor(project,viewedAssessorId()):new Map();
    lens = Lens.projectLens(project, reviewIds);
    recalculateImportance();
    updateLeadingOptions();
    renderViewControls();
    renderPerspectiveControls();
    $('importantToggle').checked=view.showImportance;
    // The table is its own read-only surface. Avoid unnecessarily rebuilding
    // hundreds of hidden SVG/DOM nodes when inspecting a large argument set.
    if (view.presentation === 'tree') {
      renderOutline(); renderNodes(); renderInspector();
    }
    renderRepeatLibrary();
    renderTable();
    updateReviewLensButtons();
    tutorialCheck();
    renderTutorial();
    if ($('peopleDialog').open) renderPeople();
    if ($('voteDialog').open) renderVoteDialog();
    if ($('linkDialog').open) renderLinksDialog();
    if ($('sharedReasonsDialog').open) renderSharedReasons();
    if ($('contextReasonsDialog').open) renderContextReasons();
    applyZones();cameraApply();
  }
  function selectPresentation(next) {
    if (!['tree', 'table'].includes(next) || view.presentation === next) return;
    view.presentation = next;
    if (next === 'table') { focusOnly = false; tableRevealId = null; }
    saveView(); render();
    if (next === 'tree') requestAnimationFrame(fitViewport);
    else requestAnimationFrame(() => $('tableSearch').focus({ preventScroll: true }));
  }
  function tableNodeButton(label, id, className = 'table-claim-button') {
    const button = el('button', className, label);
    button.type = 'button';
    button.dataset.tableNodeId = id;
    button.onclick = () => {
      selectedId = id;selectedLibraryReason=null;
      tableState.expandedId = tableState.expandedId === id ? null : id;
      render();
      [...$('argumentTableBody').querySelectorAll('.table-claim-button')].find(button => button.dataset.tableNodeId === id)?.focus({ preventScroll: true });
    };
    button.setAttribute('aria-expanded', String(tableState.expandedId === id));
    button.setAttribute('aria-label', `${label} — ${t(tableState.expandedId === id ? 'tableLess' : 'tableMore')}`);
    return button;
  }
  function tableDetailCard(title, lines, className = '') {
    const item = el('section', `table-detail-card ${className}`.trim());
    item.append(el('h3', '', title));
    for (const line of lines) item.append(el('p', '', line));
    return item;
  }
  function renderMobileArguments(rows) {
    const list=$('mobileArguments');list.replaceChildren();
    list.hidden=view.presentation!=='table';
    for(const row of rows){
      const {node}=row;
      const card=el('article','mobile-card');card.setAttribute('role','listitem');
      if(selectedId===node.id)card.classList.add('is-selected');
      const displayDirection=displayedPrimaryRelation(node);
      const path=el('small','mobile-path',`${'↳ '.repeat(Math.min(3,row.depth))}${row.depth>3?'… ':''}${t(displayDirection==='root'?'rootClaimType':displayDirection==='support'?'supportWord':displayDirection==='oppose'?'opposeWord':displayDirection==='neutral'?'neutralWord':displayDirection==='group'?'optionGroupType':'optionWord')}`);
      path.classList.add('mobile-relation',displayDirection);
      const title=el('button','mobile-title',node.title);title.type='button';
      const expanded=tableState.expandedId===node.id;
      title.setAttribute('aria-expanded',String(expanded));
      title.onclick=()=>{selectedId=node.id;selectedLibraryReason=null;tableState.expandedId=expanded?null:node.id;render();};
      card.append(path,title);
      if(row.parent){
        const line=el('small','mobile-parent',`↳ ${row.parent.title}`);
        if(row.grandparent)line.title=row.ancestors.map(v=>v.title).join(' › ');
        card.append(line);
      }
      if(view.workflow==='evaluate'&&!['decision','group'].includes(node.kind)){
        const metrics=el('div','mobile-ratings');
        const ratings=nodeAssessmentSnapshot(node);
        const c=Core.truthAssessable(node)?(lens.filtered?lens.credence.get(node.id)?.mean:ratings?.credence):null;
        metrics.append(el('span','',`${t('tableColCredence')}: ${c===null||c===undefined?'—':c.toFixed(0)+' %'}`));
        if(!lens.filtered || view.indexMode==='personal') {
          const calculated=shownScore(node.id);
          metrics.append(el('span','',`${t('tableColIndex')}: ${resultText(node,calculated)}`));
        }
        if(node.parentId&&node.relation!=='option'){
          const ir=lens.filtered?lens.impact.get(node.id):Core.influenceSummary(project,'primary',node.id);
          const impact=lens.filtered?ir?.mean:ratings?.impact;
          metrics.append(el('span','',`${t('tableColInfluence')}: ${impact===null||impact===undefined?'—':signed(Number(impact.toFixed(1)))+'/5'}`));
          if (view.indexMode !== 'personal') { const tag = influenceStatusTag(ir); if (tag) metrics.append(tag); }
        }
        card.append(metrics);
      }
      if(expanded){
        const detail=Table.assessmentDetails(project,node.id);
        const box=el('div','mobile-card-details');
        box.append(el('p','',node.details||t('tableNoNotes')));
        for(const item of detail.reviews.filter(v=>lens.userIds.has(v.userId)))box.append(el('p','',`${item.name}: ${t('tableColCredence')} ${item.credence}/100`));
        for(const item of detail.impactReviews.filter(v=>lens.userIds.has(v.userId)))if(!item.stale)box.append(el('p','',`${item.name}: ${t('tableColInfluence')} ${signed(item.influence)}/5`));
        const open=el('button','btn quiet',t('tableOpenTree'));open.type='button';
        open.onclick=()=>{
          selectedId=node.id;tableRevealId=node.id;
          const byId=new Map(project.nodes.map(n=>[n.id,n]));
          for(let cur=node;cur;cur=byId.get(cur.parentId))explicitlyClosedIds.delete(cur.id);
          selectPresentation('tree');requestAnimationFrame(centerSelectedNode);
        };
        box.append(open);
        if(canEdit()){
          const addBox=el('div','mobile-add-row');const input=el('input');input.type='text';input.maxLength=200;
          input.placeholder=t('mobileNewClaim');input.setAttribute('aria-label',t('mobileNewClaim'));
          const actions=el('div','mobile-add-actions');
          for(const rel of ['support','oppose']){
            const add=el('button',`btn ${rel==='support'?'support-add':'oppose-add'}`,t(rel==='support'?'supportAdd':'opposeAdd'));add.type='button';
            add.onclick=()=>{
              const value=input.value.trim();if(!value){input.focus();return;}
              let created=null;
              if(mutation(()=>{created=Core.addChild(project,node.id,rel,actorId);created.title=value;selectedId=created.id;})){
                tableState.expandedId=created.id;render();
                const target=[...$('mobileArguments').querySelectorAll('.mobile-card .mobile-title')].find(el=>el.textContent===value);
                target?.scrollIntoView({block:'nearest',behavior:'instant'});
              }
            };
            actions.append(add);
          }
          addBox.append(input,actions);box.append(addBox);
        }
        card.append(box);
      }
      list.append(card);
    }
  }
  function renderTable() {
    const isTable = view.presentation === 'table';
    $('tableArea').hidden = !isTable;
    $('tableComments').checked = !!view.layers.comments;
    $('viewport').closest('.canvas-area').hidden = isTable;
    $('btnTreeView').classList.toggle('active', !isTable);
    $('btnTableView').classList.toggle('active', isTable);
    $('btnTreeView').setAttribute('aria-pressed', String(!isTable));
    $('btnTableView').setAttribute('aria-pressed', String(isTable));
    $('btnFit').disabled = isTable;
    $('btnLayout').disabled = isTable;
    $('orientationSelect').disabled = isTable;
    $('workspaceMain').classList.toggle('table-view', isTable);
    $('workspaceMain').classList.toggle('table-evaluate', view.workflow === 'evaluate');
    if (!isTable) return;
    const rows = Table.projectRows(project, tableState);
    renderMobileArguments(rows);
    $('tableSummary').textContent = t('tableResults', { count: rows.length, total: project.nodes.length });
    const body = $('argumentTableBody');
    body.replaceChildren();
    const columns = view.workflow === 'evaluate' ? 7 : 4;
    const commentCounts = new Map();
    for (const c of project.comments || []) commentCounts.set(c.nodeId, (commentCounts.get(c.nodeId) || 0) + 1);
    const linkCounts = new Map();
    for (const link of project.links || []) {
      for (const id of [link.sourceId, link.targetId]) linkCounts.set(id, (linkCounts.get(id) || 0) + 1);
    }
    for (const row of rows) {
      const { node } = row;
      const tr = el('tr', 'table-argument-row');
      if(importantNodeIds.has(node.id))tr.classList.add('important-reason');
      if(leadingOptionIds.has(node.id))tr.classList.add('ai-leading-option');
      if(Core.isGate(node))tr.classList.add('semantic-gate');
      if (selectedId === node.id) tr.classList.add('selected');
      if (view.focus.mode !== 'all') {
        tr.classList.add(projection.matchIds.has(node.id) ? 'focus-match'
          : projection.contextIds.has(node.id) ? 'focus-context' : 'focus-muted');
      }
      const claim = el('td', 'table-claim-cell');
      const claimWrap = el('div', 'table-claim-wrap');
      claimWrap.style.setProperty('--tree-depth', `${Math.min(row.depth, 9)}`);
      if (row.depth) claimWrap.append(el('span', 'table-indent', '↳'));
      claimWrap.append(tableNodeButton(node.title, node.id));
      if (importantNodeIds.has(node.id)) {
        const effect = importanceEffects.get(node.id);
        if (effect) {
          const badge = el('small','reason-importance-badge', importanceShort(effect));
          badge.title = importanceHint(effect);
          claimWrap.append(badge);
        }
      }
      if(node.semanticType&&node.semanticType!=='unspecified')claimWrap.append(el('small','table-semantic',t('semantic_'+node.semanticType)));
      if(node.reasonConceptId)claimWrap.append(el('small','table-semantic',t('contextBadge')));
      if(project.users.some(u=>u.id===node.createdBy&&Core.isAIProfile(u)))claimWrap.append(el('small','node-ai-author','AI'));
      if (row.isCollapsedDescendant) {
        const hidden = el('span', 'table-hidden-marker', '◌');
        hidden.title = t('tableCollapsedNote');
        hidden.setAttribute('aria-label', t('tableCollapsedNote'));
        claimWrap.append(hidden);
      }
      claim.append(claimWrap);
      const relationCell = el('td', 'table-relation-cell');
      const displayDirection=displayedPrimaryRelation(node);
      const relationName=node.parentId===null?t(node.kind==='decision'?'rootDecisionType':'rootClaimType')
        :displayDirection==='group'?t('optionGroupType'):displayDirection==='option'?t('optionWord')
        :t(displayDirection==='support'?'supportWord':displayDirection==='oppose'?'opposeWord':'neutralWord');
      const relation=el('span',`table-relation ${displayDirection}`,relationName);
      relation.title = node.parentId ? t('tableRelativeParent') : '';
      relationCell.append(relation);
      if (row.depth > 1 && row.chainDirection && row.relation !== 'option'
          && (node.relation === 'oppose' ? -1 : 1) !== row.chainDirection) {
        const chain = el('small', 'table-chain', `${row.chainDirection > 0 ? '+' : '−'} ${t('tableChain')}`);
        chain.title = t('tableChainHint', { anchor: row.anchorTitle });
        relationCell.append(chain);
      }
      const context = el('td', 'table-context-cell');
      if (row.parent) {
        context.append(el('span', 'table-parent', row.parent.title));
        if (row.grandparent) context.append(el('small', 'table-grandparent', `↳ ${row.grandparent.title}`));
        context.title = row.ancestors.map(item => item.title).join(' › ');
      } else context.append(el('span', 'table-no-context', '—'));
      tr.append(claim, relationCell, context);
      if (view.workflow === 'evaluate') {
        const base = Core.getBaseConfidence(project, node);
        const edge = node.parentId && !['option','group'].includes(node.relation) ? Core.influenceSummary(project, 'primary', node.id) : null;
        const score = shownScore(node.id);
        const ratings=nodeAssessmentSnapshot(node);
        const selectedCredence=lens.credence.get(node.id);
        const selectedEdge=lens.impact.get(node.id);
        const credenceText = !Core.truthAssessable(node)?'—':view.indexMode==='personal'?(ratings?.credence==null?'—':`${ratings.credence.toFixed(0)} %`):lens.filtered?(selectedCredence?.count?`${selectedCredence.mean.toFixed(0)} % (${selectedCredence.count})`:'—'):(ratings?.credence==null?'—':`${ratings.credence.toFixed(0)} %${base.votesCount?` (${base.votesCount})`:'*'}`);
        const impactText = view.indexMode==='personal'?(shownInfluence(node)===null?'—':signed(shownInfluence(node))):lens.filtered?(selectedEdge?.count?`${signed(Number(selectedEdge.mean.toFixed(1)))} (${selectedEdge.count})`:'—'):shownInfluence(node)===null?'—':`${signed(Number(shownInfluence(node).toFixed(1)))}${project.settings.assessmentWeighting==='structural'?'*':edge?.count?` (${edge.count})`:''}`;
        const credenceCell = el('td', 'table-number', credenceText);
        const impactCell = el('td', 'table-number', impactText);
        credenceCell.title = ratings?.provenance || (lens.filtered ? t('lensFilteredHint') : t('profileBaselineNote'));
        impactCell.title = ratings?.provenance || (lens.filtered ? t('lensFilteredHint') : t('profileBaselineNote'));
        if (view.indexMode !== 'personal') {
          const impactStats = lens.filtered ? selectedEdge : edge;
          const statusTag = influenceStatusTag(impactStats);
          if (statusTag) impactCell.append(statusTag);
        }
        tr.append(credenceCell, impactCell,
          el('td', 'table-number table-index', (lens.filtered&&view.indexMode==='shared')?'—':resultText(node,score)));
      }
      const actions = el('td', 'table-actions');
      const count = (view.layers.comments ? (commentCounts.get(node.id) || 0) : 0) + (linkCounts.get(node.id) || 0);
      const more = el('button', 'btn quiet table-more', `${tableState.expandedId === node.id ? '▴' : '▾'} ${t(tableState.expandedId === node.id ? 'tableLess' : 'tableMore')}${count ? ` · ${count}` : ''}`);
      more.type = 'button';
      more.setAttribute('aria-expanded', String(tableState.expandedId === node.id));
      more.onclick = () => {
        selectedId = node.id;
        tableState.expandedId = tableState.expandedId === node.id ? null : node.id;
        render();
        $('argumentTableBody').querySelector(`.table-argument-row.selected .table-more`)?.focus({ preventScroll: true });
      };
      actions.append(more); tr.append(actions); body.append(tr);
      if (tableState.expandedId !== node.id) continue;
      const expanded = el('tr', 'table-expanded-row');
      const td = el('td', 'table-expanded-cell'); td.colSpan = columns;
      const detail = Table.assessmentDetails(project, node.id);
      if(lens.filtered){detail.reviews=detail.reviews.filter(v=>lens.userIds.has(v.userId));detail.impactReviews=detail.impactReviews.filter(v=>lens.userIds.has(v.userId));for(const item of detail.links)item.impactReviews=item.impactReviews.filter(v=>lens.userIds.has(v.userId));}
      const shell = el('div', 'table-detail-grid');
      const notes = [node.details || t('tableNoNotes')];
      if (view.layers.comments && detail.comments.length) {
        notes.push(...detail.comments.map(c => {
          return `${project.users.find(u=>u.id===c.authorId)?.name || c.authorName || t('tableUnknownUser')}: ${c.body}`;
        }));
      }
      shell.append(tableDetailCard(t('tableNotes'), notes));
      if (view.workflow === 'evaluate') {
        const values = [
          ['decision','group'].includes(node.kind) ? t('lensIndexExcluded')
            : detail.reviews.length ? `${t('tableReviewMean')}: ${(lens.filtered?lens.credence.get(node.id).mean:Core.getBaseConfidence(project,node).base).toFixed(1)} %`
            : lens.filtered ? `${t('tableColCredence')}: —` : `${t('tableColCredence')}: ${node.confidence} %`,
          node.parentId && !['option','group'].includes(node.relation)
            ? lens.filtered ? `${t('tableColInfluence')}: ${lens.impact.get(node.id)?.count ? signed(lens.impact.get(node.id).mean) : '—'}/5` : `${t('tableColInfluence')}: ${node.relation === 'oppose' ? '−' : '+'}${node.impact}/5`
            : t('tableNoInfluence'),
          ['decision','group'].includes(node.kind)||lens.filtered ? t('lensIndexExcluded') : `${t('tableColIndex')}: ${resultText(node,scores.get(node.id))}`, 
          t('tableIndexWarning')
        ];
        if (detail.reviews.length) values.push(`${t('tableDocumentCredence')}: ${node.confidence} %`);
        shell.append(tableDetailCard(t('tableEvaluations'), values));
      }
      if (detail.reviews.length || detail.impactReviews.length) {
        const values = [
          ...detail.reviews.map(r => `${r.name}: ${t('profileCredenceShort')} ${r.credence} %`),
          ...detail.impactReviews.map(r => `${r.name}: ${t('profileInfluenceShort')} ${signed(r.influence)}/5${r.stale ? ` · ${t('profileStale')}` : ''}`)
        ];
        shell.append(tableDetailCard(t('tableIndividual'), values));
      }
      if (detail.links.length) {
        shell.append(tableDetailCard(t('tableLinks'), detail.links.flatMap(link => [
          `${link.direction === 'outgoing' ? '↗' : '↙'} ${t(link.relation === 'support' ? 'supportWord' : 'opposeWord')} ${link.impact}/5 — ${link.otherTitle}`,
          ...link.impactReviews.map(r => `  ${r.name}: ${signed(r.influence)}/5${r.stale ? ` · ${t('profileStale')}` : ''}`)
        ])));
      }
      const open = el('button', 'btn quiet table-open-tree', t('tableOpenTree'));
      open.type = 'button';
      open.onclick = () => {
        selectedId = node.id;
        tableRevealId = node.id;
        if(view.depthLimit!==null){view.depthLimit=null;depthOverrides.clear();saveView();}
        const byId = new Map(project.nodes.map(item => [item.id, item]));
        for (let item = node; item; item = byId.get(item.parentId)) explicitlyClosedIds.delete(item.id);
        selectPresentation('tree');
        requestAnimationFrame(centerSelectedNode);
      };
      td.append(shell, open); expanded.append(td); body.append(expanded);
    }
    if (!rows.length) {
      const empty = el('tr'); const cell = el('td', 'table-empty', t('tableNoResults'));
      cell.colSpan = columns; empty.append(cell); body.append(empty);
    }
  }
  function renderViewControls() {
    $('viewPreset').value = currentPreset();
    $('dragFromText').checked = view.dragFromText;
    $('showSharedReasons').checked = view.showRecurringInTree;
    $('showAuthors').checked=project.settings.showAuthors!==false;
    const depthCompact=view.depthLimit!==null?view.depthCompact:view.compactVisible;
    $('btnCompactTree').textContent=t(depthCompact?'restoreManualLayout':'compactVisibleTree');
    $('btnCompactTree').setAttribute('aria-pressed',String(depthCompact));
    const maxDepth=Layout.maxTreeDepth(project.nodes);
    const range=$('treeDepthSlider');range.max=String(maxDepth);
    range.value=String(Math.min(view.depthLimit??maxDepth,maxDepth));
    $('treeDepthValue').textContent=view.depthLimit===null?t('treeDepthManual'):
      t('treeDepthPosition',{depth:Math.min(view.depthLimit,maxDepth),total:maxDepth});
    $('btnDepthReset').hidden=view.depthLimit===null;
    const opts=project.nodes.filter(n=>n.relation==='option'&&Core.childrenOf(project,n.id).length);
    $('btnCollapseOptions').hidden=project.mode!=='decision';
    $('btnCollapseOptions').disabled=!opts.length||(!canEdit()&&view.depthLimit===null);
    $('btnCollapseOptions').textContent=t(opts.some(n=>!isNodeCollapsed(n))?'collapseAllOptions':'expandAllOptions');
    $('btnCollapseOptions').title=t('collapseOptionsShortcut');
    $('viewDock').hidden=!!view.dockHidden;
    $('btnViewSettings').setAttribute('aria-expanded',String(!view.dockHidden));
    $('btnViewSettings').setAttribute('aria-pressed',String(!view.dockHidden));
    $('viewDock').classList.toggle('is-collapsed',!!view.dockCollapsed);
    $('btnDockCollapse').textContent=view.dockCollapsed?'▣':'−';
    $('btnDockCollapse').title=t(view.dockCollapsed?'dockRestore':'dockCollapse');
    $('btnDockCollapse').setAttribute('aria-expanded',String(!view.dockCollapsed));
    if(!view.dockHidden)requestAnimationFrame(placeViewDock);
    $('btnLayers').setAttribute('aria-expanded', String(view.layersOpen));
    $('layersPanel').hidden = !view.layersOpen;
    for (const input of document.querySelectorAll('input[data-layer]')) input.checked = !!view.layers[input.dataset.layer];
    $('linkLegend').hidden = !view.layers.links;
    for (const button of document.querySelectorAll('[data-focus]')) {
      const active = button.dataset.focus === view.focus.mode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    }
    const anchor = project.nodes.find(n => n.id === projection.anchorId);
    const isRoot = anchor.parentId === null;
    $('focusAnchorText').textContent = isRoot ? t('wholeTree') : anchor.title;
    $('focusAnchorText').title = t('startPoint', {name:anchor.title});
    $('focusSummary').textContent = view.focus.mode === 'all'
      ? t('focusIdle')
      : t('focusMatches',{kind:t(view.focus.mode==='support'?'focusSupport':'focusOppose'),count:projection.matches,peek:projection.peekIds.size});
  }

  function renderActorSelect() {
    for (const id of ['actorSelect', 'actorQuickSelect']) {
      const select = $(id);
      select.replaceChildren();
      for (const u of project.users) {
        const opt = el('option', '', u.name+(Core.isAIProfile(u)?' · AI':''));
        opt.value = u.id; select.append(opt);
      }
      const addOption=el('option','',t('profileAddLocalOption'));addOption.value='__add_local_user__';select.append(addOption);
      select.value = actorId;
      select.setAttribute('aria-label', t('profileSelect'));
      select.title = t('profileSelect');
    }
    $('btnPeople').title = t('profileManage');
  }
  function renderPerspectiveControls(){
    const select=$('indexModeSelect');
    select.replaceChildren();
    const add=(value,label)=>{const option=el('option','',label);option.value=value;select.append(option);};
    add('shared',t('indexShared')+(project.users.some(u=>Core.isAIProfile(u))?' · '+t('humanReviewOnly'):''));
    add('personal',t('indexPersonal')+' · '+(userProfile()?.name||''));
    for(const user of project.users.filter(u=>u.id!==actorId))
      add('assessor:'+user.id,(Core.isAIProfile(user)&&!/^AI\b/i.test(user.name)?'AI · ':'')+user.name);
    select.value=selectedPerspective();
    const aiProfiles=project.users.filter(Core.isAIProfile);
    $('btnAIResults').hidden=!aiProfiles.length;
    $('btnAIResults').textContent=t('aiAssessmentsButton')+(aiProfiles.length>1?' ('+aiProfiles.length+')':'');
    const banner=$('analysisPerspectiveBanner');
    const inspected=view.indexMode==='personal'?viewedAssessor():null;
    banner.hidden=!inspected||inspected.id===actorId;
    if(!banner.hidden){
      $('analysisPerspectiveLabel').textContent=t('viewingPerspective',{name:inspected.name})+' · '+t('editingAs',{name:userProfile().name});
      $('btnPerspectiveOwn').textContent=t('backToOwnReviews');
    }
    $('aiOptionHighlights').checked=!!view.highlightOptions;
    $('aiOptionHighlights').disabled=view.indexMode!=='personal'||project.mode!=='decision';
  }

  function renderOutline() {
    const nav = $('treeOutline');
    nav.replaceChildren();
    const focused = view.focus.mode !== 'all';
    const draw = (node, depth) => {
      if (!projection.visibleIds.has(node.id)) return;
      const button = el('button', 'outline-item');
      button.type = 'button';
      button.dataset.relation = displayedPrimaryRelation(node);
      button.style.paddingLeft = `${Math.min(12 + depth * 13, 62)}px`;
      if (node.id === selectedId) button.classList.add('active');
      if (focused) button.classList.add(projection.matchIds.has(node.id) ? 'focus-match' : projection.contextIds.has(node.id) ? 'focus-context' : 'focus-muted');
      const outlineText = el('span', 'outline-text', node.title);
      button.append(el('i', 'outline-marker'), outlineText);
      previewClaimOn(button, node, outlineText);
      const count = Core.childrenOf(project, node.id).length;
      if (count) button.append(el('span', 'outline-arrow', isNodeCollapsed(node) ? `▸${count}` : '▾'));
      button.onclick = () => selectNode(node.id);
      nav.append(button);
      for (const child of Core.childrenOf(project, node.id)) if (projection.visibleIds.has(child.id)) draw(child, depth + 1);
    };
    draw(Core.rootNode(project), 0);
  }
  function calculatePositions() {
    if(view.depthLimit!==null?view.depthCompact:view.compactVisible){
      const compact=Layout.compactVisibleProjection(project.nodes,projection.visibleIds,view.orientation,CARD_W,cardHeight());
      nodePositions=compact.positions;
      nodeDirections=compact.groups;
      return;
    }
    if (view.orientation === 'four-way') {
      const fourWay = Layout.fourWayProjection(project.nodes, Core.rootNode(project).id, CARD_W, cardHeight());
      const raw = fourWay.positions;
      nodePositions = new Map([...raw].map(([id, position]) => {
        const delta = view.fourWayOffsets[id] || {x:0,y:0};
        return [id, { x: position.x + (Number(delta.x)||0), y: position.y + (Number(delta.y)||0) }];
      }));
      nodeDirections = Layout.fourWayVisualDirections(project.nodes,Core.rootNode(project).id,nodePositions);
    } else { nodeDirections = new Map(); nodePositions = new Map(project.nodes.map(n => [n.id, Layout.viewPosition(n.position, view.orientation)])); }
  }
  function visualPosition(node) { return nodePositions.get(node.id) || Layout.viewPosition(node.position, view.orientation); }
  function depthOf(id) {
    const byId = new Map(project.nodes.map(n => [n.id, n]));
    let depth = 0;
    for (let node = byId.get(id); node?.parentId != null; node = byId.get(node.parentId)) depth++;
    return depth;
  }
  function showClaimPreview(node, target) {
    if (inlineEditorActive || document.querySelector('dialog[open]')) return;
    const preview = $('claimPreview');
    $('claimPreviewText').textContent = node.title;
    const parent = project.nodes.find(n => n.id === node.parentId);
    $('claimPreviewContext').textContent = parent ? `${t('parentNode')}: ${parent.title}` : relationLabel(node);
    preview.hidden = false;
    const r = target.getBoundingClientRect();
    const width = preview.offsetWidth, height = preview.offsetHeight;
    preview.style.left = `${Math.max(12, Math.min(window.innerWidth - width - 12, r.right + 12))}px`;
    preview.style.top = `${Math.max(12, Math.min(window.innerHeight - height - 12, r.top))}px`;
  }
  function hideClaimPreview() { $('claimPreview').hidden = true; }
  function previewClaimOn(element, node, textElement = element) {
    element.title = node.title; // native fallback for touch/assistive browser UIs
    const reveal = () => {
      // Only show the popover if the current view is actually truncating the text.
      if (textElement.scrollHeight > textElement.clientHeight + 2 || textElement.scrollWidth > textElement.clientWidth + 2) showClaimPreview(node,element);
    };
    element.addEventListener('pointerenter', reveal);
    element.addEventListener('pointerleave', hideClaimPreview);
    element.addEventListener('focus', reveal);
    element.addEventListener('blur', hideClaimPreview);
  }
  function renderNodes() {
    calculatePositions();
    const layer = $('nodesLayer');
    layer.replaceChildren();
    const h = cardHeight();
    const l = view.layers, focusing = view.focus.mode !== 'all';
    layer.style.setProperty('--card-height', `${h}px`);
    projection.nodes.forEach(node => {
      const nodeEl = el('article', 'node');
      nodeEl.dataset.id = node.id;
      nodeEl.dataset.relation = displayedPrimaryRelation(node);
      if (node.parentId === null) nodeEl.classList.add('is-root');
      if (importantNodeIds.has(node.id)) nodeEl.classList.add('important-reason');
      if (leadingOptionIds.has(node.id)) nodeEl.classList.add('ai-leading-option');
      const effect = importanceEffects.get(node.id);
      if (effect && view.showImportance) {
        nodeEl.dataset.importanceDelta = String(effect.delta);
      }
      if (view.indexMode==='personal'&&node.parentId&&!['option','group'].includes(node.relation)) {
        const direction=shownInfluence(node);
        nodeEl.classList.add(direction===null?'unassessed-reason':direction>0?'personal-support':direction<0?'personal-oppose':'personal-neutral');
      }
      if (node.sharedReasonId)nodeEl.classList.add('shared-use-node');
      if (node.reasonConceptId)nodeEl.classList.add('context-use-node');
      if (node.kind==='group')nodeEl.classList.add('option-group-node');
      if (Core.isGate(node))nodeEl.classList.add('semantic-gate');
      if (Core.isValue(node))nodeEl.classList.add('semantic-value');
      if (node.id === selectedId) nodeEl.classList.add('selected');
      if (h === 94) nodeEl.classList.add('text-only');
      if (focusing) {
        nodeEl.classList.add(projection.matchIds.has(node.id) ? 'focus-match'
          : node.id === projection.anchorId ? 'focus-anchor'
          : projection.contextIds.has(node.id) ? 'focus-context' : 'focus-muted');
        nodeEl.dataset.focusStance = view.focus.mode;
        if (projection.peekIds.has(node.id)) nodeEl.classList.add('focus-peek');
      }
      const position = visualPosition(node);
      nodeEl.style.left = `${position.x}px`;
      nodeEl.style.top = `${position.y}px`;
      nodeEl.tabIndex = node.id === selectedId ? 0 : -1;
      nodeEl.setAttribute('role', 'treeitem');
      nodeEl.setAttribute('aria-selected', String(node.id === selectedId));
      nodeEl.setAttribute('aria-level', String(depthOf(node.id) + 1));
      nodeEl.setAttribute('aria-label', `${relationLabel(node)}: ${node.title}${Core.isGate(node)?' · '+t('semanticGate'):''}${importantNodeIds.has(node.id)&&effect?' · '+importanceText(effect):''}`);
      const header = el('div', 'node-header');
      header.append(el('span', 'node-tag'+(l.labels?'':' compact-tag'), relationLabel(node)));
      if (node.sharedReasonId)header.append(el('small','shared-node-mark',t('sharedBadge')));
      if (node.reasonConceptId)header.append(el('small','shared-node-mark',t('contextBadge')));
      if (node.semanticType && node.semanticType!=='unspecified' && !node.sharedReasonId) header.append(el('small','node-semantic',t('semantic_'+node.semanticType)));
      const creator=project.users.find(u=>u.id===node.createdBy);
      if (creator && (Core.isAIProfile(creator)||(project.settings.showAuthors!==false && node.authorVisibility==='named')) && l.labels) {
        const author=el('small',Core.isAIProfile(creator)?'node-ai-author':'node-author',Core.isAIProfile(creator)?'AI':'✎');
        author.title=Core.isAIProfile(creator)?`${t('aiAuthored')}: ${creator.name}`:`${t('authoredBy')}: ${creator.name}`;
        header.append(author);
      }
      else header.append(el('span', 'node-grip', '⠿'));
      const childCount = Core.childrenOf(project, node.id).length;
      if (childCount) nodeEl.setAttribute('aria-expanded', String(!isNodeCollapsed(node)));
      // Double-click/F2 edits the label. Keeping a separate pencil button on
      // every node made the mapping workspace unnecessarily crowded.
      // Always-visible child actions: the target is explicit, not dependent
      // on whichever card happened to be selected earlier.
      for(const relation of ['support','oppose']) {
        const button=el('button',`node-add ${relation}`,relation==='support'?'+':'−');
        button.type='button';button.dataset.relation=relation;
        button.title=t(relation==='support'?'supportAdd':'opposeAdd')+' ('+displayShortcut(shortcuts[relation])+')';
        button.setAttribute('aria-label',t(relation==='support'?'supportAdd':'opposeAdd')+': '+node.title);
        button.disabled=!canEdit()||!!node.sharedReasonId||node.kind==='group';
        button.onclick=event=>{event.preventDefault();event.stopPropagation();addNode(relation,node.id);};
        header.append(button);
      }
      if(project.mode==='decision' && (node.parentId===null || node.kind==='group')){
        for (const [rel,marker,key] of [['option','*','optionAdd'],['group','▦','optionGroupAdd']]){
          const button=el('button',rel==='option'?'node-add option':'node-add group',marker);button.type='button';button.dataset.relation=rel;
          button.title=t(key);button.setAttribute('aria-label',t(key)+': '+node.title);
          button.disabled=!canEdit()||project.votingRound?.status==='open';
          button.onclick=event=>{event.preventDefault();event.stopPropagation();addNode(rel,node.id);};
          header.append(button);
        }
      }
      const collapse = el('button', 'node-collapse', isNodeCollapsed(node) ? '▸' : '▾');
      collapse.type = 'button';
      collapse.title = isNodeCollapsed(node) ? t(focusing?'branchPeek':'branchOpen') : t('branchClose');
      collapse.disabled = childCount === 0;
      collapse.onclick = event => { event.stopPropagation(); setSubtreeCollapsed(node.id); };
      header.append(collapse);
      header.onpointerdown = event => beginNodeDrag(event, header, node, nodeEl);
      const title = el('div', 'node-title', node.title);
      nodeEl.append(header, title);
      title.onpointerdown=event=>{if(view.dragFromText)beginNodeDrag(event,title,node,nodeEl);};
      previewClaimOn(nodeEl, node, title);
      if (effect && view.showImportance) nodeEl.title = node.title+' · '+importanceHint(effect);
      if (l.details && node.details) nodeEl.append(el('div', 'node-details', node.details));
      const meta = el('div', 'node-meta');
      const assessment = shownScore(node.id);
      const ratings=nodeAssessmentSnapshot(node);
      const chip = (label, value, cls, title) => {
        const item = el('span', `meta-chip ${cls || ''}`);
        item.append(el('span', 'meta-value', value), el('span', 'meta-name', label));
        if (title) item.title = title;
        meta.append(item);
      };
      if (l.index) chip(t('indexChip'), lens.filtered&&view.indexMode==='shared' ? '—' : resultText(node,assessment,0), 'meta-index', view.indexMode==='personal'?t('personalIndexExplain'):t('indexHint'));
      if (l.assessments && ratings) chip(t('assessmentSummaryShort'),ratings.value,
        'meta-assessment'+(ratings.averaging?' aggregated':'')+(ratings.filtered?' filtered':''),ratings.provenance);
      if (view.showImportance && importantNodeIds.has(node.id) && effect) chip('Δ',importanceShort(effect),'meta-marginal',importanceHint(effect));
      if (l.confidence && Core.truthAssessable(node)) chip(t('credenceChip'),
        ratings?.credence==null?'—':Number(ratings.credence.toFixed(0))+' %', '', ratings?.provenance||t('credenceHint'));
      if (l.impact && Core.assessmentFields(node).impact) chip(t('impactChip'),
        ratings?.impact==null?'—':signed(Number(ratings.impact.toFixed(1)))+'/5', '', ratings?.provenance||t('impactHint'));
      if (l.comments) chip(t('commentsChip'), `${(project.comments || []).filter(c => c.nodeId === node.id).length}`, '', t('commentsHint'));
      if (l.counts && childCount) chip(t('childrenChip'), `${childCount}`, '', t('childrenHint'));
      const linkCount = (project.links || []).filter(link => link.sourceId === node.id || link.targetId === node.id).length;
      if (l.links && linkCount) chip(t('linksChip'), String(linkCount), 'meta-links', t('linksHint'));
      if (meta.childElementCount) nodeEl.append(meta);
      nodeEl.addEventListener('dragover',event=>{
        if(!draggingLibraryReason || !canAttachLibraryReason(draggingLibraryReason,node.id))return;
        event.preventDefault();event.dataTransfer.dropEffect='copy';nodeEl.classList.add('repeat-drop-target');
      });
      nodeEl.addEventListener('dragleave',()=>nodeEl.classList.remove('repeat-drop-target'));
      nodeEl.addEventListener('drop',event=>{
        nodeEl.classList.remove('repeat-drop-target');
        if(!draggingLibraryReason)return;event.preventDefault();event.stopPropagation();
        attachLibraryReason(draggingLibraryReason,node.id);draggingLibraryReason=null;
      });
      nodeEl.onclick = event => {
        if (event.target.closest('button,textarea')) return;
        if (selectedId !== node.id || selectedLibraryReason) selectNode(node.id);
      };
      nodeEl.ondblclick = event => { if (!node.sharedReasonId && !node.reasonConceptId && !event.target.closest('button')) startInlineEdit(node.id); };
      nodeEl.oncontextmenu = event => {
        event.preventDefault();
        selectedId = node.id; render();
        openContextMenu(node.id, event.clientX, event.clientY);
      };
      nodeEl.onkeydown = event => {
        if (event.target !== nodeEl) return;
        if ((event.key === 'F2' || event.key === 'Enter') && !event.ctrlKey && !event.metaKey && !event.altKey) {
          event.preventDefault(); event.stopPropagation(); startInlineEdit(node.id); return;
        }
        if ((event.shiftKey && event.key === 'F10') || event.key === 'ContextMenu') {
          event.preventDefault(); event.stopPropagation();
          const rect = nodeEl.getBoundingClientRect();
          openContextMenu(node.id, rect.left + Math.min(60, rect.width), rect.top + 35); return;
        }
        if (Keyboard.NAV_KEYS.includes(event.key) && !event.altKey && !event.ctrlKey && !event.metaKey) {
          event.preventDefault(); event.stopPropagation();
          const navNodes=view.depthLimit===null?project.nodes:project.nodes.map(n=>({...n,collapsed:isNodeCollapsed(n)}));
          const next = Keyboard.navigate(navNodes, Core.rootNode(project).id, projection.visibleIds, node.id, event.key, view.orientation, nodePositions);
          if (next.action === 'select') selectNode(next.id, true);
          else if (next.action === 'expand' || next.action === 'collapse') {
            setSubtreeCollapsed(next.id, next.action === 'collapse');
            focusSelectedNode();
          }
        }
      };
      layer.append(nodeEl);
    });
    renderEdges();
  }
  function startInlineEdit(nodeId) {
    if(project.nodes.some(n=>n.id===nodeId && (n.sharedReasonId || n.reasonConceptId)))return;
    if (!canEdit()) return;
    if (inlineEditorActive) return;
    if (selectedId !== nodeId) selectNode(nodeId);
    const node = project.nodes.find(n => n.id === nodeId);
    const card = [...$('nodesLayer').querySelectorAll('.node')].find(n => n.dataset.id === nodeId);
    if (!node || !card) return;
    closeContextMenu(false);
    inlineEditorActive = true;
    const editor = el('textarea', 'node-inline-editor');
    editor.value = node.title;
    editor.maxLength = 200;
    editor.setAttribute('aria-label', t('editSelected'));
    editor.setAttribute('aria-multiline','true');
    card.dataset.editing = 'true';
    card.append(editor);
    const original = node.title;
    let done = false;
    function finish(save) {
      if (done) return;
      done = true;
      inlineEditorActive = false;
      const title = editor.value.trim();
      editor.remove(); delete card.dataset.editing;
      if (save && title && title !== original) {
        mutation(() => {project.nodes.find(n => n.id === nodeId).title = title;});
      }
      else render();
      focusSelectedNode();
    }
    editor.addEventListener('keydown', event => {
      event.stopPropagation();
      if (event.key === 'Escape') {event.preventDefault(); finish(false);}
      if (event.key === 'Enter' && !event.shiftKey) {event.preventDefault(); finish(true);}
    });
    editor.addEventListener('blur', () => queueMicrotask(() => finish(true)), {once:true});
    editor.addEventListener('pointerdown', event => event.stopPropagation());
    editor.focus(); editor.select();
  }
  function closeContextMenu(restoreFocus = true) {
    const menu = $('nodeContextMenu');
    if (!menu || menu.hidden) return;
    menu.hidden = true;
    menu.replaceChildren();
    contextNodeId = null;
    if (restoreFocus) focusSelectedNode();
  }
  function openContextMenu(nodeId, x, y) {
    closeContextMenu(false);
    const node = project.nodes.find(n => n.id === nodeId);
    if (!node) return;
    contextNodeId = nodeId;
    const menu = $('nodeContextMenu');
    const actions = [];
    const add = (label, action, disabled = false, danger = false, key = '') => actions.push({label, action, disabled, danger, key});
    add(t('editSelected'), () => startInlineEdit(nodeId), !canEdit()||!!node.sharedReasonId||!!node.reasonConceptId, false, 'F2');
    if(node.sharedReasonId)add(t('sharedDetach'),()=>mutation(()=>Core.detachSharedReason(project,node.id)),!canEdit());
    if(node.reasonConceptId)add(t('contextDetach'),()=>mutation(()=>Core.detachReasonConcept(project,node.id)),!canEdit());
    if(node.kind==='claim'&&node.parentId&&!node.sharedReasonId)
      add(t('repeatLinkOtherTargets'), () => reuseFromTreeNode(nodeId), !canEdit()&&!node.reasonConceptId);
    if((project.links||[]).some(link=>link.sourceId===nodeId||link.targetId===nodeId))
      add(t('repeatLegacyConnections'),()=>openLinksDialog(nodeId));
    add(t('supportAdd'), () => addNode('support', nodeId), !canEdit()||!!node.sharedReasonId||node.kind==='group', false, displayShortcut(shortcuts.support));
    add(t('opposeAdd'), () => addNode('oppose', nodeId), !canEdit()||!!node.sharedReasonId||node.kind==='group', false, displayShortcut(shortcuts.oppose));
    add(t('neutralAdd'),()=>addNode('neutral',nodeId),!canEdit()||!!node.sharedReasonId||node.kind==='group');
    if (project.mode === 'decision' && node.parentId === null) add(t('optionAdd'), () => addNode('option', nodeId), !canEdit(), false,displayShortcut(shortcuts.option));
    if (Core.childrenOf(project, nodeId).length) add(t(isNodeCollapsed(node) ? 'expandSubtree' : 'collapseSubtree'),
      () => setSubtreeCollapsed(nodeId), view.depthLimit===null&&!canEdit(), false, t('shortcutSpace'));
    if (node.parentId !== null) {
      add(t('moveSubtree'), () => openMoveDialog(nodeId), !canEdit());
      add(t('deleteSubtree'), () => deleteNode(nodeId), !canEdit(), true, 'Delete');
    }
    add(t('arrange'), arrangeTree, !canEdit(), false, displayShortcut(shortcuts.arrange));
    for (const item of actions) {
      const button = el('button', 'node-menu-action' + (item.danger ? ' danger' : ''));
      button.type = 'button'; button.setAttribute('role', 'menuitem');
      const title = el('span', 'node-menu-label', item.label);
      button.append(title);
      if (item.key) {
        const keyLabel = el('kbd', 'node-menu-shortcut', item.key);
        button.append(keyLabel);
        button.setAttribute('aria-label', `${item.label} (${item.key})`);
      }
      button.disabled = item.disabled;
      button.onclick = () => {closeContextMenu(false); item.action();};
      menu.append(button);
    }
    menu.hidden = false;
    menu.style.left = `${Math.min(Math.max(8, x), Math.max(8, window.innerWidth - 270))}px`;
    menu.style.top = `${Math.min(Math.max(8, y), Math.max(8, window.innerHeight - menu.offsetHeight - 8))}px`;
    menu.querySelector('button:not(:disabled)')?.focus();
  }
  async function deleteNode(nodeId) {
    const node = project.nodes.find(n => n.id === nodeId);
    if (!node || !node.parentId || !canEdit()) return;
    const count = Core.descendants(project, nodeId).length;
    if (!await askConfirm(t('deleteSubtreeConfirm',{title:node.title,count}), t('deleteSubtree'))) return;
    mutation(() => {
      // Re-find after the user confirms; don't retain a stale node object.
      const current = project.nodes.find(n => n.id === nodeId);
      if (!current?.parentId) throw Error(t('operationFailed'));
      selectedId = current.parentId;
      Core.removeSubtree(project,nodeId);
      tableRevealId = null;
      explicitlyClosedIds.delete(nodeId);
    });
    focusSelectedNode();
  }
  function openMoveDialog(nodeId) {
    const node = project.nodes.find(n => n.id === nodeId);
    if (!node?.parentId || !canEdit()) return;
    moveNodeId = nodeId;
    const select = $('moveTargetSelect'); select.replaceChildren();
    for (const parent of project.nodes.filter(n => Core.canReparent(project,nodeId,n.id))) {
      const option = el('option', '', parent.title); option.value=parent.id;
      select.append(option);
    }
    select.value = node.parentId;
    $('moveNodeDialog').showModal();
    select.focus();
  }
  function finishMove() {
    const id = moveNodeId, target = $('moveTargetSelect').value;
    $('moveNodeDialog').close(); moveNodeId = null;
    if (!id || !target || project.nodes.find(n=>n.id===id)?.parentId === target) return;
    mutation(() => Core.moveNode(project,id,target));
    focusSelectedNode();
  }

  function renderEdges() {
    const group = $('edgePaths');
    group.replaceChildren();
    const ids = projection.visibleIds;
    const byId = new Map(project.nodes.map(n => [n.id, n]));
    const h = cardHeight();
    const points = projection.nodes.map(n => visualPosition(n));
    if (points.length) {
      const minX = Math.min(...points.map(p => p.x)) - 180;
      const minY = Math.min(...points.map(p => p.y)) - 180;
      const maxX = Math.max(...points.map(p => p.x + CARD_W)) + 180;
      const maxY = Math.max(...points.map(p => p.y + h)) + 180;
      const svg = $('edges');
      svg.style.left = `${minX}px`; svg.style.top = `${minY}px`;
      svg.setAttribute('width', String(maxX - minX)); svg.setAttribute('height', String(maxY - minY));
      svg.setAttribute('viewBox', `${minX} ${minY} ${maxX - minX} ${maxY - minY}`);
    }
    projection.nodes.forEach(child => {
      if (!child.parentId || !ids.has(child.parentId)) return;
      const parent = byId.get(child.parentId);
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', Layout.edgeGeometry(parent, child, view.orientation, CARD_W, h, nodePositions, nodeDirections));
      path.setAttribute('class', `edge edge-${displayedPrimaryRelation(child)}`);
      if (view.indexMode==='personal') {
        const direction=shownInfluence(child);
        path.classList.add(direction===null?'edge-unassessed':direction>0?'edge-personal-support':direction<0?'edge-personal-oppose':'edge-personal-neutral');
        const title=document.createElementNS('http://www.w3.org/2000/svg','title');
        title.textContent=direction===null?t('personalNotAssessed'):`${t('personalInfluenceTitle')}: ${signed(direction)}/5`;
        path.append(title);
      }
      if (view.workflow === 'evaluate' && view.indexMode !== 'personal' && !['option','group'].includes(child.relation)) {
        const stats = lens.filtered ? lens.impact.get(child.id) : Core.influenceSummary(project,'primary',child.id);
        if (['contradictory','neutral','mixed-neutral'].includes(stats?.status)) {
          path.classList.add(`edge-review-${stats.status}`);
          const title = document.createElementNS('http://www.w3.org/2000/svg','title');
          title.textContent = `${t('influenceDistribution',stats)}. ${t(stats.status==='contradictory'?'influenceStatusContradictory':stats.status==='neutral'?'influenceStatusNeutral':'influenceStatusMixedNeutral')}`;
          path.append(title);
        }
      }
      if(importantNodeIds.has(child.id)) {
        path.classList.add('edge-important');
        const effect=importanceEffects.get(child.id);
        if (effect) {
          path.dataset.importanceDelta=String(effect.delta);
          let label=path.querySelector('title');
          if(!label){label=document.createElementNS('http://www.w3.org/2000/svg','title');path.append(label);}
          label.textContent += (label.textContent?' · ':'') + importanceHint(effect);
        }
      }
      if (view.focus.mode !== 'all') {
        path.classList.add(projection.matchIds.has(child.id) ? 'focus-match'
          : projection.contextIds.has(child.id) ? 'focus-context' : 'focus-muted');
        path.dataset.focusStance = view.focus.mode;
      }
      group.append(path);
    });
    // Secondary relations are a separate view layer. In focus mode the primary
    // tree remains authoritative; visible links are only shown as context.
    if (view.layers.links) for (const link of project.links || []) {
      if (!ids.has(link.sourceId) || !ids.has(link.targetId)) continue;
      const source = byId.get(link.sourceId), target = byId.get(link.targetId);
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', Layout.secondaryLinkPath(visualPosition(source), visualPosition(target), CARD_W, h));
      path.setAttribute('class', `edge edge-secondary edge-${link.relation}` +
        (view.focus.mode !== 'all' ? ' focus-muted' : '') +
        (selectedId === source.id || selectedId === target.id ? ' link-selected' : ''));
      path.setAttribute('marker-end', `url(#secondary-${link.relation}-arrow)`);
      path.dataset.linkId = link.id;
      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      title.textContent = `${source.title} → ${target.title} (${t(link.relation === 'support' ? 'supportWord' : 'opposeWord')}, ${link.impact}/5)`;
      path.append(title);
      group.append(path);
    }
  }
  function relationLabel(node) {
    if (node.relation === 'group') return t('optionGroupType');
    if (node.relation === 'option') return t('optionType');
    const direction=displayedPrimaryRelation(node);
    if (direction === 'support') return t('supportType');
    if (direction === 'oppose') return t('opposeType');
    if (direction === 'neutral') return t('neutralWord');
    return t(node.kind === 'decision' ? 'rootDecisionType' : 'rootClaimType');
  }
  function beginNodeDrag(event, header, node, nodeEl) {
    if (event.button !== 0 || event.target.closest('button')) return;
    // Preserve native clicks and double-clicks when the user starts on the
    // claim text. A drag is recognized only after movement crosses threshold.
    if (!header.classList.contains('node-title')) event.preventDefault();
    event.stopPropagation();
    selectedId = node.id;
    // Selecting a tree node must leave library-card inspection mode, including
    // clicks that start a potential drag on the node header.
    selectedLibraryReason=null;
    document.querySelectorAll('.node.selected').forEach(n => n.classList.remove('selected'));
    nodeEl.classList.add('selected');
    renderOutline(); renderInspector();
    if (!canEdit()) return;
    if(view.depthLimit!==null && view.depthCompact || view.compactVisible){showMessage(t('compactDragHint'));return;}
    const before = snapshot();
    const x = event.clientX, y = event.clientY;
    const original = visualPosition(node);
    const radialOriginalOffset = {...(view.fourWayOffsets[node.id] || {x:0,y:0})};
    let changed = false;
    header.setPointerCapture(event.pointerId);
    const move = e => {
      const dx = (e.clientX - x) / camera.scale, dy = (e.clientY - y) / camera.scale;
      if (Math.abs(dx) + Math.abs(dy) < 4 && !changed) return;
      changed = true;
      const next = { x: original.x + dx, y: original.y + dy };
      let shown;
      if (view.orientation === 'four-way') {
        const nextOffset = { x: radialOriginalOffset.x + next.x - original.x, y: radialOriginalOffset.y + next.y - original.y };
        view.fourWayOffsets[node.id] = nextOffset;
        shown = next;
      } else {
        const doc = Layout.documentPosition(next, view.orientation);
        node.position.x = Core.clamp(doc.x, -100000, 100000);
        node.position.y = Core.clamp(doc.y, -100000, 100000);
        shown = Layout.viewPosition(node.position, view.orientation);
      }
      nodePositions.set(node.id, shown);
      nodeEl.style.left = `${shown.x}px`;
      nodeEl.style.top = `${shown.y}px`;
      renderEdges();
    };
    const finish = () => {
      header.removeEventListener('pointermove', move);
      header.removeEventListener('pointerup', finish);
      header.removeEventListener('pointercancel', finish);
      if (changed) {
        if (view.orientation === 'four-way') {project.layout.fourWayOffsets={...view.fourWayOffsets}; project.updatedAt = new Date().toISOString();persist();saveView();}
        else { project.updatedAt = new Date().toISOString(); persist(); }
        history.record(before, snapshot());
      }
      // No rerender after an ordinary click: rebuilding the clicked card
      // between the first and second click prevented browser dblclick events.
      if (changed) render();
    };
    header.addEventListener('pointermove', move);
    header.addEventListener('pointerup', finish);
    header.addEventListener('pointercancel', finish);
  }

  function cameraApply() {
    // A focused inline editor must not silently scroll the transformed canvas.
    $('viewport').scrollLeft = 0; $('viewport').scrollTop = 0;
    $('world').style.transform = `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`;
    $('zoomLabel').textContent = `${Math.round(camera.scale * 100)} %`;
  }
  function fitViewport() {
    const visible = projection.nodes;
    const viewport = $('viewport');
    if (!visible.length || !viewport.clientWidth || !viewport.clientHeight) return;
    const positions = visible.map(n => visualPosition(n));
    const minX = Math.min(...positions.map(n => n.x));
    const minY = Math.min(...positions.map(n => n.y));
    const maxX = Math.max(...positions.map(n => n.x + CARD_W));
    const maxY = Math.max(...positions.map(n => n.y + cardHeight()));
    const gap = 100;
    camera.scale = Core.clamp(Math.min((viewport.clientWidth - gap) / (maxX - minX), (viewport.clientHeight - gap) / (maxY - minY)), 0.3, 1.15);
    camera.x = (viewport.clientWidth - (maxX - minX) * camera.scale) / 2 - minX * camera.scale;
    camera.y = (viewport.clientHeight - (maxY - minY) * camera.scale) / 2 - minY * camera.scale;
    cameraApply();
  }
  function zoomAround(nextScale, clientX, clientY) {
    const rect = $('viewport').getBoundingClientRect();
    const cx = clientX - rect.left, cy = clientY - rect.top;
    const worldX = (cx - camera.x) / camera.scale;
    const worldY = (cy - camera.y) / camera.scale;
    camera.scale = Core.clamp(nextScale, 0.25, 2);
    camera.x = cx - worldX * camera.scale;
    camera.y = cy - worldY * camera.scale;
    cameraApply();
  }
  function makeInputField(container, title, id, type, value, editable, onCommit, options = {}) {
    const field = el('div', 'field');
    const label = el('label', '', title);
    label.htmlFor = id;
    const output = options.output ? el('output', '', options.output) : null;
    if (output) label.append(output);
    field.append(label);
    const input = el(type === 'textarea' ? 'textarea' : type === 'select' ? 'select' : 'input');
    input.id = id;
    if (type !== 'textarea' && type !== 'select') input.type = type;
    input.disabled = !editable;
    // A range control rounds fractional values to the default integer step
    // when value is set before min/max/step. Apply constraints first.
    if (options.min !== undefined) input.min = String(options.min);
    if (options.max !== undefined) input.max = String(options.max);
    if (options.step !== undefined) input.step = String(options.step);
    input.value = value;
    if (options.maxLength !== undefined) input.maxLength = options.maxLength;
    if (options.autoGrow) {
      input.classList.add('field-autogrow');
      input.rows = 2;
      const resize = () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight + 2, 250)}px`; };
      input.addEventListener('input', resize);
      requestAnimationFrame(resize);
      input.addEventListener('keydown', event => {
        if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
          event.preventDefault(); input.blur();
        }
      });
    }
    if (type === 'select') for (const [key, text] of (options.choices || [])) {
      const opt = el('option', '', text); opt.value = key; input.append(opt);
    }
    if (type === 'select') input.value = value;
    if (output) input.addEventListener('input', () => { output.textContent = options.outputSuffix === undefined ? input.value : `${input.value}${options.outputSuffix}`; });
    input.addEventListener('change', () => onCommit(input.value));
    field.append(input); container.append(field);
    return input;
  }
  function renderSemanticInspector(container,node,edit) {
    if (node.kind === 'decision' || node.relation==='option') {
      if (node.relation==='option') {
        const gate=Core.optionFeasibility(project,node.id);
        const status=el('p',`feasibility ${gate.status}`,`${t('optionFeasibility')}: ${t('feasibility_'+gate.status)}`);
        status.title=gate.gates.map(g=>`${g.title}: ${t('feasibility_'+g.status)}`).join(' · ');
        container.append(status);
      }
      return;
    }
    container.append(el('div','section-divider'),el('h3','inspector-subheading',t('semanticHeading')));
    makeInputField(container,t('semanticType'),'nodeSemantic','select',node.semanticType||'unspecified',edit,async value=>{
      const removingCredence=['value','constraint','prerequisite'].includes(value) && !['value','constraint','prerequisite'].includes(node.semanticType);
      const removedVotes=removingCredence?project.votes.filter(v=>v.nodeId===node.id).length:0;
      if(removedVotes&&!await askConfirm(t('semanticDeleteRatings',{count:removedVotes}))){renderInspector();return;}
      mutation(()=>{
        node.semanticType=value;
        if(removedVotes)project.votes=project.votes.filter(v=>v.nodeId!==node.id);
        if(Core.isGate(node))node.constraintStatus=node.constraintStatus||'unknown';
        else delete node.constraintStatus;
      });
    },{choices:['unspecified','fact','assumption','value','constraint','prerequisite'].map(key=>[key,t('semantic_'+key)])});
    if(Core.isGate(node))makeInputField(container,t('constraintStatus'),'nodeConstraint','select',node.constraintStatus||'unknown',edit,value=>mutation(()=>{node.constraintStatus=value;}),{choices:['unknown','met','unmet'].map(k=>[k,t('feasibility_'+k)])});
    if(Core.isValue(node)||Core.isGate(node)) container.append(el('p','inline-warning',t('semanticNonFactual')));
    makeInputField(container,t('authorVisibility'),'nodeAuthorVisibility','select',node.authorVisibility||'named',edit,value=>mutation(()=>{node.authorVisibility=value;}),{choices:[['named',t('authorNamed')],['anonymous',t('authorAnonymous')]]});
    const author=project.users.find(u=>u.id===node.createdBy);
    container.append(el('p','inline-warning',node.authorVisibility==='anonymous'?t('anonymousExportWarning'):`${t('authoredBy')}: ${author?.name||'—'}`));
    container.append(el('h4','inspector-subheading',t('sourcesHeading')));
    for(const [idx,source] of (node.sources||[]).entries()) {
      const row=el('div','source-row');const link=el('a','source-link',source.url);link.href=source.url;link.target='_blank';link.rel='noopener noreferrer';
      row.append(link,el('small','',source.note));
      if(edit){const remove=el('button','btn quiet',t('removeSource'));remove.onclick=()=>mutation(()=>{node.sources.splice(idx,1);});row.append(remove);}
      container.append(row);
    }
    if(edit) {
      const form=el('div','source-add-form');
      const url=el('input');url.type='url';url.placeholder='https://…';url.maxLength=1000;url.setAttribute('aria-label',t('sourceUrl'));
      const note=el('input');note.placeholder=t('sourceNote');note.maxLength=500;note.setAttribute('aria-label',t('sourceNote'));
      const add=el('button','btn quiet',t('addSource'));add.onclick=()=>mutation(()=>{node.sources=node.sources||[];node.sources.push({url:url.value,note:note.value});});
      form.append(url,note,add);container.append(form);
    }
    const duplicate=Core.potentialEvidenceOverlap(project,node.id);
    if(duplicate.length){
      const warning=el('details','overlap-note');warning.append(el('summary','',t('overlapWarning',{count:duplicate.length})));
      for(const overlap of duplicate){
        const b=el('button','btn quiet',overlap.title+' · '+overlap.reasons.map(k=>t('overlap_'+k.replace('-','_'))).join(', '));
        b.onclick=()=>selectNode(overlap.nodeId);warning.append(b);
      }
      container.append(warning);
    }
  }
  function renderOptionValues(container, node) {
    const profile=Core.optionValueProfile(project,node.id,actorId);
    const section=el('section','value-profile');
    section.append(el('div','section-divider'),el('h3','inspector-subheading',t('valueProfileTitle')));
    if(!profile.items.length)section.append(el('p','inline-warning',t('valueProfileNone')));
    else {
      section.append(el('p','inspector-note',t('valueImpactSummary',{assessed:profile.assessed,count:profile.items.length})));
      const list=el('div','value-profile-list');
      for(const item of profile.items){
        const button=el('button','value-profile-row');button.type='button';
        const sign=item.impact??item.direction;
        const marker=el('strong',sign<0?'value-direction-oppose':sign===0?'value-direction-neutral':'value-direction-support',
          sign<0?'−':sign===0?'0':'＋');
        const content=el('span','value-profile-text');
        const mine=item.impact===null?t('notAssessed'):t('myImpactShort',{impact:signed(item.impact)});
        const group=item.summary.count?t('valueGroupSummary',{count:item.summary.count,positive:item.summary.positive,negative:item.summary.negative,neutral:item.summary.neutral,mean:signed(Number(item.summary.mean.toFixed(1)))}):t('notAssessed');
        content.append(el('span','',item.title),el('small','',mine+' · '+group+
          (item.indirect?' · '+t('valueIndirect'):'')+
          (item.source==='secondary'?' · '+t('valueProfileLink'):'')));
        button.append(marker,content);button.onclick=()=>selectNode(item.nodeId);
        const discord=influenceStatusTag(item.summary);if(discord)content.append(discord);
        list.append(button);
      }
      section.append(list);
    }
    section.append(el('p','inline-warning',t('valueImpactHelp')));
    container.append(section);
  }
  /* Decision context: compare the SAME relationship impact across options,
   * without adding a third importance slider or turning values into truth.
   */
  function renderDecisionValueMatrix(container) {
    const options=project.nodes.filter(n=>n.relation==='option');
    if(!options.length)return;
    const profiles=options.map(node=>Core.optionValueProfile(project,node.id,actorId));
    const ids=new Set(profiles.flatMap(p=>p.items.map(i=>i.nodeId)));
    if(!ids.size)return;
    const section=el('section','decision-value-matrix');
    section.append(el('div','section-divider'),el('h3','inspector-subheading',t('decisionCriteriaTitle')));
    section.append(el('p','inspector-note',t('decisionCriteriaHelp')));
    const scroll=el('div','decision-value-scroll');
    const table=el('table','decision-value-table');
    const head=el('tr');head.append(el('th','',t('decisionCriteriaName')));
    for(const option of options)head.append(el('th','',option.title));
    const thead=el('thead');thead.append(head);table.append(thead);
    const rows=el('tbody');
    const ordered=[...ids].map(id=>{
      const all=profiles.flatMap(p=>p.items.filter(i=>i.nodeId===id));
      return {id,rank:Math.max(0,...all.map(i=>i.summary.count?Math.abs(i.summary.mean):0))};
    }).sort((a,b)=>b.rank-a.rank || a.id.localeCompare(b.id));
    for(const row of ordered){
      const node=project.nodes.find(n=>n.id===row.id);if(!node)continue;
      const tr=el('tr');const title=el('th');
      const go=el('button','btn quiet',node.title);go.type='button';go.onclick=()=>selectNode(node.id);
      title.append(go);tr.append(title);
      options.forEach((option,index)=>{
        const cell=el('td');
        const entries=profiles[index].items.filter(i=>i.nodeId===row.id);
        for(const item of entries){
          const own=el('strong','',item.impact===null?'—':signed(item.impact)+'/5');
          const group=el('small','',item.summary.count?t('valueMean',{mean:signed(Number(item.summary.mean.toFixed(1))),count:item.summary.count}):t('notAssessed'));
          const status=influenceStatusTag(item.summary);cell.append(own,group);if(status)cell.append(status);
        }
        tr.append(cell);
      });
      rows.append(tr);
    }
    table.append(rows);scroll.append(table);section.append(scroll);container.append(section);
  }
  function renderInspector() {
    const container = $('inspector');
    container.replaceChildren();
    if (selectedLibraryReason) { renderLibraryInspector(container); return; }
    const node = project.nodes.find(n => n.id === selectedId);
    if (!node) return;
    const edit = canEdit() && !node.sharedReasonId, assessment = scores.get(node.id);
    container.append(el('p', 'inspector-note', `${relationLabel(node)} · ${t(node.parentId === null ? 'rootNote' : 'impactNote')}`));
    if(node.kind==='group') {
      container.append(el('p','inspector-note',t('optionGroupExplain')));
      makeInputField(container,t('claimTitle'),'nodeTitle','textarea',node.title,canEdit(),value=>mutation(()=>{node.title=value.trim()||node.title;}),{maxLength:200,autoGrow:true});
      makeInputField(container,t('claimDetails'),'nodeDetails','textarea',node.details,canEdit(),value=>mutation(()=>{node.details=value;}),{maxLength:5000});
      const choices=project.nodes.filter(n=>Core.canReparent(project,node.id,n.id)).map(n=>[n.id,n.title]);
      makeInputField(container,t('parentNode'),'nodeParent','select',node.parentId,canEdit(),value=>mutation(()=>Core.moveNode(project,node.id,value)),{choices});
      const info=el('p','inspector-note',t('optionGroupCount',{count:Core.descendants(project,node.id).filter(id=>project.nodes.find(n=>n.id===id)?.kind==='option').length}));
      container.append(info);
      for(const [relation,key] of [['group','optionGroupAdd'],['option','optionAdd']]){
        const button=el('button','btn quiet',t(key));button.type='button';button.disabled=!canEdit()||project.votingRound?.status==='open';button.onclick=()=>addNode(relation,node.id);container.append(button);
      }
      return;
    }
    if(node.kind==='claim' && node.parentId && !node.sharedReasonId){
      const button=el('button','btn primary repeat-from-node',t('repeatLinkOtherTargets'));
      button.type='button';button.disabled=!canEdit()&&!node.reasonConceptId;
      button.onclick=()=>reuseFromTreeNode(node.id);
      container.append(button);
      if(node.reasonConceptId)container.append(el('p','inspector-note',t('repeatPerTargetAssessments')));
    }
    if(node.reasonConceptId){
      const concept=Core.reasonConcept(project,node.reasonConceptId);
      const box=el('section','shared-locked-inspector');
      box.append(el('strong','',t('contextBadge')),el('p','',t('contextUseHelp',{name:concept?.title||''})),
        el('p','',t('repeatReviewContext',{target:project.nodes.find(n=>n.id===node.parentId)?.title||''})));
      const manage=el('button','btn quiet',t('contextManage'));manage.type='button';manage.onclick=()=>selectRepeatLibraryReason('concept',node.reasonConceptId);
      const detach=el('button','btn quiet',t('contextDetach'));detach.type='button';detach.disabled=!canEdit();detach.onclick=()=>mutation(()=>Core.detachReasonConcept(project,node.id));
      box.append(manage,detach);container.append(box);
    }
    if(node.sharedReasonId){
      const shared=Core.sharedReason(project,node.sharedReasonId);
      const box=el('section','shared-locked-inspector');
      box.append(el('strong','',t('sharedBadge')),el('p','',t('sharedLockedDetail',{confidence:shared.confidence,influence:signed(shared.influence)})));
      const manage=el('button','btn quiet',t('sharedManage'));manage.onclick=()=>selectRepeatLibraryReason('locked',node.sharedReasonId);
      const detach=el('button','btn quiet',t('sharedDetach'));detach.disabled=!canEdit();
      detach.onclick=()=>mutation(()=>Core.detachSharedReason(project,node.id));
      box.append(manage,detach);container.append(box);
    }
    makeInputField(container, t('claimTitle'), 'nodeTitle', 'textarea', node.title, edit && !node.reasonConceptId, value => mutation(() => {
      const normalized = value.replace(/\s+/g, ' ').trim();
      node.title = normalized || node.title;
    }), { maxLength: 200, autoGrow: true });
    makeInputField(container, t('claimDetails'), 'nodeDetails', 'textarea', node.details, canEdit() && !node.sharedReasonId, value => mutation(() => {
      node.details = value;
    }), { maxLength: 5000 });
    if(node.relation==='option')renderOptionValues(container,node);
    if(project.mode==='decision' && node.parentId===null)renderDecisionValueMatrix(container);
    if(project.mode==='decision' && (node.parentId===null||node.relation==='option')){
      const voteButton=el('button','btn quiet vote-entry',t('votingButton'));voteButton.onclick=openVoteDialog;container.append(voteButton);
    }
    if (node.parentId) {
      const allowedRelations = [['support', t('supportWord')], ['oppose', t('opposeWord')], ['neutral',t('neutralWord')]];
      const parent = project.nodes.find(n => n.id === node.parentId);
      if (project.mode === 'decision' && parent?.parentId === null) allowedRelations.push(['option', t('optionWord')]);
      // A current option that was created earlier stays visible when switching modes.
      if (node.relation === 'option' && !allowedRelations.some(r => r[0] === 'option')) allowedRelations.push(['option', t('previousOption')]);
      makeInputField(container, t('relationInitial'), 'nodeRelation', 'select', node.relation, canEdit() && !node.sharedReasonId && node.kind!=='option', value => mutation(() => {
        if (value === 'option' && (project.mode !== 'decision' || parent?.parentId !== null)) throw Error(t('optionOnlyRoot'));
        node.relation = value; node.kind = value === 'option' ? 'option' : 'claim';
        if(value==='neutral')node.impact=0;
      }), { choices: allowedRelations });
      const parentChoices = project.nodes.filter(n => Core.canReparent(project, node.id, n.id)).map(n => [n.id, n.title.slice(0, 44)]);
      makeInputField(container, t('parentNode'), 'nodeParent', 'select', node.parentId, canEdit() && !node.sharedReasonId, value => mutation(() => {
        Core.moveNode(project, node.id, value);
      }), { choices: parentChoices });
      if(node.kind==='claim'){
        const effective=shownInfluence(node);
        const direction=displayedPrimaryRelation(node);
        const display=effective===null?t('relationNoReview'):
          t('relationEffective',{direction:t(direction==='support'?'supportWord':direction==='oppose'?'opposeWord':'neutralWord'),impact:signed(effective)});
        const notice=el('p','relation-effective '+(effective===null?'unassessed':direction),display);
        notice.title=t('relationAssessorExplanation');
        container.append(notice);
      }
    }
    if (view.workflow !== 'evaluate') {
      const hint = el('div', 'assessment-discovery');
      hint.append(el('span', '', t('evaluationHint')));
      const go = el('button', 'btn quiet', t('evaluate'));
      go.type = 'button';
      go.onclick = () => {
        view.workflow = 'evaluate'; view.layers = {...LAYER_PRESETS.analysis, comments: true};
        saveView(); render();
        document.getElementById('nodeConfidence')?.focus();
      };
      hint.append(go); container.append(hint);
    }
    if (view.workflow === 'evaluate') {
    container.append(el('div', 'section-divider'), el('h3', 'inspector-subheading', t('assessmentSettings')));
    const inspected=view.indexMode==='personal' ? viewedAssessor():null;
    const otherPerspective=inspected && inspected.id!==actorId;
    if(otherPerspective){
      const claim=Core.personalCredence(project,node.id,inspected.id);
      const impact=node.parentId&&!['option','group'].includes(node.relation)?Core.personalInfluence(project,'primary',node.id,inspected.id):null;
      const block=el('div','viewed-assessment');
      block.append(el('strong','',t('viewingPerspective',{name:inspected.name})),
        el('p','',t('credenceChip')+': '+(claim?claim.confidence+' %':node.sharedReasonId?t('sharedFixedExplanation'):'—')),
        el('p','',t('impactChip')+': '+(impact?.current?signed(impact.record.influence)+'/5':node.sharedReasonId?t('sharedFixedExplanation'):'—')),
        el('small','',t('reviewReadOnly')));
      const go=el('button','btn quiet',t('backToOwnReviews'));
      go.type='button';go.onclick=()=>choosePerspective('personal');block.append(go);container.append(block);
    }else container.append(el('p', 'inspector-note', t('profileActive', { name: userProfile().name })));
    if (!otherPerspective && node.sharedReasonId)container.append(el('p','inspector-note',t('sharedFixedExplanation')));
    if (!otherPerspective && !node.sharedReasonId && Core.truthAssessable(node)) {
      const own = ownClaimAssessment(node.id);
      makeInputField(container, t('ownCredence'), 'nodeConfidence', 'range', own?.confidence ?? node.confidence, canEdit() && !node.sharedReasonId,
        value => mutation(() => Core.upsertVote(project, node.id, actorId, Number(value))),
        { min: 0, max: 100, step: 1, output: `${own?.confidence ?? node.confidence} %`, outputSuffix: ' %' });
      if (!own) container.append(el('p','inline-warning',t('profileSuggested')));
    }
    if (!otherPerspective && !node.sharedReasonId && node.parentId && node.relation !== 'option') {
      const own = ownPrimaryAssessment(node.id);
      const currentValue = own.current ? own.record.influence : Core.signedInfluence(node);
      makeInputField(container, t('profileInfluence'), 'nodeImpact', 'range', currentValue, canEdit() && !node.sharedReasonId,
        value => {view.indexMode='personal';view.viewAssessorId=null;saveView();mutation(() => Core.upsertEdgeAssessment(project, 'primary', node.id, actorId, Number(value)));},
        { min: -5, max: 5, step: 0.5, output: `${signed(currentValue)} / 5`, outputSuffix: ' / 5' });
      if (!own.current) container.append(el('p', 'inline-warning', own.record ? t('profileStale') : t('profileSuggested')));
    }
    const visibleReviewers=new Set(lens.userIds);
    if(otherPerspective)visibleReviewers.add(inspected.id);
    const allReviews = project.votes.filter(v => v.nodeId === node.id && visibleReviewers.has(v.userId));
    const allImpacts = node.parentId && !['option','group'].includes(node.relation) ? Core.currentInfluenceReviews(project, 'primary', node.id, true).filter(v=>visibleReviewers.has(v.userId)) : [];
    if (allImpacts.length) {
      const summary = Core.summarizeInfluenceReviews(allImpacts);
      const pattern = influenceStatusTag(summary);
      if (pattern) {
        const explanation = el('div','influence-status-inline');
        explanation.append(pattern,el('small','',t('influenceDistribution',summary)));
        container.append(explanation);
      }
    }
    if (allReviews.length || allImpacts.length) {
      const details = el('details', 'profile-review-list');
      details.append(el('summary', '', `${t('profileCompare')} · ${allReviews.length} / ${allImpacts.length}`));
      for (const u of project.users.filter(user=>visibleReviewers.has(user.id))) {
        const r = allReviews.find(v => v.userId === u.id);
        const e = allImpacts.find(v => v.userId === u.id);
        if (!r && !e) continue;
        details.append(el('p', '', `${u.name}: ${r ? `${r.confidence}%` : '—'} · ${e ? signed(e.influence)+'/5' : '—'}`));
      }
      container.append(details);
    }
    if(!lens.filtered || view.indexMode==='personal') {
    const personal=view.indexMode==='personal'?personalScores.get(node.id):null;
    const effective=view.indexMode==='personal'?personal:assessment;
    const hero = el('div', 'score-hero');
    const value = el('div', 'score-value', resultText(node,effective));
    value.append(el('small', '', t('indexScoreCaption')));
    hero.append(value, el('div', 'score-line', ''));
    const other=view.indexMode==='personal'?scores.get(node.id):Core.evaluateAssessor(project,actorId).get(node.id);
    hero.append(el('p','score-index-compare',t(view.indexMode==='personal'?'indexOtherShared':'indexOtherPersonal',
      {score:resultText(node,other)})));
    const scoreLine = hero.querySelector('.score-line');
    scoreLine.append(el('span', '', t(node.kind==='option'?'optionReferenceLevel':'baseCredence')), el('strong', '', effective?.base==null?'—':node.kind==='option'?'0':`${effective.base.toFixed(1)} %`));
    if (node.kind==='option') hero.append(el('p','score-index-compare',t('optionIndexNotTruth')));
    const changeLine = el('div', 'score-line');
    changeLine.append(el('span', '', t('childInfluence')), el('strong', '', effective?.delta==null?'—':balanceDeltaText(effective.delta)+' p'));
    hero.append(changeLine, el('div', 'score-explain', view.indexMode==='personal'?t('personalIndexExplain'):t('heuristicExplain')));
    if(effective?.base!=null && effective?.score!=null){
      const beforeClamp=effective.base+5*((effective.positive||0)-(effective.negative||0));
      if(beforeClamp>100+1e-9)hero.append(el('p','inline-warning',t('scoreCappedHigh')));
      if(beforeClamp<0-1e-9)hero.append(el('p','inline-warning',t('scoreCappedLow')));
    }
    const explanation = el('details', 'score-help');
    explanation.append(el('summary', '', t('indexQuestion')));
    explanation.append(el('p', '', t('indexExplain')));
    if(derivedResult(node,effective))explanation.append(el('p', '', t('indexHere',{base:balanceText(effective.base),delta:balanceDeltaText(effective.delta),score:balanceText(effective.score)})));
    hero.append(explanation);
    // Explain the displayed number using the same memoized calculation as the
    // graph. Never synthesize missing personal ratings from structural defaults.
    // Primary and secondary relationships each have traceable contributions.
    if (effective?.contributions?.length) {
      const breakdown=el('details','score-help score-breakdown');
      breakdown.append(el('summary','',t('scoreContributions')));
      const list=el('ul','score-contribution-list');
      for (const item of effective.contributions) {
        const source=project.nodes.find(n=>n.id===(item.sourceId||item.id));
        if(!source)continue;
        const missing=Boolean(item.missing);
        const impact=Object.hasOwn(item,'impact')?item.impact:(item.relation==='oppose'?-item.weight:item.weight);
        const rawStrength=view.indexMode==='personal'?item.score:item.strength;
        const magnitude=missing?'—':(item.magnitude??0).toFixed(2);
        const li=el('li','score-contribution');
        const effect=importanceEffects.get(item.id);
        if (effect && effect.parentId===node.id) {
          li.dataset.importanceDelta=String(effect.delta);
          li.title=importanceHint(effect);
        }
        const button=el('button','btn quiet',source.title);
        button.type='button';button.onclick=()=>item.subjectType==='secondary'?openLinksDialog(source.id,item.id):selectNode(source.id);
        const meta=el('small','',missing?t('personalIncomplete'):
          t('scoreContributionDetail',{impact:signed(impact),strength:rawStrength.toFixed(1),magnitude}));
        li.append(button,meta);
        if (effect && effect.parentId===node.id && !missing) {
          const difference=el('strong','reason-marginal',importanceText(effect));
          difference.title=importanceHint(effect);
          li.append(difference);
        }
        if(item.overlapWarning)li.append(el('small','link-route-note',t('linkOverlapWarning')));
        list.append(li);
      }
      breakdown.append(el('p','inspector-note',t('importanceTargetExplanation')),
        list,el('p','inline-warning',t('linkScoreNotice')));
      hero.append(breakdown);
    }
    if(effective?.incomplete)hero.append(el('p','inline-warning',t('personalIncomplete')));
    if(!derivedResult(node,effective))hero.append(el('p','inspector-note',t('resultNotDerived')));
    container.append(hero);
    } else container.append(el('p','inline-warning',t('lensIndexExcluded')));
    }
    const advanced=el('details','inspector-advanced');
    advanced.open=inspectorAdvancedOpen;
    advanced.ontoggle=()=>{inspectorAdvancedOpen=advanced.open;};
    advanced.append(el('summary','',t('nodeAdvanced')));
    const extras=el('div','inspector-advanced-content');
    extras.append(el('p','inspector-note',t('nodeAdvancedHelp')));
    renderSemanticInspector(extras,node,edit && !node.reasonConceptId);
    advanced.append(extras);
    container.append(advanced);
    // One relationship concept in the ordinary node inspector: the node's
    // primary relation and its other explicit uses. Legacy secondary edges
    // are still editable under details, not a competing creation workflow.
    if(node.kind==='claim'&&node.parentId&&node.reasonConceptId){
      const conceptUses=project.nodes.filter(n=>n.reasonConceptId===node.reasonConceptId);
      const section=el('section','repeat-node-connections');
      section.append(el('div','section-divider'),el('h3','inspector-subheading',t('repeatConnections',{count:conceptUses.length})));
      for(const use of conceptUses){
        const target=project.nodes.find(n=>n.id===use.parentId);
        const item=el('button','repeat-connection'+(use.id===node.id?' selected':''));
        item.type='button';
        const values=nodeAssessmentSnapshot(use);
        item.append(el('strong','',target?.title||'?'),el('small','',`${values?.value||'—'} · ${t('repeatOpenReview')}`));
        item.onclick=()=>{selectedLibraryReason=null;selectedId=use.id;view.workflow='evaluate';saveView();render();};
        section.append(item);
      }
      container.append(section);
    }
    const linked=(project.links||[]).filter(link=>link.sourceId===node.id||link.targetId===node.id);
    if(linked.length){
      const legacy=el('details','inspector-advanced repeat-legacy-links');
      legacy.append(el('summary','',t('repeatLegacyConnections')+` (${linked.length})`));
      for(const link of linked){
        const other=project.nodes.find(n=>n.id===(link.sourceId===node.id?link.targetId:link.sourceId));
        if(other)legacy.append(el('p','inline-link-summary',`${other.title} · ${signed(Core.signedLinkImpact(link))}/5`));
      }
      const button=el('button','btn quiet',t('repeatEditLegacyConnections'));button.type='button';
      button.onclick=()=>openLinksDialog(node.id);
      legacy.append(button);container.append(legacy);
    }
    container.append(el('div', 'section-divider'), el('h3', 'inspector-subheading', t('layerComments')));
    if (view.layers.comments) {
      const comments = (project.comments || []).filter(c => c.nodeId === node.id);
      if (!comments.length) container.append(el('p', 'inline-warning', t('commentsNone')));
      for (const comment of comments) {
        const row = el('div', 'witt-comment');
        row.append(el('small', '', (project.users.find(u=>u.id===comment.authorId)?.name || comment.authorName || t('tableUnknownUser')) + ' · ' + comment.createdAt.slice(0, 10)), el('p', '', comment.body));
        const del = el('button', 'btn quiet', t('deleteComment'));
        del.onclick = () => mutation(() => Core.deleteComment(project, comment.id));
        row.append(del); container.append(row);
      }
      const field = el('textarea'); field.id = 'newComment'; field.rows = 3;
      field.placeholder = t('commentPlaceholder');
      field.maxLength = 3000;
      const addButton = el('button', 'btn quiet', t('addComment'));
      addButton.onclick = () => mutation(() => Core.addComment(project, node.id, field.value, userProfile().name, actorId));
      container.append(field, addButton);
    } else {
      const reveal = el('button', 'btn quiet', t('commentsHidden'));
      reveal.onclick = () => { view.layers.comments = true; saveView(); render(); };
      container.append(reveal);
    }
    if (view.workflow === 'evaluate' && project.mode === 'decision' && node.parentId === null) {
      container.append(el('div', 'section-divider'), el('h3', 'inspector-subheading', t('optionsReview')));
      const ranking = el('div', 'ranking');
      const personal = view.indexMode === 'personal';
      const items = personal ? Core.decisionRankingForAssessor(project, viewedAssessorId(), personalScores) : Core.decisionRanking(project);
      for (const item of items) {
        const row = el('button', 'ranking-row');
        const feasible=item.feasibility;
        row.classList.add('option-'+feasible.status);
        if(leadingOptionIds.has(item.node.id))row.classList.add('ai-leading-option');
        const scoreLabel=feasible.status==='blocked'?'⛔':feasible.status==='unresolved'?'?':
          (personal && !item.complete)?'—':resultText(item.node,item,0);
        const incomplete=Boolean(item.incomplete);
        const valueProfile=Core.optionValueProfile(project,item.node.id,viewedAssessorId());
        const detail = item.node.title+' · '+t('feasibility_'+feasible.status) +
          (incomplete ? ' · '+t('personalRankingIncomplete') : '') +
          (valueProfile.values?' · '+t('valueProfileSummary',{assessed:valueProfile.assessed,count:valueProfile.values}):'');
        row.append(el('span','ranking-score',scoreLabel),el('span','ranking-label',detail));
        if(leadingOptionIds.has(item.node.id))row.append(el('small','ai-leader-tag',t('topRatedOption')));
        row.setAttribute('aria-label', scoreLabel+' · '+detail);
        row.onclick = () => { selectedId = item.node.id; render(); };
        ranking.append(row);
      }
      if (!ranking.childElementCount) ranking.append(el('p', 'inline-warning', t('optionsEmpty')));
      container.append(ranking, el('p', 'inline-warning', t('indexNotDecision')));
    }

  }
  let linkFocusId=null;
  function openLinksDialog(nodeId,focusId=null) {
    if (!project.nodes.some(n => n.id === nodeId)) return;
    linkNodeId = nodeId;linkFocusId=focusId;
    renderLinksDialog();
    $('linkDialog').showModal();
    if(focusId)requestAnimationFrame(()=>[...$('existingLinks').querySelectorAll('.link-row')]
      .find(e=>e.dataset.linkId===focusId)?.scrollIntoView({block:'nearest'}));
    else $('linkTarget').focus();
  }
  function renderLinksDialog() {
    const source = project.nodes.find(n => n.id === linkNodeId);
    if (!source) return;
    $('linkSourceTitle').textContent = source.title;
    const target = $('linkTarget');
    const oldSelection = target.value;
    target.replaceChildren();
    for (const node of project.nodes) if (Core.canAddLink(project, source.id, node.id)) {
      const option = el('option', '', node.title);
      option.value = node.id;
      target.append(option);
    }
    const hasTargets = !!target.options.length;
    if (!hasTargets) {
      const empty = el('option', '', t('noLinkTargets'));
      empty.value = ''; target.append(empty);
    }
    if ([...target.options].some(o => o.value === oldSelection)) target.value = oldSelection;
    const editable = canEdit();
    $('linkAdd').disabled = !editable || !hasTargets;
    $('linkImpact').disabled = !editable;
    $('linkImpactValue').textContent = signed(Number($('linkImpact').value));
    $('linkForm').hidden = true; // New relationships are context-specific recurring uses, not legacy cross-links.
    const list = $('existingLinks');
    list.replaceChildren();
    const links = (project.links || []).filter(l => l.sourceId === source.id || l.targetId === source.id);
    if (!links.length) list.append(el('p', 'inline-warning', t('noSecondaryLinks')));
    for (const link of links) {
      const origin = project.nodes.find(n => n.id === link.sourceId);
      const destination = project.nodes.find(n => n.id === link.targetId);
      const row = el('div', 'link-row');
      row.dataset.linkId=link.id;
      if(linkFocusId===link.id)row.classList.add('link-row-focused');
      row.append(el('div', 'link-direction', `${origin.title} → ${destination.title}`));
      const fields = el('div', 'link-fields');
      const value=el('input');value.type='range';value.min='-5';value.max='5';value.step='0.5';
      value.value=String(Core.signedLinkImpact(link));
      value.setAttribute('aria-label', t('linkSignedAxis'));value.disabled=!editable;
      const valueOutput=el('output','link-signed-output',signed(Core.signedLinkImpact(link)));
      value.oninput=()=>{valueOutput.textContent=signed(Number(value.value));};
      value.onchange=()=>mutation(()=>{
        const strength=Number(value.value);
        Core.updateSignedLink(project,link.id,strength);
        // This editor explicitly chose the new relation strength, so store
        // their current review; never reuse another person's review.
        Core.upsertEdgeAssessment(project,'secondary',link.id,actorId,strength);
      });
      const remove = el('button', 'btn danger', t('removeLink'));
      remove.disabled = !editable;
      remove.onclick = () => mutation(() => Core.removeLink(project, link.id));
      fields.append(value, valueOutput, remove);
      row.append(fields);
      const own = Core.personalInfluence(project, 'secondary', link.id, actorId);
      const ownLabel = el('label', 'profile-link-label', `${t('profileInfluence')} · ${userProfile().name}`);
      const ownValue = el('input'); ownValue.type = 'number'; ownValue.min = '-5'; ownValue.max = '5'; ownValue.step = '0.5';
      ownValue.value = String(own.current ? own.record.influence : own.relation.suggestedInfluence);
      ownValue.disabled = !editable;
      ownValue.setAttribute('aria-label', `${t('profileInfluence')} · ${userProfile().name}`);
      ownValue.onchange = () => mutation(() => Core.upsertEdgeAssessment(project, 'secondary', link.id, actorId, Number(ownValue.value)));
      ownLabel.append(ownValue); row.append(ownLabel);
      const summary = Core.influenceSummary(project, 'secondary', link.id);
      row.append(el('small', 'profile-link-hint', summary.count
        ? `${t('profileMean')}: ${signed(Number(summary.mean.toFixed(1)))} / 5 · ${summary.count}`
        : t('profileSuggested')));
      const linkTag = influenceStatusTag(summary);
      if (linkTag) row.append(linkTag);
      if (own.record && !own.current) row.append(el('small', 'profile-stale', t('profileStale')));
      if(Core.secondaryOverlapWarning(project,link))
        row.append(el('p','link-route-note',t('linkOverlapWarning')));
      list.append(row);
    }
  }
  function renderPreference(container, node) {
    if(node.relation!=='option')return;
    const row=el('div','inspector-actions');
    const button=el('button','btn quiet vote-entry',t('votingButton'));
    button.type='button';button.onclick=openVoteDialog;row.append(button);container.append(row);
  }
  function openVoteDialog(){
    if(project.mode!=='decision')return;
    ballotDrafts.clear();renderVoteDialog();$('voteDialog').showModal();
  }
  function renderVoteDialog(){
    const round=project.votingRound;
    const owner=isOwner(),open=round?.status==='open',closed=round?.status==='closed';
    $('voteSettings').hidden=!!round&&!closed;
    $('voteWeightsHint').hidden=!!round&&!closed;
    $('voteWeighting').value=project.settings.voteWeighting;
    $('btnVotePeople').hidden=!!round&&!closed;
    $('btnVoteStart').hidden=!!round&&!closed;$('btnVoteStart').disabled=!owner;
    $('btnVoteEnd').hidden=!open;$('btnVoteEnd').disabled=!owner;
    $('voteRoundStatus').textContent=t(!round?'voteStatusDraft':open?'voteStatusOpen':'voteStatusClosed');
    const list=$('voteBallotList');list.replaceChildren();
    const options=project.nodes.filter(n=>n.relation==='option');
    const computedScores=Core.evaluate(project);
    const canVote=open&&!Core.isAIProfile(userProfile())&&canEdit();
    if(!round){
      list.append(el('p','inspector-note',t('voteStartHint')));
      for(const option of options){
        const preview=el('p','vote-argument-result',t('voteArgumentResult',{score:resultText(option,computedScores.get(option.id))}));
        preview.prepend(el('strong','',option.title+' · '));
        preview.title=t('voteArgumentResultHint');
        list.append(preview);
      }
    }
    if(round){
      for(const option of options.filter(n=>round.optionIds.includes(n.id))){
        const row=el('div','vote-option-row');
        const label=el('label','',option.title);
        const computed=computedScores.get(option.id);
        const context=el('small','vote-argument-result',t('voteArgumentResult',{score:resultText(option,computed)}));
        context.title=t('voteArgumentResultHint');
        const current=project.ballots.find(b=>b.optionId===option.id&&b.userId===actorId);
        const input=el('input');input.type='range';input.min='0';input.max='100';input.step='1';
        const hasDraft=ballotDrafts.has(option.id);
        input.value=String(hasDraft?ballotDrafts.get(option.id):current?.preference??50);input.disabled=!canVote;
        input.id='vote-'+option.id;label.htmlFor=input.id;
        const output=el('output','',hasDraft?input.value+'/100 · '+t('voteDraftUnsaved'):
          current?String(current.preference)+'/100':t('notAssessed'));
        input.oninput=()=>{ballotDrafts.set(option.id,Number(input.value));output.textContent=input.value+'/100 · '+t('voteDraftUnsaved');};
        const buttons=el('div','vote-option-actions');
        const save=el('button','btn primary',t('voteSave'));
        save.disabled=!canVote;save.onclick=()=>{
          const old=ballotDrafts.get(option.id);ballotDrafts.delete(option.id);
          if(!mutation(()=>Core.upsertBallot(project,option.id,actorId,Number(input.value)))){
            if(old!==undefined)ballotDrafts.set(option.id,old);renderVoteDialog();
          }
        };
        const remove=el('button','btn quiet',t('voteRetract'));
        remove.disabled=!canVote||!current;remove.onclick=()=>{
          const old=ballotDrafts.get(option.id);ballotDrafts.delete(option.id);
          if(!mutation(()=>Core.removeBallot(project,option.id,actorId))){
            if(old!==undefined)ballotDrafts.set(option.id,old);renderVoteDialog();
          }
        };
        buttons.append(save,remove);row.append(label,context,input,output,buttons);list.append(row);
      }
    }
    const results=$('voteResults');results.replaceChildren();
    if(!round)results.append(el('p','inspector-note',t('voteStartHint')));
    else if(open && round.hideResults)results.append(el('p','vote-sealed',t('voteResultsHidden')));
    else {
      const explanation=el('p','inspector-note',t('voteCalculation',{mode:t(round.weighting==='shares'?'voteShares':'voteEqual')}));
      results.append(explanation);
      for(const option of options.filter(n=>round.optionIds.includes(n.id))){
        const row=Core.optionPreference(project,option.id);
        const box=el('div','vote-result-row');
        box.append(el('strong','',option.title),el('span','',row.preferenceScore===null?'—':row.preferenceScore.toFixed(1)+'/100'));
        box.append(el('small','',t('voteResultDetails',{count:row.preferenceVoters,weight:row.preferenceTotalPower,sum:row.weightedSum.toFixed(1)})));
        results.append(box);
      }
      if(!round.anonymous){
        const details=el('details','vote-by-person');details.append(el('summary','',t('voteIndividual')));
        for(const ballot of project.ballots){
          const name=project.users.find(u=>u.id===ballot.userId)?.name||'—';
          const option=project.nodes.find(n=>n.id===ballot.optionId)?.title||'—';
          details.append(el('p','',`${name}: ${option} · ${ballot.preference}/100`));
        }
        results.append(details);
      }
    }
    const oldRounds=$('voteHistoryRows');oldRounds.replaceChildren();
    const history=project.voteHistory||[];
    $('voteHistoryDetails').hidden=!history.length;
    for(const entry of history.slice().reverse()){
      const item=el('section','vote-archive');
      item.append(el('strong','',t('votePreviousRound')+' · '+entry.round.closedAt.slice(0,16)));
      for(const optionId of entry.round.optionIds){
        const score=Core.optionPreferenceForRound(entry.round,entry.ballots,optionId);
        const title=entry.titleByOption[optionId]||'—';
        item.append(el('p','',`${title}: ${score.preferenceScore===null?'—':score.preferenceScore.toFixed(1)+'/100'} · ${t('voteResultDetails',{count:score.preferenceVoters,weight:score.preferenceTotalPower,sum:score.weightedSum.toFixed(1)})}`));
      }
      oldRounds.append(item);
    }
    const audit=$('voteAuditRows');audit.replaceChildren();
    if(open&&round.hideResults)audit.append(el('p','inspector-note',t('voteResultsHidden')));
    else for(const event of project.voteAudit||[]){
      const name=round?.anonymous?t('voteAnonymousActor'):(project.users.find(u=>u.id===event.userId)?.name||'—');
      audit.append(el('p','',`${event.at.slice(0,16)} · ${t('voteEvent_'+event.action)} · ${name}`));
    }
  }
  async function startVotingFromUI(){
    if(!isOwner())return;
    const anonymous=$('voteAnonymous').checked,hideResults=$('voteHideResults').checked;
    if(project.votingRound?.status==='closed' && !await askConfirm(t('voteStartNewConfirm')))return;
    if(!project.votingRound && project.ballots.length && !await askConfirm(t('voteOldBallotsIncluded')))return;
    const previous=new Map(ballotDrafts);ballotDrafts.clear();
    if(!mutation(()=>Core.startVotingRound(project,{anonymous,hideResults}))){
      for(const [id,value] of previous)ballotDrafts.set(id,value);
      renderVoteDialog();
    }
  }
  async function endVotingFromUI(){
    if(!isOwner()||!await askConfirm(t('voteEndConfirm')))return;
    const previous=new Map(ballotDrafts);ballotDrafts.clear();
    if(!mutation(()=>Core.closeVotingRound(project,actorId))){
      for(const [id,value] of previous)ballotDrafts.set(id,value);
      renderVoteDialog();
    }
  }
  function addNode(relation, parentId = selectedId) {
    if(!canEdit()) {showMessage(t('viewerCannotEdit'));return;}
    // Four-direction layout is a projection, not a document coordinate system.
    // Preserve all visible positions before adding so the target never jumps
    // out from under the mouse. Only the new claim is positioned in nearby space.
    let radialSnapshot=null;
    if(view.depthLimit!==null){view.depthLimit=null;depthOverrides.clear();saveView();calculatePositions();}
    if(view.compactVisible){view.compactVisible=false;saveView();calculatePositions();}
    if(view.orientation==='four-way') {
      if(nodePositions.size!==project.nodes.length)calculatePositions();
      radialSnapshot={positions:new Map(nodePositions),directions:new Map(nodeDirections)};
    }
    let newNodeId = null;
    selectedId = parentId;
    if (mutation(() => {newNodeId = Core.addChild(project, parentId, relation, actorId).id; selectedId = newNodeId;}, {
      afterValidate: radialSnapshot ? () => {
        const baseline=Layout.fourWayProjection(project.nodes,Core.rootNode(project).id,CARD_W,cardHeight());
        const stable=Layout.stableFourWayAddition(project.nodes,radialSnapshot.positions,radialSnapshot.directions,baseline.positions,parentId,newNodeId,CARD_W,cardHeight());
        view.fourWayOffsets=Object.fromEntries([...stable].map(([id,pos])=>{
          const base=baseline.positions.get(id);
          return [id,{x:pos.x-base.x,y:pos.y-base.y}];
        }));
        project.layout.fourWayOffsets={...view.fourWayOffsets};
        saveView();
      } : null
    })) startInlineEdit(newNodeId);
  }

  // A reusable reason is a concept in the side shelf, not an invisible modal command.
  // Its instances remain primary claims so the existing GRACE scoring and
  // per-assessor relationship reviews stay unchanged.
  function findLibraryReason(selection){
    return selection?.type==='concept'?Core.reasonConcept(project,selection.id)
      :selection?.type==='locked'?Core.sharedReason(project,selection.id):null;
  }
  function canAttachLibraryReason(selection,targetId){
    const reason=findLibraryReason(selection),parent=project.nodes.find(node=>node.id===targetId);
    if(!reason || !parent || !canEdit() || !['claim','option'].includes(parent.kind) || !!parent.sharedReasonId ||
      (selection.type==='concept' && parent.reasonConceptId===selection.id))return false;
    if(selection.type==='concept')return Core.canAttachReasonConcept(project,selection.id,targetId);
    return !project.nodes.some(n=>n.parentId===targetId&&n.sharedReasonId===selection.id);
  }
  function attachLibraryReason(selection,targetId){
    if(!canAttachLibraryReason(selection,targetId)){
      showMessage(t('repeatInvalidTarget'));return false;
    }
    let useId=null;
    const ok=mutation(()=>{
      const use=selection.type==='concept'?Core.attachReasonConcept(project,selection.id,targetId,actorId)
        :Core.attachSharedReason(project,selection.id,targetId,actorId);
      useId=use.id;
      // An attachment is an explicit request to see the new relationship.
      // Open saved collapsed ancestors in the same undoable mutation.
      const byId=new Map(project.nodes.map(node=>[node.id,node]));
      for(let node=byId.get(targetId);node;node=byId.get(node.parentId))node.collapsed=false;
    });
    if(ok){
      selectedLibraryReason=null;selectedId=useId;view.workflow='evaluate';
      // Attaching must make the new use visible now. Explicit hiding remains
      // available afterwards, but never create an apparently missing node.
      view.showRecurringInTree=true;
      view.presentation='tree';
      view.depthLimit=null;depthOverrides.clear();
      view.compactVisible=false;
      view.focus.mode='all';
      for(let node=project.nodes.find(n=>n.id===useId);node;node=project.nodes.find(n=>n.id===node.parentId))
        explicitlyClosedIds.delete(node.id);
      saveView();render();
      requestAnimationFrame(()=>centerTreeNode(useId));
    }
    return ok;
  }
  function centerTreeNode(nodeId){
    if(!projection?.visibleIds?.has(nodeId))return;
    const node=project.nodes.find(n=>n.id===nodeId);
    const viewport=$('viewport');
    if(!node||!viewport?.clientWidth||!viewport.clientHeight)return;
    const point=visualPosition(node);
    camera.x=viewport.clientWidth/2-(point.x+CARD_W/2)*camera.scale;
    camera.y=viewport.clientHeight/2-(point.y+cardHeight()/2)*camera.scale;
    cameraApply();
  }
  function reuseFromTreeNode(nodeId){
    const source=project.nodes.find(n=>n.id===nodeId);
    if(!source||source.kind!=='claim'||!source.parentId||source.sharedReasonId){
      showMessage(t('repeatInvalidTarget'));return false;
    }
    let concept=source.reasonConceptId?Core.reasonConcept(project,source.reasonConceptId):null;
    if(!concept){
      if(!canEdit())return false;
      if(!mutation(()=>{concept=Core.promoteReasonConcept(project,nodeId);} ))return false;
    }
    selectedId=nodeId;
    selectedLibraryReason={type:'concept',id:concept.id};
    zones.left=true;try{storage.setItem(ZONE_STORAGE,JSON.stringify(zones));}catch(_){}
    repeatPaneOpen=true;
    view.presentation='tree';
    view.showRecurringInTree=true;
    saveView();render();
    requestAnimationFrame(()=>document.querySelector('#inspector select#repeatAttachTarget')?.focus({preventScroll:true}));
    return true;
  }
  function openRepeatLibrary(){
    repeatPaneOpen=true;
    // Mobile starts with the left zone collapsed. Opening a library from a
    // menu must reveal the panel, rather than activate invisible content.
    zones.left=true;try{storage.setItem(ZONE_STORAGE,JSON.stringify(zones));}catch(_){}
    if(view.presentation!=='tree')view.presentation='tree';
    render();
  }
  function selectRepeatLibraryReason(type,id){
    if(type==='linked-node'){
      const node=project.nodes.find(n=>n.id===id);
      if(!node || (node.parentId?1:0)+project.links.filter(l=>l.sourceId===id).length<2)return;
    } else if(!findLibraryReason({type,id}))return;
    selectedLibraryReason={type,id};repeatPaneOpen=true;
    zones.left=true;try{storage.setItem(ZONE_STORAGE,JSON.stringify(zones));}catch(_){}
    render();
  }
  function renderRepeatLibrary(){
    const workspace=$('workspaceMain');
    workspace.classList.toggle('repeat-library-open',repeatPaneOpen);
    $('outlinePane').hidden=repeatPaneOpen;
    $('repeatLibraryPane').hidden=!repeatPaneOpen;
    $('btnOutlineTab').classList.toggle('active',!repeatPaneOpen);
    $('btnRepeatTab').classList.toggle('active',repeatPaneOpen);
    $('btnOutlineTab').setAttribute('aria-pressed',String(!repeatPaneOpen));
    $('btnRepeatTab').setAttribute('aria-pressed',String(repeatPaneOpen));
    if(!repeatPaneOpen)return;
    const selected=project.nodes.find(n=>n.id===selectedId);
    $('btnRepeatPromote').disabled=!canEdit()||!selected||selected.kind!=='claim'||!selected.parentId||
      !!selected.reasonConceptId||!!selected.sharedReasonId||!['claim','option'].includes(project.nodes.find(n=>n.id===selected.parentId)?.kind);
    const list=$('repeatCards');list.replaceChildren();
    const records=[...(project.reasonConcepts||[]).map(r=>({type:'concept',reason:r})),
      ...(project.sharedReasons||[]).map(r=>({type:'locked',reason:r}))];
    for(const {type,reason} of records){
      const uses=project.nodes.filter(n=>type==='concept'?n.reasonConceptId===reason.id:n.sharedReasonId===reason.id);
      const card=el('button','repeat-card'+(selectedLibraryReason?.type===type&&selectedLibraryReason.id===reason.id?' selected':''));
      card.type='button';card.setAttribute('role','listitem');card.dataset.reasonType=type;card.dataset.reasonId=reason.id;
      card.draggable=canEdit();card.title=t('repeatDragHint');
      card.append(el('span','repeat-card-tag',type==='locked'?t('repeatLocked'):t('repeatIndependent')),
        el('strong','repeat-card-name',reason.title),
        el('small','repeat-card-foot',t('repeatConnectionCount',{count:uses.length})));
      card.onclick=()=>selectRepeatLibraryReason(type,reason.id);
      card.addEventListener('dragstart',event=>{
        draggingLibraryReason={type,id:reason.id};event.dataTransfer.effectAllowed='copy';
        event.dataTransfer.setData('text/plain','witt-reason:'+type+':'+reason.id);
        card.classList.add('dragging');
      });
      card.addEventListener('dragend',()=>{draggingLibraryReason=null;card.classList.remove('dragging');
        document.querySelectorAll('.repeat-drop-target').forEach(e=>e.classList.remove('repeat-drop-target'));
      });
      list.append(card);
    }
    if(!records.length)list.append(el('p','repeat-empty',t('repeatEmpty')));
    const links=project.links||[];
    const multi=$('repeatMultiCards');multi.replaceChildren();
    const multiNodes=project.nodes.filter(n=>n.kind==='claim'&&!n.reasonConceptId && (n.parentId?1:0)+links.filter(l=>l.sourceId===n.id).length>=2);
    for(const node of multiNodes){
      const linked=links.filter(l=>l.sourceId===node.id),count=linked.length+(node.parentId?1:0);
      const card=el('button','repeat-card'+(selectedLibraryReason?.type==='linked-node'&&selectedLibraryReason.id===node.id?' selected':''));
      card.type='button';card.dataset.nodeId=node.id;card.setAttribute('role','listitem');
      card.append(el('span','repeat-card-tag',t('multiUseTag')),el('strong','repeat-card-name',node.title),
        el('small','repeat-card-foot',t('repeatConnectionCount',{count})));
      card.onclick=()=>selectRepeatLibraryReason('linked-node',node.id);
      multi.append(card);
    }
    if(!multiNodes.length)multi.append(el('p','repeat-empty',t('repeatNoConnections')));
    $('repeatMultiUse').hidden=!multiNodes.length;
    $('repeatCrossLinks').hidden=!links.length;
    $('repeatSecondaryCount').textContent=String(links.length);
    const secondaryCards=$('repeatSecondaryCards');secondaryCards.replaceChildren();
    if(!links.length)secondaryCards.append(el('p','repeat-empty',t('noSecondaryLinks')));
    for(const link of links){
      const source=project.nodes.find(n=>n.id===link.sourceId);
      const target=project.nodes.find(n=>n.id===link.targetId);
      if(!source||!target)continue;
      const card=el('button','repeat-link-card');card.type='button';card.dataset.linkId=link.id;
      card.setAttribute('role','listitem');
      card.append(el('span','repeat-link-indicator',signed(Core.signedLinkImpact(link))),
        el('span','repeat-link-source',source.title),el('span','repeat-link-arrow','→'),
        el('span','repeat-link-target',target.title));
      if(Core.secondaryOverlapWarning(project,link))card.classList.add('has-route-note');
      card.title=t('linkShelfOpen');
      card.onclick=()=>openLinksDialog(source.id,link.id);
      secondaryCards.append(card);
    }
  }
  function renderLibraryInspector(container){
    const selection=selectedLibraryReason;
    if(selection?.type==='linked-node'){
      const source=project.nodes.find(n=>n.id===selection.id);
      if(!source){selectedLibraryReason=null;return;}
      container.append(el('p','repeat-inspector-kicker',t('multiUseTag')),
        el('h3','repeat-inspector-title',source.title),
        el('p','inspector-note',t('multiUseIntro')),
        el('h3','inspector-subheading',t('multiUseConnections')));
      if(source.parentId){
        const parent=project.nodes.find(n=>n.id===source.parentId);
        const row=el('button','repeat-connection');row.type='button';
        const own=Core.personalInfluence(project,'primary',source.id,actorId);
        row.append(el('strong','',`${t('multiUsePrimary')} → ${parent?.title||'?'}`),
          el('small','',`${own?.current?signed(own.record.influence):'—'} / 5 · ${t('multiUseOpen')}`));
        row.onclick=()=>{selectedLibraryReason=null;selectedId=source.id;view.workflow='evaluate';saveView();render();};
        container.append(row);
      }
      for(const link of (project.links||[]).filter(l=>l.sourceId===source.id)){
        const target=project.nodes.find(n=>n.id===link.targetId);
        const own=Core.personalInfluence(project,'secondary',link.id,actorId);
        const row=el('button','repeat-connection');row.type='button';
        row.append(el('strong','',`${t('multiUseSecondary')} → ${target?.title||'?'}`),
          el('small','',`${own?.current?signed(own.record.influence):'—'} / 5 · ${t('multiUseOpen')}`));
        row.onclick=()=>openLinksDialog(source.id,link.id);
        container.append(row);
      }
      const makeRepeat=el('button','btn primary repeat-from-node',t('repeatLinkOtherTargets'));
      makeRepeat.type='button';makeRepeat.disabled=!canEdit();
      makeRepeat.onclick=()=>reuseFromTreeNode(source.id);
      container.append(makeRepeat);
      const edit=el('button','btn quiet',t('editSelected'));edit.type='button';
      edit.onclick=()=>{selectedLibraryReason=null;selectedId=source.id;render();};
      container.append(edit);return;
    }
    const reason=findLibraryReason(selection);
    if(!reason){selectedLibraryReason=null;return;}
    const locked=selection.type==='locked';
    container.append(el('div','repeat-inspector-kicker',t('repeatTab')),
      el('h3','repeat-inspector-title',reason.title),
      el('p','inspector-note',locked?t('repeatLockedHelp'):t('repeatIndependentHelp')));
    const nameLabel=el('label','repeat-inspector-label',t('repeatEditName'));
    const title=el('input');title.type='text';title.value=reason.title;title.maxLength=200;title.disabled=!canEdit();
    title.onchange=()=>mutation(()=>locked?Core.updateSharedReason(project,reason.id,title.value,reason.confidence,reason.influence)
      :Core.updateReasonConcept(project,reason.id,title.value));
    nameLabel.append(title);container.append(nameLabel);
    if(locked){
      const fixed=el('p','repeat-fixed-info',`${reason.confidence}% / ${signed(reason.influence)}/5`);
      container.append(fixed);
      const edit=el('details','repeat-advanced');edit.append(el('summary','',t('repeatEditLocked')));
      const form=el('form','repeat-inspector-fixed-form');
      const confidence=el('input');confidence.type='number';confidence.min='0';confidence.max='100';confidence.value=reason.confidence;
      const impact=el('input');impact.type='number';impact.min='-5';impact.max='5';impact.step='0.5';impact.value=reason.influence;
      const save=el('button','btn primary',t('sharedSave'));save.type='submit';
      form.append(el('label','',t('sharedProb')),confidence,el('label','',t('sharedImpact')),impact,save);
      form.onsubmit=e=>{e.preventDefault();mutation(()=>Core.updateSharedReason(project,reason.id,reason.title,Number(confidence.value),Number(impact.value)));};
      edit.append(form);container.append(edit);
    }
    const targetLabel=el('label','repeat-inspector-label',t('repeatChooseTarget'));
    const select=el('select');select.id='repeatAttachTarget';
    for(const n of project.nodes.filter(n=>canAttachLibraryReason(selection,n.id))){
      const opt=el('option','',n.title);opt.value=n.id;select.append(opt);
    }
    if([...select.options].some(o=>o.value===selectedId))select.value=selectedId;
    targetLabel.append(select);container.append(targetLabel);
    const attach=el('button','btn primary repeat-attach',t('repeatAttach'));attach.type='button';
    attach.disabled=!canEdit()||!select.options.length;
    attach.onclick=()=>attachLibraryReason(selection,select.value);
    container.append(attach);
    const uses=project.nodes.filter(n=>locked?n.sharedReasonId===reason.id:n.reasonConceptId===reason.id);
    container.append(el('h3','inspector-subheading',t('repeatConnections',{count:uses.length})),
      el('p','inspector-note',locked?t('repeatLockedHelp'):t('repeatPerTargetAssessments')));
    if(!uses.length)container.append(el('p','inspector-note',t('repeatNoConnections')));
    for(const use of uses){
      const parent=project.nodes.find(n=>n.id===use.parentId);
      const row=el('button','repeat-connection');row.type='button';
      const values=nodeAssessmentSnapshot(use);
      row.append(el('strong','',parent?.title||'?'),
        el('small','',locked?t('repeatLocked'):(values?.value||'—')+' · '+t('repeatOpenReview')));
      row.onclick=()=>{selectedLibraryReason=null;selectedId=use.id;view.workflow='evaluate';saveView();render();
        $('inspector').querySelector('#nodeImpact')?.scrollIntoView({block:'nearest'});};
      container.append(row);
    }
    if(!uses.length){
      const remove=el('button','btn quiet',t('sharedDelete'));remove.type='button';remove.disabled=!canEdit();
      remove.onclick=async()=>{if(await askConfirm(t('sharedDeleteConfirm')))if(mutation(()=>locked?Core.removeSharedReason(project,reason.id):Core.removeReasonConcept(project,reason.id))){selectedLibraryReason=null;render();}};
      container.append(remove);
    }
  }

  // Shared reason templates deliberately store one fixed project-wide pair.
  // Attachments are explicit score-bearing leaves. Unchecking removes one use,
  // never the shared template or any other use; no automatic text matching.
  function openSharedReasons(targetId = selectedId) {
    const selected=project.nodes.find(n=>n.id===targetId);
    sharedAttachTargetId=selected?.sharedReasonId ? selected.parentId : targetId;
    renderSharedReasons();
    $('sharedReasonsDialog').showModal();
  }
  let sharedAttachTargetId=null;
  function renderSharedReasons() {
    const parent=project.nodes.find(n=>n.id===sharedAttachTargetId);
    const valid=!!parent && !['decision','group'].includes(parent.kind) && !parent.sharedReasonId;
    $('sharedTarget').textContent=valid?t('sharedTarget',{name:parent.title}):t('sharedChooseTarget');
    const list=$('sharedReasonsList');list.replaceChildren();
    for(const shared of project.sharedReasons || []){
      const uses=project.nodes.filter(n=>n.sharedReasonId===shared.id);
      const use=valid?uses.find(n=>n.parentId===parent.id):null;
      const card=el('section','shared-reason-row');card.setAttribute('role','listitem');
      const head=el('div','shared-reason-head');
      const checkbox=el('input');checkbox.type='checkbox';checkbox.checked=!!use;
      checkbox.disabled=!valid||!canEdit();
      checkbox.setAttribute('aria-label',t('sharedAttach',{name:shared.title}));
      checkbox.onchange=async()=>{
        if(checkbox.checked){const done=mutation(()=>Core.attachSharedReason(project,shared.id,parent.id,actorId));if(done)renderSharedReasons();else checkbox.checked=false;}
        else if(use){
          const extra=project.comments.some(c=>c.nodeId===use.id)||(project.links||[]).some(l=>l.sourceId===use.id||l.targetId===use.id);
          if(extra && !await askConfirm(t('sharedRemoveConfirm'))){checkbox.checked=true;return;}
          if(mutation(()=>Core.removeSubtree(project,use.id)))renderSharedReasons();else checkbox.checked=true;
        }
      };
      const heading=el('strong','',shared.title);
      head.append(checkbox,heading,el('small','',`${shared.confidence}% · ${signed(shared.influence)}/5 · ${uses.length} ${t('sharedUses')}`));
      card.append(head);
      const details=el('details','shared-reason-edit');
      details.append(el('summary','',t('sharedEdit')));
      const form=el('form','shared-reason-edit-form');
      const name=el('input');name.type='text';name.required=true;name.maxLength=200;name.value=shared.title;name.setAttribute('aria-label',t('sharedName'));
      const confidence=el('input');confidence.type='number';confidence.min='0';confidence.max='100';confidence.step='1';confidence.value=String(shared.confidence);confidence.required=true;confidence.setAttribute('aria-label',t('sharedProb'));
      const influence=el('input');influence.type='number';influence.min='-5';influence.max='5';influence.step='0.5';influence.value=String(shared.influence);influence.required=true;influence.setAttribute('aria-label',t('sharedImpact'));
      const save=el('button','btn primary',t('sharedSave'));save.type='submit';save.disabled=!canEdit();
      form.onsubmit=event=>{event.preventDefault();if(mutation(()=>Core.updateSharedReason(project,shared.id,name.value,Number(confidence.value),Number(influence.value))))renderSharedReasons();};
      const remove=el('button','btn quiet',t('sharedDelete'));remove.type='button';remove.disabled=!canEdit()||uses.length>0;
      remove.onclick=async()=>{if(await askConfirm(t('sharedDeleteConfirm')))if(mutation(()=>Core.removeSharedReason(project,shared.id)))renderSharedReasons();};
      form.append(name,confidence,influence,save,remove);details.append(form);card.append(details);list.append(card);
    }
    if(!(project.sharedReasons||[]).length)list.append(el('p','inspector-note',t('sharedEmpty')));
  }
  // Concept identity is reused, but each use has its OWN document baseline
  // and each human's independent claim and relationship reviews.
  let contextAttachTargetId=null;
  function openContextReasons(targetId=selectedId){
    const selected=project.nodes.find(n=>n.id===targetId);
    contextAttachTargetId=selected?.reasonConceptId?selected.parentId:targetId;
    renderContextReasons();$('contextReasonsDialog').showModal();
  }
  function renderContextReasons(){
    const parent=project.nodes.find(n=>n.id===contextAttachTargetId);
    const valid=!!parent&&['claim','option'].includes(parent.kind)&&!parent.sharedReasonId;
    $('contextTarget').textContent=valid?t('sharedTarget',{name:parent.title}):t('sharedChooseTarget');
    $('contextCreateButton').textContent=t(valid?'reuseAddHere':'contextCreate');
    const list=$('contextReasonsList');list.replaceChildren();
    for(const concept of project.reasonConcepts||[]){
      const uses=project.nodes.filter(n=>n.reasonConceptId===concept.id);
      const use=valid?uses.find(n=>n.parentId===parent.id):null;
      const card=el('section','shared-reason-row');card.setAttribute('role','listitem');
      const head=el('div','shared-reason-head');
      const cb=el('input');cb.type='checkbox';cb.checked=!!use;cb.disabled=!valid||!canEdit();cb.setAttribute('aria-label',t('contextAttach',{name:concept.title}));
      cb.onchange=()=>{
        if(cb.checked){let added=null;const ok=mutation(()=>{added=Core.attachReasonConcept(project,concept.id,parent.id,actorId);selectedId=added.id;});if(!ok)cb.checked=false;else renderContextReasons();}
        else if(use){if(!mutation(()=>Core.detachReasonConcept(project,use.id)))cb.checked=true;else renderContextReasons();}
      };
      head.append(cb,el('strong','',concept.title),el('small','',t('contextUses',{count:uses.length})));
      card.append(head);
      const details=el('details','shared-reason-edit');details.append(el('summary','',t('sharedEdit')));
      const form=el('form','shared-reason-edit-form');
      const name=el('input');name.type='text';name.maxLength=200;name.required=true;name.value=concept.title;name.setAttribute('aria-label',t('contextName'));
      const save=el('button','btn primary',t('sharedSave'));save.type='submit';save.disabled=!canEdit();
      form.onsubmit=event=>{event.preventDefault();if(mutation(()=>Core.updateReasonConcept(project,concept.id,name.value)))renderContextReasons();};
      const remove=el('button','btn quiet',t('sharedDelete'));remove.type='button';remove.disabled=!canEdit()||uses.length>0;
      remove.onclick=async()=>{if(await askConfirm(t('sharedDeleteConfirm')))if(mutation(()=>Core.removeReasonConcept(project,concept.id)))renderContextReasons();};
      form.append(name,save,remove);details.append(form);card.append(details);
      for(const node of uses){
        const target=project.nodes.find(n=>n.id===node.parentId);
        const go=el('button','btn quiet context-use-link',`${target?.title||'?'} · ${node.confidence}% · ${signed(Core.signedInfluence(node)??0)}/5`);
        go.type='button';go.onclick=()=>{$('contextReasonsDialog').close();selectNode(node.id);};card.append(go);
      }
      list.append(card);
    }
    if(!(project.reasonConcepts||[]).length)list.append(el('p','inspector-note',t('contextEmpty')));
  }
  function renderPeople() {
    $('assessmentWeighting').value=Core.assessmentWeighting(project);
    $('assessmentWeighting').disabled=!isOwner();
    const current=userProfile();
    $('currentUserName').value=current?.name||'';
    $('currentUserName').disabled=!current || Core.isAIProfile(current);
    const list = $('peopleList'); list.replaceChildren();
    for (const user of project.users) {
      const row = el('div', 'person-row');
      if (user.id === actorId) row.classList.add('active-profile');
      const nameField = el('label', '', t('profileName'));
      const name = el('input'); name.value = user.name; name.maxLength = 120; name.disabled = !(isOwner() || user.id===actorId);
      name.setAttribute('aria-label', t('profileName'));
      name.onchange = () => mutation(() => {
        const next = name.value.trim();
        if (!next || project.users.some(u => u.id !== user.id && u.name.toLocaleLowerCase() === next.toLocaleLowerCase())) throw Error(t('profileNameTaken'));
        user.name = next;
      });
      nameField.append(name);
      const shareField=el('label','person-shares',t('votePersonShares'));
      const shares=el('input');shares.type='number';shares.min='0';shares.max='1000000000';shares.step='1';shares.value=String(user.shares);
      shares.disabled=!isOwner()||project.votingRound?.status==='open';
      shares.setAttribute('aria-label',t('votePersonShares')+': '+user.name);
      shares.onchange=()=>mutation(()=>{
        const n=Number(shares.value);if(!Number.isInteger(n)||n<0||n>1000000000)throw Error(t('voteInvalidShares'));
        user.shares=n;
      });
      shareField.append(shares);
      const votes = project.votes.filter(v => v.userId === user.id).length;
      const impacts = project.edgeAssessments.filter(a => a.userId === user.id).length;
      const meta = el('small', 'profile-counter', `${Core.isAIProfile(user)?'AI · ':''}${votes} ${t('profileCredenceShort')} · ${impacts} ${t('profileInfluenceShort')}`);
      const actions = el('div', 'profile-actions');
      const choose = el('button', 'btn quiet', user.id === actorId ? t('profileSelected') : t('profileSwitch'));
      choose.disabled = user.id === actorId;
      choose.onclick = () => chooseActor(user.id);
      actions.append(choose);
      if (user.role !== 'owner') {
        const remove = el('button', 'btn quiet', t('profileRemove'));
        remove.disabled = !isOwner();
        remove.onclick = async () => {
          if (!await askConfirm(t('profileRemoveConfirm', { name: user.name }), t('profileRemove'))) return;
          const removeId = user.id;
          if (mutation(() => Core.removeLocalProfile(project, removeId))) {
            try { storage.removeItem(`${ASSESSMENT_PREFIX}${project.id}:${removeId}`); } catch (_) {}
          }
        };
        actions.append(remove);
      }
      row.append(nameField,shareField, meta, actions); list.append(row);
    }
    $('btnAddPerson').disabled = !isOwner() || project.users.length >= 100;
  }

  function downloadFile(filename, text, mime) {
    const blob = new Blob([text], {type:mime});
    const url = URL.createObjectURL(blob);
    const link = el('a');link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  // Static tree export: render from model/view snapshot (not a screenshot of the
  // zoomed viewport). Export-only choices never modify project or saved view.
  function openVisualExport(){
    $('exportScope').value='visible';
    $('exportDetail').value='current';
    $('exportPalette').value=['dark','cosmos','hologram','bitberg'].includes(effectiveAppearance())?'dark':'light';
    $('exportHighlights').checked=view.showImportance||(view.highlightOptions&&leadingOptionIds.size>0);
    $('exportLinks').checked=!!view.layers.links;
    $('exportShared').checked=view.showRecurringInTree;
    $('exportCompact').checked=(view.depthLimit!==null?view.depthCompact:view.compactVisible)||project.nodes.some(n=>n.collapsed);
    $('exportFormat').value='png';
    $('exportResolution').value='2';$('exportPngMode').value='auto';
    $('exportPdfLayout').value='pages-auto';
    $('exportVisualStatus').textContent='';
    updateVisualFormat();
    $('visualExportDialog').showModal();
  }
  function updateVisualFormat(){
    const format=$('exportFormat').value;
    $('exportPngOptions').hidden=format!=='png';
    $('exportPdfOptions').hidden=format!=='pdf';
    updatePngEstimate();
  }
  function updatePngEstimate(){
    const label=$('exportPngEstimate');if($('exportFormat').value!=='png'){label.textContent='';return;}
    try{
      const snap=buildVisualSnapshot();
      const svg=DiagramExport.renderSvg(snap);
      const plan=DiagramExport.pngPlan(svg.width,svg.height,Number($('exportResolution').value),$('exportPngMode').value,navigator.deviceMemory);
      label.textContent=t('exportPngSize',{width:plan.width,height:plan.height,megapixels:(plan.pixels/1e6).toFixed(1),mb:Math.ceil(plan.estimatedRGBABytes/1e6)})+' · '+
        t(plan.single?'exportPngSingleAttempt':'exportPngZipFallback');
    }catch(error){label.textContent=error.message;}
  }
  function buildVisualSnapshot(){
    const layers=$('exportDetail').value==='current'?{...view.layers}:{...LAYER_PRESETS[$('exportDetail').value]};
    const includeShared=$('exportShared').checked,includeLinks=$('exportLinks').checked;
    const isWhole=$('exportScope').value==='all';
    const all=isWhole?project.nodes:projection.nodes;
    const byNodeId=new Map(project.nodes.map(n=>[n.id,n]));
    const recurringHidden=new Map();
    function hiddenUnderRecurring(node){
      if(recurringHidden.has(node.id))return recurringHidden.get(node.id);
      if(node.sharedReasonId||node.reasonConceptId){recurringHidden.set(node.id,true);return true;}
      const parent=byNodeId.get(node.parentId);
      const result=!!parent&&hiddenUnderRecurring(parent);
      recurringHidden.set(node.id,result);return result;
    }
    // Full-tree export must not leave children orphaned when their recurring
    // parent is hidden. Keep the diagram projection and export consistent.
    const nodes=all.filter(n=>includeShared||!hiddenUnderRecurring(n));
    const visible=new Set(nodes.map(n=>n.id));
    if(!nodes.length)throw Error('No nodes in the selected export');
    const exportH=(layers.details||Object.entries(layers).some(([k,v])=>v&&['index','assessments','confidence','impact','comments','counts','links'].includes(k)))?176:148;
    const coords=new Map();let directions=new Map();
    if(!isWhole && $('exportCompact').checked){
      const compact=Layout.compactVisibleProjection(project.nodes,visible,view.orientation,CARD_W,exportH);
      for(const [id,pos] of compact.positions)coords.set(id,pos);
      directions=compact.groups;
    }else if(view.orientation==='four-way'){
      const fourWay=Layout.fourWayProjection(project.nodes,Core.rootNode(project).id,CARD_W,exportH);
      for(const [id,pos] of fourWay.positions){const o=view.fourWayOffsets[id]||{x:0,y:0};coords.set(id,{x:pos.x+(Number(o.x)||0),y:pos.y+(Number(o.y)||0)});}
      directions=Layout.fourWayVisualDirections(project.nodes,Core.rootNode(project).id,coords);
    }else{
      for(const n of project.nodes)coords.set(n.id,Layout.viewPosition(n.position,view.orientation));
    }
    const personal=view.indexMode==='personal';
    const evaluated=personal?personalScores:scores;
    const highlight=$('exportHighlights').checked&&!(lens?.filtered&&!personal);
    const highlighted=new Set();
    if(highlight){
      const targetEffects=Core.marginalTargetEffects(project,evaluated,Core.marginalIndexEffects(project,evaluated));
      const byTarget=new Map();
      for(const effect of targetEffects.values()){
        if(effect.magnitude<=1e-9)continue;
        if(!byTarget.has(effect.targetId))byTarget.set(effect.targetId,[]);
        byTarget.get(effect.targetId).push(effect);
      }
      for(const arr of byTarget.values()){
        arr.sort((a,b)=>b.magnitude-a.magnitude||a.childId.localeCompare(b.childId));
        for(const effect of arr.slice(0,Math.ceil(arr.length*.2)))highlighted.add(effect.childId);
      }
    }
    const signedValue=n=>Number(n)>=0?`+${Number(n)}`:`${Number(n)}`;
    const data=nodes.map(n=>{
      const result=evaluated.get(n.id),chips=[];
      if(layers.index&&Core.indexAssessable(n))chips.push(`${t('indexChip')}: ${resultText(n,result,0)}`);
      const ratings=nodeAssessmentSnapshot(n);
      if(layers.assessments && ratings)chips.push(`${t('assessmentSummaryShort')}: ${ratings.value}${ratings.averaging?' ('+t(project.settings.assessmentWeighting==='shares'?'assessmentSummaryTagWeighted':'assessmentSummaryTagMean')+')':''}`);
      if(layers.confidence&&Core.truthAssessable(n))chips.push(`${t('credenceChip')}: ${ratings?.credence==null?'—':Number(ratings.credence.toFixed(0))+'%'}`);
      if(layers.impact&&Core.assessmentFields(n).impact)chips.push(`${t('impactChip')}: ${ratings?.impact==null?'—':signedValue(Number(ratings.impact.toFixed(1)))+'/5'}`);
      if(layers.comments)chips.push(`${t('commentsChip')}: ${(project.comments||[]).filter(c=>c.nodeId===n.id).length}`);
      if(layers.counts){const count=Core.childrenOf(project,n.id).length;if(count)chips.push(`${t('childrenChip')}: ${count}`);}
      if(layers.links){const count=(project.links||[]).filter(l=>l.sourceId===n.id||l.targetId===n.id).length;if(count)chips.push(`${t('linksChip')}: ${count}`);}
      const pos=coords.get(n.id)||{x:0,y:0};
      return {id:n.id,x:pos.x,y:pos.y,title:n.title,details:n.details,relation:displayedPrimaryRelation(n),shared:!!n.sharedReasonId,
        typeLabel:layers.labels?relationLabel(n):'',chips,important:highlighted.has(n.id)||(highlight&&leadingOptionIds.has(n.id)),
        dim:!isWhole&&view.focus.mode!=='all'&&!projection.matchIds.has(n.id)&&n.id!==projection.anchorId&&!projection.contextIds.has(n.id)};
    });
    const edges=[];
    for(const n of nodes){
      if(!n.parentId||!visible.has(n.parentId))continue;
      const parent=project.nodes.find(item=>item.id===n.parentId);
      if(!parent)continue;
      const direction=personal?shownInfluence(n):undefined;
      edges.push({d:Layout.edgeGeometry(parent,n,view.orientation,CARD_W,exportH,coords,directions),relation:displayedPrimaryRelation(n),
        important:highlighted.has(n.id),personalDirection:direction,
        unassessed:personal&&direction===null&&n.relation!=='option',dim:!isWhole&&view.focus.mode!=='all'&&!projection.matchIds.has(n.id)});
    }
    if(includeLinks){
      for(const link of project.links||[]){
        if(!visible.has(link.sourceId)||!visible.has(link.targetId))continue;
        const source=coords.get(link.sourceId),target=coords.get(link.targetId);
        if(source&&target)edges.push({d:Layout.secondaryLinkPath(source,target,CARD_W,exportH),relation:link.relation,secondary:true,dim:!isWhole&&view.focus.mode!=='all'});
      }
    }
    return {nodes:data,edges,layers:{details:layers.details,ratings:layers.index||layers.assessments||layers.confidence||layers.impact||layers.comments||layers.counts||layers.links},
      highlight,palette:$('exportPalette').value,title:project.title,subtitle:`WITT · GRACE · ${t(project.mode==='decision'?'modeDecision':'modeArgument')} · ${personal?viewedAssessor()?.name||t('indexPersonal'):t('indexShared')}`};
  }
  async function downloadVisual(){
    const button=$('btnExportDownload'),status=$('exportVisualStatus');
    button.disabled=true;status.textContent=t('exportBusy');
    try{
      const snapshot=buildVisualSnapshot();
      const {svg,width,height}=DiagramExport.renderSvg(snapshot);
      const kind=$('exportFormat').value;
      const name=(project.title||'witt').normalize('NFKC').replace(/[^a-zA-Z0-9_\-\p{L}\p{N} ]/gu,'').trim().replace(/\s+/g,'_').slice(0,65)||'witt';
      let file,extension=kind;
      if(kind==='svg')file=new Blob([svg],{type:'image/svg+xml;charset=utf-8'});
      else if(kind==='png'){
        const result=await DiagramExport.pngExport(svg,width,height,Number($('exportResolution').value),$('exportPngMode').value);
        file=result.blob; if(result.tiled){extension='zip';status.textContent=t('exportPngTiled',{count:result.tiles})+(result.fallbackReason?' · '+t('exportPngBrowserLimit'):'');}
      }
      else if(kind==='pdf')file=await DiagramExport.pdfBlob(svg,width,height,$('exportPdfLayout').value);
      else throw Error('Invalid format');
      DiagramExport.download(file,`${name}.${extension}`);
      if(extension!=='zip')status.textContent=t('exportReady');
    }catch(error){status.textContent=`${t('operationFailed')}: ${error.message}`;}
    finally{button.disabled=false;}
  }
  function exportFile() {
    const safeTitle = project.title.normalize('NFKD').replace(/[^a-zA-Z0-9\u00c0-\u024f-]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 45) || 'witt';
    const filename=`${safeTitle}.witt.json`;
    downloadFile(filename, JSON.stringify(Core.validateProject(project),null,2)+'\n','application/json;charset=utf-8');
    try {Workspace.recordEvent(storage,'lastExportedJson',filename,project.id);} catch (_) { /* optional metadata */ }
    $('saveStatus').textContent = t('savedFile');
  }
  // Common read-only JSON preflight for WITT files, AI drafts and change proposals.
  // The report is safe to paste back to an external language model for correction.
  const importDependencies={Core,AIDraft,Contributions,AIStarter,projectSchema:ProjectImportSchema};
  let lastImportReport=null,lastImportFile='';
  function showImportReport(report,filename=''){
    lastImportReport=report;lastImportFile=filename;
    $('importReportSummary').textContent=(filename?filename+' · ':'')+report.formatName+' · '+t('importValidationCount',{count:report.issues.length});
    const list=$('importReportIssues');list.replaceChildren();
    for(const error of report.issues){
      const entry=el('div','import-report-entry');entry.setAttribute('role','listitem');
      const loc=el('code','import-report-location',error.path+(error.line?' · rivi '+error.line+', sarake '+error.column:''));
      entry.append(el('small','import-report-code',error.code),loc,el('strong','',error.message),el('p','',error.fix));list.append(entry);
    }
    $('importReportStatus').textContent='';
    if(!$('importReportDialog').open)$('importReportDialog').showModal();
  }
  function inspectImport(raw,expected=null,filename=''){
    const result=ImportValidation.inspect(raw,importDependencies,{expected,currentProject:project});
    if(!result.ok)showImportReport(result,filename);
    return result;
  }
  function showImportSizeError(filename,limit){
    showImportReport({ok:false,format:'invalid',formatName:'Tiedoston koko',issues:[{code:'TOO_LARGE',path:'$',message:'Tiedosto ylittää suurimman sallitun koon ('+limit+' Mt).',fix:'Vie pienempi WITT-tiedosto tai jaa työ osiin.'}]},filename);
  }
  function importReportText(){return ImportValidation.reportText(lastImportReport,lastImportFile);}
  function bindImportReport(){
    $('btnImportReportCloseTop').onclick=$('btnImportReportClose').onclick=()=>$('importReportDialog').close();
    $('btnImportReportCopy').onclick=async()=>{
      if(!lastImportReport)return;
      try{await navigator.clipboard.writeText(importReportText());$('importReportStatus').textContent=t('importValidationCopied');}
      catch(_){$('importReportStatus').textContent=t('importValidationCopyFailed');}
    };
    $('btnImportReportDownload').onclick=()=>{
      if(!lastImportReport)return;
      downloadFile('witt-tuonnin-korjausraportti.txt',importReportText()+'\n','text/plain;charset=utf-8');
    };
  }
  async function openFile(file) {
    if (!file) return;
    try {
      if (file.size > 5_000_000) {showImportSizeError(file.name,5);return;}
      const result=inspectImport(await file.text(),null,file.name);
      if(!result.ok)return;
      const raw=result.parsed;
      if (result.format==='draft') { previewDraft(raw,file.name); return; }
      if (result.format==='contribution') { previewContribution(raw,file.name); return; }
      if (result.format==='library') {showImportReport({format:'library',formatName:'Asiakirjakirjaston varmuuskopio',issues:[{code:'WRONG_IMPORT',path:'$.format',message:'Kirjaston varmuuskopio avataan Asiakirjakirjasto → Palauta -toiminnolla.',fix:'Valitse kirjaston palautustoiminto eikä tavallista asiakirjan avaamista.'}]},file.name);return;}
      const incoming = result.format==='starter' ? AIStarter.toProject(raw,Core) : Core.validateProject(raw);
      if (!await prepareReplacement(t('importConfirm',{title:incoming.title})+'\nJSON tarkistettu: '+result.formatName+'.')) return;
      if(!replaceProject(incoming))return;
      try {Workspace.recordEvent(storage,'lastOpenedJson',file.name,project.id);}catch(_){}
      enterEditor();
    } catch (error) { showMessage(t('importFailed',{reason:error.message})); }
  }
  // Portable offline AI draft: one text file out, one JSON file back.
  // The imported ratings/comments are independent opt-in options.
  let stagedDraft=null;
  function currentDraftTask() { return AIDraft.buildTask({mode:$('aiMode').value,topic:$('aiTopic').value,context:$('aiContext').value,language:locale}); }
  function updateAIPrompt() { $('aiPromptPreview').value=currentDraftTask(); }
  function selectAIDraftStep(step){
    const creating=step==='prompt';
    $('aiDraftPromptStep').hidden=!creating;$('aiDraftImportStep').hidden=creating;
    for(const [id,pressed] of [['btnAIFlowPrompt',creating],['btnAIFlowImport',!creating]]){
      $(id).classList.toggle('active',pressed);$(id).setAttribute('aria-pressed',String(pressed));
    }
  }
  function openAIDraft() {
    $('aiMode').value=project.mode;
    updateAIPrompt();$('aiStatus').textContent='';$('aiDraftTaskStatus').textContent='';$('aiDraftPaste').value='';
    $('aiDraftPromptPreviewDetails').open=false;$('aiDraftAdvanced').open=false;
    selectAIDraftStep('prompt');$('aiDialog').showModal();$('aiTopic').focus();
  }
  function previewDraft(raw,sourceName='AI:n vastaus'){
    try {
      const report=inspectImport(raw,'draft',sourceName);if(!report.ok){stagedDraft=null;return;}
      stagedDraft=AIDraft.validate(report.parsed);
      // Validate the entire draft before offering any replacement.
      AIDraft.toProject(stagedDraft,Core);
      $('aiDraftPreview').textContent=[`${stagedDraft.title} (${stagedDraft.mode})`,
        `AI: ${stagedDraft.assessor}`,`${stagedDraft.claims.length} solmua · ${stagedDraft.sharedReasons.length} yhteisperustetta · ${stagedDraft.links.length} lisäyhteyttä`,
        `${stagedDraft.claims.filter(n=>n.credence!==undefined).length+(stagedDraft.root.credence!==undefined?1:0)} uskottavuusarviota · ${stagedDraft.claims.filter(n=>n.influence!==undefined).length} vaikutusarviota`,
        ...stagedDraft.claims.slice(0,30).map(n=>`• ${n.title} (${n.relation}) · ${n.credence??'–'}% · ${n.influence??'–'}/5`),
        stagedDraft.claims.length>30?`… ${stagedDraft.claims.length-30} lisää`:''
      ].filter(Boolean).join('\n');
      $('draftIncludeRatings').checked=true;$('draftIncludeComments').checked=true;$('draftIncludeShared').checked=true;$('draftIncludeShared').disabled=false;
      if($('aiDialog').open)$('aiDialog').close();
      $('aiDraftPreviewDialog').showModal();
    }catch(error){stagedDraft=null;showImportReport({format:'draft',formatName:'AI:n arvioitu puu v2',issues:[{code:'IMPORT',path:'$',message:error.message||t('operationFailed'),fix:'Korjaa tiedoston rakenne tai viittaukset.'}]},sourceName);}
  }
  async function applyDraft(){
    if(!stagedDraft)return;
    try {
      const incoming=AIDraft.toProject(stagedDraft,Core,{assessments:$('draftIncludeRatings').checked,comments:$('draftIncludeComments').checked,sharedReasons:$('draftIncludeShared').checked});
      if(!await prepareReplacement(t('importConfirm',{title:incoming.title})))return;
      if(!replaceProject(incoming))return;
      if($('draftIncludeRatings').checked){
        const ai=incoming.users.find(Core.isAIProfile);
        if(ai){view.indexMode='personal';view.viewAssessorId=ai.id;view.workflow='evaluate';view.layers.index=true;view.layers.confidence=true;view.layers.impact=true;view.highlightOptions=incoming.mode==='decision';saveView();render();}
      }
      stagedDraft=null;$('aiDraftPreviewDialog').close();enterEditor();
    }catch(error){$('aiDraftPreview').textContent=error.message||t('operationFailed');}
  }

  // One contribution protocol for AI and another human's WITT instance.
  // The human importer selects the source type and nickname explicitly.
  let stagedProposal=null, appliedProposal=null;
  function aiProfiles(){return project.users.filter(Core.isAIProfile);}
  function openAIResults(){
    const ais=aiProfiles();if(!ais.length){showMessage(t('aiNoAssessors'));return;}
    const choose=$('aiResultsAssessorSelect');choose.replaceChildren();
    for(const ai of ais){const option=el('option','',ai.name);option.value=ai.id;choose.append(option);}
    choose.value=ais.some(a=>a.id===viewedAssessorId())?viewedAssessorId():ais[0].id;
    $('aiResultsHighlight').checked=!!view.highlightOptions;
    renderAIResultsSummary();$('aiResultsDialog').showModal();
  }
  function renderAIResultsSummary(){
    const id=$('aiResultsAssessorSelect').value;
    if(!project.users.some(u=>u.id===id&&Core.isAIProfile(u)))return;
    const report=AssessorView.summary(project,Core,id);
    $('aiResultsCounts').textContent=t('aiReviewCounts',{claims:report.credenceReviews,relations:report.primaryReviews,links:report.secondaryReviews});
    $('aiResultsEmpty').hidden=report.credenceReviews+report.primaryReviews+report.secondaryReviews>0;
    $('aiResultsRanking').replaceChildren();
    $('aiResultsRankingHeader').hidden=project.mode!=='decision';
    $('aiResultsHighlight').disabled=project.mode!=='decision';
    for(const option of report.rows){
      const row=el('div','ai-assessor-option');
      const score=option.reviewedPrimary===0?'—':resultText(option.node,option);
      const status=option.feasibility.status!=='feasible'?t('feasibility_'+option.feasibility.status):
        !option.complete?t('personalRankingIncomplete'):option.reviewedPrimary===0?t('aiOptionNoReviews'):t('aiOptionComplete');
      row.append(el('strong','',option.node.title),el('span','ai-option-score',score),el('small','',status));
      if(report.leadingIds.includes(option.node.id))row.classList.add('ai-leading-option');
      $('aiResultsRanking').append(row);
    }
    if(!report.rows.length)$('aiResultsRanking').append(el('p','',t('aiNoOptions')));
    $('aiResultsRankingHint').textContent=report.leadingIds.length?t('aiRankingHint'):t('aiRankingUnavailable');
  }
  function showAIResultsPerspective(){
    const id=$('aiResultsAssessorSelect').value;
    if(!aiProfiles().some(u=>u.id===id))return;
    view.indexMode='personal';view.viewAssessorId=id;
    view.workflow='evaluate';view.layers.index=true;view.layers.confidence=true;view.layers.impact=true;
    view.highlightOptions=project.mode==='decision'&&$('aiResultsHighlight').checked;
    selectedId=Core.rootNode(project).id;
    saveView();$('aiResultsDialog').close();render();
  }

  function contributionTask(){return Contributions.makeRequest(project,Core,$('aiReviewMode').value,locale);}
  function currentContributionTask(){return Contributions.makePrompt(contributionTask());}
  function updateAIReviewPrompt(){ $('aiReviewPromptPreview').value=currentContributionTask(); }
  function renderContributionExporters(){
    const list=$('contributionExporterList');list.replaceChildren();
    for(const person of project.users.filter(u=>!Core.isAIProfile(u))){
      const label=el('label','contribution-exporter');const cb=el('input');cb.type='checkbox';
      cb.value=person.id;cb.checked=true;cb.dataset.exportUserId=person.id;
      const count=project.votes.filter(v=>v.userId===person.id).length+project.edgeAssessments.filter(v=>v.userId===person.id).length;
      label.append(cb,el('span','',person.name),el('small','',`${count} arviota`));list.append(label);
    }
    $('contributionExportStatus').textContent='';
  }
  function openAIReview(){
    stagedProposal=null;appliedProposal=null;$('aiReviewPaste').value='';$('aiReviewStatus').textContent='';
    $('aiReviewTaskStatus').textContent='';$('aiReviewPromptPreviewDetails').open=false;$('aiReviewAdvanced').open=false;
    updateAIReviewPrompt();
    renderContributionExporters();
    $('aiReviewDialog').showModal();
  }
  const proposalOptionIds={claims:'proposalClaims',edits:'proposalEdits',links:'proposalLinks',sharedReasons:'proposalSharedReasons',assessments:'proposalAssessments',comments:'proposalComments'};
  const selectedProposalItems={claims:new Set(),edits:new Set()};
  function proposalFiltered(){
    if(!stagedProposal)return null;
    if(stagedProposal.format===Contributions.GROUP_FORMAT)return stagedProposal;
    return {...stagedProposal,
      claims:stagedProposal.claims.filter((_,i)=>selectedProposalItems.claims.has(i)),
      edits:stagedProposal.edits.filter((_,i)=>selectedProposalItems.edits.has(i))};
  }
  function previewChoiceList(){
    const div=$('proposalItemChoices');div.replaceChildren();
    if(stagedProposal?.format===Contributions.GROUP_FORMAT){
      const sources=$('proposalGroupSources');sources.replaceChildren();sources.hidden=false;$('proposalSingleSource').hidden=true;
      sources.append(el('strong','', 'Tekijät ja arvioijat (nimet tulevat JSON-tiedostosta)'));
      for(const entry of stagedProposal.contributors){
        const line=el('label','contribution-exporter');const input=el('input');input.type='text';input.maxLength=70;input.value=entry.name;
        input.dataset.sourceUserId=entry.sourceUserId;input.oninput=refreshProposal;
        line.append(el('span','',entry.sourceUserId.slice(0,12)),input,el('small','',`${entry.patch.claims.length} uutta solmua · ${entry.patch.assessments.length} arviota`));sources.append(line);
      }return;
    }
    $('proposalGroupSources').hidden=true;$('proposalSingleSource').hidden=false;
    for(const [kind,items] of [['claims',stagedProposal.claims],['edits',stagedProposal.edits]]){
      if(!items.length)continue;
      const group=el('fieldset','proposal-item-group');group.dataset.kind=kind;group.append(el('legend','',kind==='claims'?t('contributionClaims'):t('contributionEdits')));
      items.forEach((item,i)=>{
        const label=el('label','');const box=el('input');box.type='checkbox';box.checked=true;
        box.onchange=()=>{box.checked?selectedProposalItems[kind].add(i):selectedProposalItems[kind].delete(i);refreshProposal();};
        const old=kind==='edits'?project.nodes.find(n=>n.id===item.nodeId):null;
        const note=kind==='claims'?`${item.relation}: ${item.title}`:`${old?.title||item.nodeId} → ${item.title||item.details?.slice(0,70)||item.semanticType||item.constraintStatus||''}`;
        label.append(box,document.createTextNode(note));group.append(label);
      });div.append(group);
    }
  }
  function refreshProposal(){
    if(!stagedProposal)return;
    try{
      if(!$('proposalAssessments').checked){$('proposalSharedReasons').checked=false;$('proposalSharedReasons').disabled=true;}
      else $('proposalSharedReasons').disabled=false;
      const options=Object.fromEntries(Object.entries(proposalOptionIds).map(([key,id])=>[key,$(id).checked]));
      for(const group of $('proposalItemChoices').querySelectorAll('[data-kind]'))for(const input of group.querySelectorAll('input'))input.disabled=!options[group.dataset.kind];
      if(stagedProposal.format===Contributions.GROUP_FORMAT){
        const names=Object.fromEntries([...$('proposalGroupSources').querySelectorAll('input[data-source-user-id]')]
          .map(input=>[input.dataset.sourceUserId,input.value.trim()]));
        if(Object.values(names).some(name=>!name))throw Error('Jokaisella tekijällä on oltava nimi');
        appliedProposal=Contributions.mergeBundle(project,stagedProposal,Core,options,names);
        const c=appliedProposal.counts;
        $('aiReviewPreview').textContent=[
          'Yhteinen muutos- ja arviointitiedosto – jokaisella omat tekijätiedot',
          ...appliedProposal.actors.map(a=>`${a.name} · ${a.kind==='ai'?'AI':'Ihminen'} · ${a.id}`),
          `Uusia solmuja: ${c.claims} · muokkauksia: ${c.edits} · arviointeja: ${c.assessments} · kommentteja: ${c.comments}`,
          `Vanhat tekijältään tuntemattomat muokkaukset, joita ei sisällytetty: ${appliedProposal.unattributedEdits}`,
          'Tiedosto ei todista henkilöllisyyttä. Hyväksy vain luotettavasta lähteestä saatu sisältö.'
        ].join('\n');
        $('btnAIReviewApply').disabled=false;return;
      }
      const source={kind:$('proposalSourceKind').value,name:$('proposalSourceName').value.trim()};
      if(!source.name)throw Error(t('contributionUsername'));
      appliedProposal=Contributions.merge(project,proposalFiltered(),Core,options,source);
      const c=appliedProposal.counts;
      $('aiReviewPreview').textContent=[
        `${source.kind==='human'?t('contributionHuman'):t('contributionAI')}: ${source.name}`,
        `${t('contributionClaims')}: ${c.claims}`,`${t('contributionEdits')}: ${c.edits}`,`${t('contributionLinks')}: ${c.links}`,
        `${t('contributionShared')}: ${c.sharedReasons} + ${c.sharedAttachments}`,
        `${t('includeRatings')}: ${c.assessments}`,`${t('includeComments')}: ${c.comments}`,
        ...(options.assessments?stagedProposal.assessments.slice(0,15).map(a=>`  ${project.nodes.find(n=>n.id===a.nodeId)?.title||a.nodeId}: ${a.credence??'–'}% · ${a.primaryInfluence??'–'}/5`):[]),
        ...(options.comments?stagedProposal.comments.slice(0,12).map(c=>`  ${project.nodes.find(n=>n.id===c.nodeId)?.title||stagedProposal.claims.find(n=>n.tempId===c.nodeId)?.title||c.nodeId}: ${c.body.slice(0,150)}`):[]),
        c.skippedDependent?`Ohitettuja viittauksia pois jätettyihin solmuihin: ${c.skippedDependent}`:''
      ].filter(Boolean).join('\n');
      $('btnAIReviewApply').disabled=false;
    }catch(error){appliedProposal=null;$('aiReviewPreview').textContent=error.message||t('operationFailed');$('btnAIReviewApply').disabled=true;}
  }
  function previewContribution(raw,sourceName='Muutosehdotus'){
    try{
      const report=inspectImport(raw,'contribution',sourceName);if(!report.ok){stagedProposal=null;return;}
      stagedProposal=report.parsed.format===Contributions.GROUP_FORMAT
        ?Contributions.validateBundle(report.parsed):Contributions.validate(report.parsed);
      for(const [key,id] of Object.entries(proposalOptionIds))$(id).checked=true;
      for(const k of ['claims','edits'])selectedProposalItems[k]=new Set((stagedProposal[k]||[]).map((_,i)=>i));
      if(stagedProposal.format!==Contributions.GROUP_FORMAT){
        $('proposalSourceKind').value=stagedProposal.author.kind;
        $('proposalSourceName').value=stagedProposal.author.name;
      }
      previewChoiceList();refreshProposal();
      if($('aiReviewDialog').open)$('aiReviewDialog').close();
      $('aiReviewPreviewDialog').showModal();
    }catch(error){stagedProposal=null;showImportReport({format:'contribution',formatName:'WITT-/AI-muutosehdotus v2',issues:[{code:'IMPORT',path:'$',message:error.message||t('operationFailed'),fix:'Korjaa muutosehdotus ja varmista, että se vastaa nykyistä dokumenttia.'}]},sourceName);}
  }
  function importContribution(){
    if(!appliedProposal||!stagedProposal)return;
    const prepared=appliedProposal;
    const originalProfiles=new Set(project.users.map(u=>u.id));
    const aiWithRatings=stagedProposal.author?.kind==='ai'&&$('proposalAssessments').checked&&prepared.counts.assessments>0;
    const succeeded=mutation(()=>{
      if(Contributions.fingerprint(Core.validateProject(project))!==stagedProposal.baseFingerprint)throw Error('Dokumentti on muuttunut ehdotuksen viennin jälkeen.');
      project=prepared.project;
    });
    if(succeeded){
      if(aiWithRatings){
        const addedAI=project.users.find(u=>Core.isAIProfile(u)&&!originalProfiles.has(u.id));
        if(addedAI){view.indexMode='personal';view.viewAssessorId=addedAI.id;view.workflow='evaluate';view.layers.index=true;view.layers.confidence=true;view.layers.impact=true;view.highlightOptions=project.mode==='decision';saveView();render();}
      }
      stagedProposal=null;appliedProposal=null;$('aiReviewPreviewDialog').close();enterEditor();
    }
  }
  function exportHumanProposal(base){
    const selected=[...$('contributionExporterList').querySelectorAll('input[data-export-user-id]:checked')].map(input=>input.value);
    if(!selected.length)throw Error('Valitse vähintään yksi käyttäjä');
    const bundle=Contributions.diffBundle(base,project,Core,selected);
    downloadFile(`witt-yhteismuutokset-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(bundle,null,2)+'\n','application/json;charset=utf-8');
    $('contributionExportStatus').textContent=
      `Viety ${bundle.contributors.length} käyttäjän muutokset omilla nimillään. `+
      (bundle.unattributedEdits.length||bundle.unattributedLinks||bundle.unattributedComments
        ? `Huom. ${bundle.unattributedEdits.length} aiemman tekstimuokkauksen, ${bundle.unattributedLinks} yhteyden ja ${bundle.unattributedComments} kommentin tekijää ei voitu todentaa; niitä ei viety. Tallenna koko WITT-tiedosto säilyttääksesi ne.`
        : 'Tekijättömiä muokkauksia ei löytynyt.');
    $('aiReviewStatus').textContent=t('savedFile');
  }

  function localizeSaveStatus() {
    const current = $('saveStatus').textContent;
    const keys = ['noServer','savedBrowser','savedFile','saveFailed','sessionOnlyStatus'];
    for (const key of keys) {
      if (I18n.languages.some(lang => I18n.messages[lang][key] === current)) {
        $('saveStatus').textContent = t(key);
        return;
      }
    }
  }

  function bindUI() {
    for(const key of ['left','top','right','bottom'])$('btnZone'+key[0].toUpperCase()+key.slice(1)).onclick=()=>toggleZone(key);
    $('btnEditMenuSelected').onclick=()=>startInlineEdit(selectedId);
    for(const [id,relation] of [['btnEditMenuSupport','support'],['btnEditMenuOppose','oppose'],['btnEditMenuNeutral','neutral'],
      ['btnBottomSupport','support'],['btnBottomOppose','oppose'],['btnBottomNeutral','neutral']])$(id).onclick=()=>addNode(relation);
    $('btnEditMenuOption').onclick=()=>addNode('option',Core.rootNode(project).id);
    for(const id of ['btnEditMenuMove','btnBottomMove'])$(id).onclick=()=>openMoveDialog(selectedId);
    for(const id of ['btnEditMenuDelete','btnBottomDelete'])$(id).onclick=()=>deleteNode(selectedId);
    $('btnEditMenuCollapse').onclick=()=>setSubtreeCollapsed(selectedId);
    // Direct button handlers: sandboxed viewers may block HTML form submission.
    $('replaceCancel').onclick=()=>$('replaceDialog').close('cancel');
    $('replaceForget').onclick=()=>$('replaceDialog').close('discard');
    $('replaceKeep').onclick=()=>$('replaceDialog').close('save');
    $('btnLibrarySaveCurrent').onclick=async()=>{if(await saveCurrentToLibrary()){await libraryRows();$('libraryStatus').textContent=t('librarySavedExplicit');}};
    $('confirmCancel').onclick = () => $('confirmDialog').close('cancel');
    $('confirmAccept').onclick = () => $('confirmDialog').close('confirm');
    $('noticeClose').onclick = () => $('noticeDialog').close('close');
    bindImportReport();
    $('textCancel').onclick = () => $('textDialog').close('cancel');
    $('textAccept').onclick = () => {
      const field = $('textValue');
      if (!field.value.trim()) { field.value = ''; field.reportValidity(); field.focus(); return; }
      $('textDialog').close('confirm');
    };
    $('textValue').addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); $('textAccept').click(); }
    });
    $('btnTreeView').onclick = () => selectPresentation('tree');
    $('btnTableView').onclick = () => selectPresentation('table');
    $('tableComments').onchange = event => {
      view.layers.comments = event.target.checked;
      saveView(); renderTable();
    };
    $('tableFilter').onchange = event => {
      tableState.stance = event.target.value;
      tableState.expandedId = null;
      renderTable();
    };
    $('tableSearch').oninput = event => {
      tableState.query = event.target.value;
      tableState.expandedId = null;
      renderTable();
    };
    $('linkImpact').addEventListener('input', () => { $('linkImpactValue').textContent = signed(Number($('linkImpact').value)); });
    $('linkAdd').onclick = () => {
      const sourceId = linkNodeId, targetId = $('linkTarget').value;
      if (!targetId) return;
      const influence=Number($('linkImpact').value);
      mutation(()=>{
        const link=Core.addSignedLink(project,sourceId,targetId,influence);
        // The explicit slider action is this user's assessment of the new
        // relation, never a synthetic assessment attributed to other people.
        Core.upsertEdgeAssessment(project,'secondary',link.id,actorId,influence);
      });
    };
    $('linkClose').onclick = () => $('linkDialog').close();
    $('linkDialog').addEventListener('close', () => { linkNodeId = null;linkFocusId=null; });
    $('localeSelect').value = locale;
    $('homeLocaleSelect').value = locale;
    $('homeLocaleSelect').onchange = event => {
      locale = I18n.setLocale(event.target.value);
      $('localeSelect').value = locale;
      I18n.apply(document); render(); renderHomeWorkspace(); updateAIPrompt();
    };
    for (const id of ['btnHomeLogo','btnHomeAbout','btnHomeHelp','btnEditorAbout']) $(id).onclick = showAbout;
    for (const id of ['btnAboutClose','btnAboutDone']) $(id).onclick = () => $('aboutDialog').close();
    $('btnBackHome').onclick = showHome;
    const openNewWork=()=>{$('newWorkDialog').showModal();};
    const createNewWork=async mode=>{
      $('newWorkDialog').close();
      if(!await prepareReplacement(t('newDocumentConfirm')))return;
      if(replaceProject(Core.createBlankProject(mode)))enterEditor();
    };
    $('btnHomeNew').onclick=openNewWork;
    $('btnNewWorkClose').onclick=()=>$('newWorkDialog').close();
    $('btnNewWorkArgument').onclick=()=>createNewWork('argument');
    $('btnNewWorkDecision').onclick=()=>createNewWork('decision');
    $('btnHomeContinue').onclick = enterEditor;
    $('btnHomeDemo').onclick = openExamples;
    $('btnHomeTutorial').onclick = startTutorial;
    $('btnTutorial').onclick = startTutorial;
    $('btnCloseExamples').onclick = ()=>$('examplesDialog').close();
    for(const id of ['btnReviewLens','btnReviewLensTable','btnReviewLensQuick'])$(id).onclick=openReviewLens;
    $('btnCloseLens').onclick=$('btnLensDone').onclick=()=>$('reviewLensDialog').close();
    $('btnLensAll').onclick=()=>{setReviewSelection(null);renderReviewLensDialog();};
    $('btnLensCurrent').onclick=()=>{setReviewSelection([actorId]);renderReviewLensDialog();};
    $('tutorialClose').onclick=()=>{tutorial=null;renderTutorial();};
    $('tutorialNext').onclick=()=>{
      if(!tutorial)return;
      if(tutorial.step===7){tutorial=null;renderTutorial();return;}
      tutorial.step++;
      if(tutorial.step===6)showMessyTutorialTree();
      renderTutorial();
    };
    $('tutorialTarget').onclick=tutorialShowTarget;
    initTutorialDrag();
    $('btnShortcutsReset').onclick=()=>{shortcuts={...SHORTCUT_DEFAULTS};try{storage.removeItem(SHORTCUT_STORAGE);}catch(_){}renderShortcutSettings();updateShortcutTitles();updateShortcutHelpText();$('shortcutSettingsStatus').textContent=t('shortcutSaved');};
    $('btnHomeOpen').onclick = chooseFile;
    $('btnHomeAI').onclick = $('btnAIDraft').onclick = ()=>{$('newWorkDialog').close();openAIDraft();};
    $('btnHomeAIReview').onclick = $('btnAIReview').onclick = openAIReview;
    $('btnHomeLibrary').onclick = $('btnLibrary').onclick = openLibrary;
    $('btnLibraryBackup').onclick=async()=>{
      try {
            const repo=await initLibrary();if(!repo)throw libraryFailure||Error(t('libraryUnavailable'));
        const backup=await repo.exportBundle();
        downloadFile('witt-library-backup.json',JSON.stringify(backup,null,2)+'\n','application/json;charset=utf-8');
        $('libraryStatus').textContent=t('libraryBackupReady',{count:backup.documents.length});
      }catch(err){$('libraryStatus').textContent=err.message;}
    };
    $('btnLibraryRestore').onclick=()=>$('libraryBackupInput').click();
    $('libraryBackupInput').onchange=async event=>{
      const file=event.target.files?.[0];event.target.value='';if(!file)return;
      try {
        if(file.size>25_000_000)throw Error(t('importTooLarge'));
        const report=inspectImport(await file.text(),'library',file.name);
        if(!report.ok)return;
        const backup=report.parsed;
        // Do not restore silently: the action can create many new records.
        if(!await askConfirm(t('libraryRestoreConfirm',{count:backup.documents.length}),t('libraryRestore')))return;
        const repo=await initLibrary();if(!repo)throw libraryFailure||Error(t('libraryUnavailable'));
            const result=await repo.importBundle(backup,Core.validateProject,Core.uid);
        await libraryRows();
        $('libraryStatus').textContent=t('libraryRestored',{count:result.imported,copies:result.duplicated});
      }catch(err){$('libraryStatus').textContent=err.message||t('libraryInvalidBackup');}
    };
    $('btnLibraryRefresh').onclick = libraryRows;
    $('btnLibraryClose').onclick = ()=>$('libraryDialog').close();
    $('btnAIReviewClose').onclick = ()=>$('aiReviewDialog').close();
    $('btnAIReviewReject').onclick = ()=>{stagedProposal=null;appliedProposal=null;$('aiReviewPreviewDialog').close();};
    $('btnAIReviewExport').onclick = ()=>{const task=currentContributionTask();downloadFile('witt-ai-muutosehdotus-tehtava.txt',task,'text/plain;charset=utf-8');$('aiReviewTaskStatus').textContent=t('aiTaskDownloaded');};
    $('btnAIReviewSchema').onclick = ()=>downloadFile('witt-contribution-v2.schema.json',JSON.stringify(Contributions.schema,null,2)+'\n','application/json;charset=utf-8');
    $('btnAIReviewCopy').onclick = async ()=>{const task=currentContributionTask();
      try{await navigator.clipboard.writeText(task);$('aiReviewTaskStatus').textContent=t('aiTaskCopied');}
      catch(_){$('aiReviewPromptPreview').value=task;$('aiReviewPromptPreviewDetails').open=true;$('aiReviewPromptPreview').focus();$('aiReviewPromptPreview').select();$('aiReviewTaskStatus').textContent=t('aiTaskManualCopy');}
    };
    $('aiReviewMode').onchange=updateAIReviewPrompt;
    $('btnAIReviewUpload').onclick = ()=>$('aiReviewInput').click();
    $('aiReviewInput').onchange=async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;try{if(file.size>5_000_000){showImportSizeError(file.name,5);return;}previewContribution(await file.text(),file.name);}catch(err){$('aiReviewStatus').textContent=err.message;}};
    $('btnAIReviewImport').onclick = ()=>previewContribution($('aiReviewPaste').value);
    $('btnAIReviewApply').onclick=importContribution;
    for(const id of Object.values(proposalOptionIds))$(id).onchange=refreshProposal;
    $('proposalSourceKind').onchange=refreshProposal;
    $('proposalSourceName').oninput=refreshProposal;
    $('btnContributionEditUsers').onclick=()=>{$('aiReviewDialog').close();renderPeople();$('peopleDialog').showModal();};
    $('btnWITTExport').onclick=()=>$('wittOriginalInput').click();
    $('wittOriginalInput').onchange=async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;try{if(file.size>5_000_000)throw Error(t('importTooLarge'));const report=inspectImport(await file.text(),'project',file.name);if(!report.ok)return;exportHumanProposal(Core.validateProject(report.parsed));}catch(err){$('contributionExportStatus').textContent=err.message||t('operationFailed');}};
    $('btnAIClose').onclick = ()=>$('aiDialog').close();
    $('btnAIFlowPrompt').onclick=$('btnAIToPrompt').onclick=()=>selectAIDraftStep('prompt');
    $('btnAIFlowImport').onclick=$('btnAIToImport').onclick=()=>selectAIDraftStep('import');
    $('btnDraftCancel').onclick = ()=>{stagedDraft=null;$('aiDraftPreviewDialog').close();};
    $('btnDraftApply').onclick=applyDraft;
    $('draftIncludeRatings').onchange=()=>{if(!$('draftIncludeRatings').checked)$('draftIncludeShared').checked=false;
      $('draftIncludeShared').disabled=!$('draftIncludeRatings').checked;};
    for(const id of ['aiTopic','aiContext'])$(id).oninput=updateAIPrompt;
    $('aiMode').onchange=updateAIPrompt;
    $('btnAICopy').onclick = async () => {const task=currentDraftTask();
      try {await navigator.clipboard.writeText(task);$('aiDraftTaskStatus').textContent=t('aiTaskCopied');}
      catch (_) {$('aiPromptPreview').value=task;$('aiDraftPromptPreviewDetails').open=true;$('aiPromptPreview').focus();$('aiPromptPreview').select();$('aiDraftTaskStatus').textContent=t('aiTaskManualCopy');}
    };
    $('btnAIDownloadPrompt').onclick=()=>{downloadFile('witt-ai-uusi-puu-tehtava.txt',currentDraftTask(),'text/plain;charset=utf-8');$('aiDraftTaskStatus').textContent=t('aiTaskDownloaded');};
    $('btnAIDownloadSchema').onclick=()=>downloadFile('witt-ai-draft-v2.schema.json',JSON.stringify(AIDraft.schema,null,2)+'\n','application/json;charset=utf-8');
    $('btnAIImport').onclick=()=>$('aiDraftInput').click();
    $('aiDraftInput').onchange=async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;try{if(file.size>5_000_000){showImportSizeError(file.name,5);return;}previewDraft(await file.text(),file.name);}catch(error){$('aiStatus').textContent=error.message;}};
    $('btnAIShowPreview').onclick=()=>previewDraft($('aiDraftPaste').value);
    for(const id of ['btnKeyboardQuick','btnKeyboardTop','btnHelp'])$(id).onclick=openShortcutHelp;
    for (const id of ['btnAssess', 'btnAssessQuick']) $(id).onclick = startAssessment;
    $('btnAssessClose').onclick = closeAssessment;
    $('btnAssessPrev').onclick = () => {
      if (assessment.finished) { assessment.finished = false; assessmentRender(); }
      else moveAssessment(-1);
    };
    $('btnAssessSkip').onclick = () => moveAssessment(1, false);
    $('btnAssessNext').onclick = () => moveAssessment(1, true);
    $('btnAssessUnreviewed').onclick = () => {
      assessment.cursorId = assessment.order.find(id => !assessment.done.has(id)) || assessment.order[0];
      assessment.finished = false; saveAssessmentPass(); assessmentRender(); focusAssessmentInput();
    };
    $('btnAssessRestart').onclick = async () => {
      if (!await askConfirm(t('assessmentRestartConfirm'))) return;
      assessment.done.clear(); assessment.cursorId = assessment.order[0]; assessment.finished = false;
      saveAssessmentPass(); assessmentRender(); focusAssessmentInput();
    };
    $('assessmentCredence').oninput = event => { $('assessmentCredenceNumber').value = event.target.value; };
    $('assessmentCredenceNumber').oninput = event => {
      const n = Number(event.target.value);
      if (event.target.value !== '' && Number.isFinite(n)) $('assessmentCredence').value = String(Math.max(0,Math.min(100,Math.round(n))));
    };
    $('assessmentInfluence').oninput = assessmentUpdateInfluence;
    $('assessmentDialog').addEventListener('keydown', event => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !assessment.finished) {
        event.preventDefault(); event.stopPropagation(); moveAssessment(1, true);
      }
    });

    $('btnEditQuick').onclick = () => startInlineEdit(selectedId);
    for (const id of ['btnArrangeQuick', 'btnLayout']) $(id).onclick = ()=>{arrangeTree();if(tutorial?.step===6){tutorial.step=7;renderTutorial();}};
    $('btnCompactTree').onclick=toggleCompactVisible;
    $('btnCollapseOptions').onclick=toggleOptionBranches;
    $('btnUndoQuick').onclick = undo;
    $('btnMoveClose').onclick = $('btnMoveCancel').onclick = () => { $('moveNodeDialog').close(); moveNodeId = null; };
    $('btnMoveConfirm').onclick = finishMove;
    $('nodeContextMenu').addEventListener('keydown', event => {
      const items = [...$('nodeContextMenu').querySelectorAll('button:not(:disabled)')];
      const index = items.indexOf(document.activeElement);
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeContextMenu(); }
      else if (['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
        event.preventDefault();
        const next = event.key==='Home' ? 0 : event.key==='End' ? items.length-1 : (index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;
        items[next]?.focus();
      }
    });
    document.addEventListener('pointerdown', event => {
      if (!$('nodeContextMenu').hidden && !$('nodeContextMenu').contains(event.target)) closeContextMenu(false);
    }, true);
    $('localeSelect').addEventListener('change', event => {
      locale = I18n.setLocale(event.target.value);
      $('homeLocaleSelect').value = locale;
      I18n.apply(document);
      localizeSaveStatus();
      render();updateShortcutTitles();
    });
    for (const id of ['btnFocusView', 'btnFocusQuick']) $(id).onclick = () => toggleFocus();
    $('btnOrientationQuick').onclick = toggleOrientation;
    $('orientationSelect').onchange = event => { view.orientation = event.target.value; saveView(); refreshCanvasButtons(); renderNodes(); requestAnimationFrame(fitViewport); };

    $('indexModeSelect').onchange = event=>choosePerspective(event.target.value);
    $('aiOptionHighlights').onchange = event=>{view.highlightOptions=event.target.checked;saveView();render();};
    $('btnPerspectiveOwn').onclick=()=>choosePerspective('personal');
    $('btnAIResults').onclick=openAIResults;
    $('btnAIResultsClose').onclick=()=>$('aiResultsDialog').close();
    $('btnAIResultsShow').onclick=showAIResultsPerspective;
    $('aiResultsAssessorSelect').onchange=renderAIResultsSummary;
    $('importantToggle').onchange = event=>{view.showImportance=event.target.checked;saveView();render();};
    function setWorkflow(next){if(!['explore','evaluate'].includes(next))return;view.workflow=next;
      view.layers={...LAYER_PRESETS[next==='explore'?'text':'analysis']};view.layers.comments=true;
      saveView();render();requestAnimationFrame(fitViewport);
    }
    $('workflowSelect').onchange=event=>setWorkflow(event.target.value);
    for(const button of document.querySelectorAll('[data-workflow]'))button.onclick=()=>setWorkflow(button.dataset.workflow);
    $('projectTitle').addEventListener('change', event => mutation(() => { project.title = event.target.value.trim() || project.title; }));
    for (const id of ['themeSelect', 'homeThemeSelect']) $(id).addEventListener('change', event => changeAppearance(event.target.value));
    for (const id of ['actorSelect', 'actorQuickSelect']) $(id).addEventListener('change', event => chooseActor(event.target.value));
    $('modeArgument').onclick = () => mutation(() => { project.mode = 'argument'; Core.rootNode(project).kind = 'claim';
      // Existing options remain in file; therefore changing mode is refused when options exist.
      if (project.nodes.some(n => ['option','group'].includes(n.relation))) throw Error(t('optionsPreventArgumentMode'));
    });
    $('modeDecision').onclick = () => mutation(() => { project.mode = 'decision'; Core.rootNode(project).kind = 'decision'; });
    $('viewPreset').onchange = event => {
      const preset = event.target.value;
      if (LAYER_PRESETS[preset]) {
        view.layers = { ...LAYER_PRESETS[preset] };
        saveView(); render(); requestAnimationFrame(fitViewport);
      }
    };
    $('btnLayers').onclick = () => { view.layersOpen = !view.layersOpen; renderViewControls(); };
    $('btnViewSettings').onclick=toggleViewDock;
    $('btnViewPanelMenu').onclick=showViewDock;
    $('btnDockCollapse').onclick=()=>{view.dockCollapsed=!view.dockCollapsed;saveView();renderViewControls();};
    $('btnDockClose').onclick=()=>{hideViewDock();$('btnViewSettings').focus({preventScroll:true});};
    $('treeDepthSlider').oninput=event=>{
      view.depthLimit=Number(event.target.value);depthOverrides.clear();
      saveView();render();requestAnimationFrame(fitViewport);
    };
    $('btnDepthReset').onclick=()=>{view.depthLimit=null;depthOverrides.clear();saveView();render();requestAnimationFrame(fitViewport);};
    $('showAuthors').onchange=e=>mutation(()=>{project.settings.showAuthors=e.target.checked;});
    initViewDockDrag();
    $('dragFromText').onchange=e=>{view.dragFromText=e.target.checked;saveView();render();};
    $('showSharedReasons').onchange=e=>{view.showRecurringInTree=e.target.checked;saveView();render();};
    for (const input of document.querySelectorAll('input[data-layer]')) {
      input.onchange = event => {
        view.layers[event.target.dataset.layer] = event.target.checked;
        saveView(); render(); requestAnimationFrame(fitViewport);
      };
    }
    for (const button of document.querySelectorAll('[data-focus]')) {
      button.onclick = () => {
        if (view.focus.mode === 'all' && button.dataset.focus !== 'all') view.focus.anchorId = selectedId;
        view.focus.mode = button.dataset.focus;
        explicitlyClosedIds.clear(); // user requested a fresh focus reveal
        saveView(); render(); requestAnimationFrame(fitViewport);
      };
    }
    $('btnFocusAnchor').onclick = () => {
      view.focus.anchorId = selectedId;
      explicitlyClosedIds.clear();
      saveView(); render();
      if (view.focus.mode !== 'all') requestAnimationFrame(fitViewport);
    };
    $('btnNew').onclick = openNewWork;
    $('btnDemo').onclick = openExamples;
    $('btnOpen').onclick = chooseFile;
    $('fileInput').onchange = e => { openFile(e.target.files?.[0]); e.target.value = ''; };
    $('btnSave').onclick = exportFile;
    $('btnExportVisual').onclick=openVisualExport;
    $('btnExportClose').onclick=$('btnExportCancel').onclick=()=>$('visualExportDialog').close();
    $('exportFormat').onchange=updateVisualFormat;
    $('exportResolution').onchange=$('exportPngMode').onchange=$('exportScope').onchange=$('exportDetail').onchange=$('exportCompact').onchange=updatePngEstimate;
    $('btnExportDownload').onclick=downloadVisual;
    for (const menu of document.querySelectorAll('.toolbar-popover')) {
      menu.addEventListener('click',event=>{if(event.target.closest('button'))menu.open=false;});
    }
    document.addEventListener('pointerdown',event=>{
      for(const menu of document.querySelectorAll('.toolbar-popover'))if(menu.open&&!menu.contains(event.target))menu.open=false;
    });

    $('btnUndo').onclick = undo; $('btnRedo').onclick = redo;
    $('btnFit').onclick = fitViewport; $('zoomReset').onclick = fitViewport;
    $('btnSupport').onclick = () => addNode('support');
    $('btnOppose').onclick = () => addNode('oppose');
    $('btnNeutral').onclick = () => addNode('neutral');
    $('btnOption').onclick = () => addNode('option',project.nodes.find(n=>n.id===selectedId)?.kind==='group'?selectedId:Core.rootNode(project).id);
    $('btnOptionGroup').onclick=()=>addNode('group',project.nodes.find(n=>n.id===selectedId)?.kind==='group'?selectedId:Core.rootNode(project).id);
    $('btnSharedReasons').onclick=()=>openSharedReasons();
    $('btnSharedMenu').onclick=()=>openSharedReasons();
    $('btnContextReasons').onclick=openRepeatLibrary;
    $('btnOutlineTab').onclick=()=>{repeatPaneOpen=false;selectedLibraryReason=null;render();};
    $('btnRepeatTab').onclick=openRepeatLibrary;
    // Give explicit in-place feedback. Native required validation used to
    // block the submit event without showing a library-specific explanation.
    // A new card used to appear *above* the form (outside the scroll viewport).
    const repeatStatus=(message,error=false)=>{
      const output=$('repeatLibraryStatus');output.textContent=message;
      output.classList.toggle('is-error',error);
    };
    $('repeatNewTitle').oninput=()=>{
      $('repeatNewTitle').removeAttribute('aria-invalid');repeatStatus('');
    };
    // A real one-click creation action: unlike the old HTML form submit,
    // it works on an empty field and makes an editable placeholder card.
    const createLibraryReason=()=>{
      const field=$('repeatNewTitle');
      const title=field.value.trim()||t('repeatDefaultTitle');
      if(!canEdit()){repeatStatus(t('viewerCannotEdit'),true);return;}
      let created=null;
      const mode=$('repeatNewMode').value;
      const ok=mutation(()=>{created=mode==='locked'
        ?Core.addSharedReason(project,title,Number($('repeatNewConfidence').value),Number($('repeatNewImpact').value))
        :Core.addReasonConcept(project,title,$('repeatNewSemantic').value);});
      if(!ok||!created){repeatStatus(t('repeatCreateFailed'),true);return;}
      field.value='';field.removeAttribute('aria-invalid');
      selectedLibraryReason={type:mode==='locked'?'locked':'concept',id:created.id};
      repeatStatus(t('repeatCreated'));render();
      const card=[...$('repeatCards').querySelectorAll('.repeat-card')]
        .find(item=>item.dataset.reasonId===created.id);
      if(card){card.scrollIntoView({block:'nearest',inline:'nearest'});card.focus({preventScroll:true});}
      if(!field.value.trim() && title===t('repeatDefaultTitle')){
        const nameEditor=$('inspector').querySelector('.repeat-inspector-label input');
        if(nameEditor){nameEditor.focus({preventScroll:true});nameEditor.select();}
      }
    };
    $('btnRepeatCreate').onclick=createLibraryReason;
    $('repeatCreateForm').onsubmit=event=>{event.preventDefault();createLibraryReason();};
    $('repeatNewMode').onchange=()=>{$('repeatNewLockedFields').hidden=$('repeatNewMode').value!=='locked';};
    $('btnRepeatPromote').onclick=()=>{
      let promoted=null;
      const ok=mutation(()=>{promoted=Core.promoteReasonConcept(project,selectedId);});
      if(ok){selectedLibraryReason={type:'concept',id:promoted.id};render();}
    };
    $('btnContextMenu').onclick=openRepeatLibrary;
    $('btnReuseLockedFromContext').onclick=()=>{const target=contextAttachTargetId;$('contextReasonsDialog').close();openSharedReasons(target);};
    $('btnReuseContextFromShared').onclick=()=>{const target=sharedAttachTargetId;$('sharedReasonsDialog').close();openContextReasons(target);};
    $('btnContextClose').onclick=$('btnContextDone').onclick=()=>$('contextReasonsDialog').close();
    $('contextCreateForm').onsubmit=event=>{event.preventDefault();
      if(mutation(()=>{const concept=Core.addReasonConcept(project,$('contextNewTitle').value,$('contextNewKind').value);const parent=project.nodes.find(n=>n.id===contextAttachTargetId);
        if(parent&&['claim','option'].includes(parent.kind)&&!parent.sharedReasonId){const use=Core.attachReasonConcept(project,concept.id,parent.id,actorId);selectedId=use.id;}
      })){$('contextNewTitle').value='';renderContextReasons();}
    };
    $('btnSharedClose').onclick=$('btnSharedDone').onclick=()=>$('sharedReasonsDialog').close();
    $('sharedCreateForm').onsubmit=event=>{event.preventDefault();
      if(mutation(()=>Core.addSharedReason(project,$('sharedNewTitle').value,Number($('sharedNewConfidence').value),Number($('sharedNewInfluence').value)))){
        $('sharedNewTitle').value='';$('sharedNewConfidence').value='100';$('sharedNewInfluence').value='3';renderSharedReasons();
      }
    };
    $('btnPeople').onclick = () => { renderPeople(); $('peopleDialog').showModal(); };
    $('currentUserName').addEventListener('change',e=>{
      const next=e.target.value.trim(), person=userProfile();
      if(!next||Core.isAIProfile(person)||project.users.some(u=>u.id!==person.id&&u.name.toLocaleLowerCase()===next.toLocaleLowerCase())){
        showMessage(t('profileNameTaken'));renderPeople();return;
      }
      mutation(()=>{person.name=next;});renderPeople();
    });
    $('btnVoting').onclick=openVoteDialog;
    $('btnVoteClose').onclick=$('btnVoteDone').onclick=()=>{$('voteDialog').close();};
    $('voteDialog').addEventListener('close',()=>ballotDrafts.clear());
    $('btnVotePeople').onclick=()=>{ $('voteDialog').close();renderPeople();$('peopleDialog').showModal(); };
    $('btnVoteStart').onclick=startVotingFromUI;
    $('btnVoteEnd').onclick=endVotingFromUI;
    $('voteWeighting').onchange=e=>mutation(()=>{if(project.votingRound?.status==='open')throw Error(t('voteLocked'));project.settings.voteWeighting=e.target.value;});
    $('assessmentWeighting').onchange=e=>mutation(()=>{if(!isOwner())throw Error(t('viewerCannotEdit'));project.settings.assessmentWeighting=e.target.value;});
    $('btnClosePeople').onclick = $('btnDialogClose').onclick = () => $('peopleDialog').close();
    $('btnAddPerson').onclick = () => addLocalProfile(false);
    $('btnHelp').onclick = openShortcutHelp;
    $('btnCloseHelp').onclick = $('btnHelpClose').onclick = () => $('helpDialog').close();
    $('zoomIn').onclick = () => { const rect = $('viewport').getBoundingClientRect(); zoomAround(camera.scale * 1.2, rect.left + rect.width / 2, rect.top + rect.height / 2); };
    $('zoomOut').onclick = () => { const rect = $('viewport').getBoundingClientRect(); zoomAround(camera.scale / 1.2, rect.left + rect.width / 2, rect.top + rect.height / 2); };
    const viewport = $('viewport');
    viewport.addEventListener('wheel', event => {
      event.preventDefault();
      zoomAround(camera.scale * (event.deltaY > 0 ? .93 : 1.07), event.clientX, event.clientY);
    }, { passive: false });
    viewport.addEventListener('pointerdown', event => {
      if (event.button !== 0 || event.target.closest('.node')) return;
      viewport.classList.add('panning');
      const x = event.clientX, y = event.clientY, oldX = camera.x, oldY = camera.y;
      viewport.setPointerCapture(event.pointerId);
      const move = e => { camera.x = oldX + e.clientX - x; camera.y = oldY + e.clientY - y; cameraApply(); };
      const stop = () => {
        viewport.classList.remove('panning');
        viewport.removeEventListener('pointermove', move); viewport.removeEventListener('pointerup', stop); viewport.removeEventListener('pointercancel', stop);
      };
      viewport.addEventListener('pointermove', move);
      viewport.addEventListener('pointerup', stop);
      viewport.addEventListener('pointercancel', stop);
    });
    document.addEventListener('keydown', event => {
      const editing = event.target.closest('input,textarea,select,dialog,[contenteditable="true"]');
      if(event.altKey&&!event.ctrlKey&&!event.metaKey&&event.key.toLowerCase()==='v'&&!editing&&!document.body.classList.contains('home-active')) {
        event.preventDefault();toggleViewDock();return;
      }
      if(event.altKey&&event.shiftKey&&!event.ctrlKey&&!event.metaKey&&event.code==='KeyO'&&!editing&&project.mode==='decision'&&!document.body.classList.contains('home-active')){event.preventDefault();toggleOptionBranches();return;}
      const cmd = event.ctrlKey || event.metaKey;
      if (cmd && event.key.toLowerCase() === 's') {event.preventDefault(); exportFile(); return;}
      if (event.key === 'Escape' && !$('nodeContextMenu').hidden) {
        event.preventDefault(); closeContextMenu(); return;
      }
      if (event.key === 'Escape' && focusOnly && !editing) {
        event.preventDefault(); toggleFocus(false); return;
      }
      if (editing) return;
      if(!document.body.classList.contains('home-active') && event.altKey&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&['1','2','3','4'].includes(event.key)){
        event.preventDefault();toggleZone({1:'left',2:'top',3:'right',4:'bottom'}[event.key]);return;
      }
      // Canvas controls are separate from node/tree navigation shortcuts.
      // Ctrl/Cmd +/- zoom around viewport center; Alt+arrow pans by screen pixels.
      if(!document.body.classList.contains('home-active') && view.presentation==='tree'){
        const rect=$('viewport').getBoundingClientRect(),cx=rect.left+rect.width/2,cy=rect.top+rect.height/2;
        if(cmd && !event.altKey && (event.key==='+'||event.key==='='||event.key==='-'||event.key==='_')){
          event.preventDefault();zoomAround(camera.scale*((event.key==='+'||event.key==='=')?1.2:1/1.2),cx,cy);return;
        }
        if(!cmd&&!event.shiftKey&&!event.altKey&&event.key==='0'){
          event.preventDefault();fitViewport();return;
        }
        if(event.altKey&&!cmd&&!event.shiftKey&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)){
          event.preventDefault();const v={ArrowUp:[0,100],ArrowDown:[0,-100],ArrowLeft:[100,0],ArrowRight:[-100,0]}[event.key];
          camera.x+=v[0];camera.y+=v[1];cameraApply();return;
        }
      }
      if(document.body.classList.contains('home-active')) {if(shortcutFor(event)==='help'){event.preventDefault();openShortcutHelp();}return;}
      const mapped=shortcutFor(event);
      if(mapped){
        event.preventDefault();
        if(mapped==='support'||mapped==='oppose')addNode(mapped);
        else if(mapped==='option'&&project.mode==='decision')addNode('option',Core.rootNode(project).id);
        else if(mapped==='table')selectPresentation(view.presentation === 'table' ? 'tree' : 'table');
        else if(mapped==='focus')toggleFocus();
        else if(mapped==='assessment')startAssessment();
        else if(mapped==='help')openShortcutHelp();
        else if(mapped==='arrange')arrangeTree();
        return;
      }
      // Compatibility combinations remain usable even after + / - become defaults.
      // A deliberate custom mapping of Ctrl+Enter to another action wins above.
      if (cmd && !event.altKey && event.key === 'Enter') {
        event.preventDefault(); addNode(event.shiftKey ? 'oppose' : 'support'); return;
      }
      if (cmd && event.key.toLowerCase() === 'z') {
        event.preventDefault(); event.shiftKey ? redo() : undo(); return;
      }
      if (cmd && event.key.toLowerCase() === 'y') {event.preventDefault(); redo(); return;}
      if (!cmd && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'g') {
        event.preventDefault(); focusSelectedNode(); return;
      }
      if ((event.shiftKey && event.key === 'F10') || event.key === 'ContextMenu') {
        if (event.target === $('viewport')) {
          event.preventDefault();
          const node = [...$('nodesLayer').querySelectorAll('.node')].find(n => n.dataset.id === selectedId);
          const rect = node?.getBoundingClientRect();
          if (rect) openContextMenu(selectedId,rect.left+60,rect.top+35);
        }
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        const node = project.nodes.find(n => n.id === selectedId);
        if (node?.parentId) { event.preventDefault(); deleteNode(selectedId); }
      }
    });
  }

  project = hydrate();
  view.fourWayOffsets=project.layout.fourWayOffsets;
  restoreActor();
  loadReviewSelection();
  selectedId = Core.rootNode(project).id;
  bindUI(); I18n.apply(document); localizeSaveStatus(); render(); updateShortcutTitles(); showHome();
  initLibrary();
})();
