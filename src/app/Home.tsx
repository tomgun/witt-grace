// The home screen (UI_INVENTORY S-01): one main action, three groups of others, and the warnings.
import { EditionBadge } from './EditionBadge.tsx';
import { HomeBackdrop } from './HomeBackdrop.tsx';
import { dismissInviteForGood, dismissInviteForNow, useTutorialInvite } from './Tutorial.tsx';
import { useEffect, useRef, useState } from 'react';
import { LanguageSelect, ThemeSelect, ACRONYMS } from './TopBar.tsx';
import { homeCard } from '../lib/workspaceMeta.ts';
import type { MessageKey } from '../lib/i18n/catalog.ts';
import { getStore, useAppState, useTranslator } from './store.ts';

interface Scenario {
  label: MessageKey;
  root: MessageKey;
  pro: MessageKey;
  proWhy: MessageKey;
  con: MessageKey;
  conWhy: MessageKey;
}
/** The home screen's example trees: one size, five walks of life (owner 2026-11-20, S-15). All synthetic. */
const SCENARIOS: readonly Scenario[] = [
  {
    label: 'homeScenarioLabel1',
    root: 'homeCanvasRoot',
    pro: 'homeCanvasForTitle',
    proWhy: 'homeCanvasForDetail',
    con: 'homeCanvasAgainstTitle',
    conWhy: 'homeCanvasAgainstDetail',
  },
  ...([2, 3, 4, 5] as const).map((n): Scenario => ({
    label: `homeScenarioLabel${n}`,
    root: `homeScenario${n}Root`,
    pro: `homeScenario${n}For`,
    proWhy: `homeScenario${n}ForDetail`,
    con: `homeScenario${n}Against`,
    conWhy: `homeScenario${n}AgainstDetail`,
  })),
];

export function Home() {
  const state = useAppState();
  const t = useTranslator();
  const store = getStore();
  const card = homeCard({
    store: window.localStorage,
    project: state.project,
    hydrationFailed: state.hydrationFailed,
    temporary: !state.storagePersistent,
    locale: state.language,
    t,
  });
  const hasWork = card.canContinue;
  const continueRef = useRef<HTMLButtonElement>(null);
  const newRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    (continueRef.current ?? newRef.current)?.focus();
  }, []);
  const continueWork = () => store.setHome(false);
  const invite = useTutorialInvite();
  const [scenario, setScenario] = useState(0);
  const [picked, setPicked] = useState(false);
  const [hovering, setHovering] = useState(false);
  useEffect(() => {
    if (picked || hovering || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => setScenario((i) => (i + 1) % SCENARIOS.length), 8000);
    return () => window.clearInterval(timer);
  }, [picked, hovering]);
  const shown = SCENARIOS[scenario] as Scenario;
  // The method is told on the page itself (owner 2026-11-20, S-15): the links take the reader to it.
  const toMethod = () => {
    const heading = document.getElementById('homeMethodTitle');
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    heading?.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
    heading?.focus({ preventScroll: true });
  };
  const gains = [
    ['methodGain1T', 'methodGain1'],
    ['methodGain2T', 'methodGain2'],
    ['methodGain3T', 'methodGain3'],
    ['methodGain4T', 'methodGain4'],
  ] as const;
  const stages = [
    ['homeStageMap', 'homeExplore'],
    ['homeStageEvaluate', 'homeEvaluate'],
    ['homeStageDecide', 'homeDecide'],
  ] as const;
  return (
    <div id="homeScreen" className="home-screen" data-testid="home">
      <HomeBackdrop appearance={state.appearance} />
      <nav className="home-nav" aria-label="WITT">
        <button
          type="button"
          id="btnHomeLogo"
          className="home-brand"
          aria-label={t('acronymDetails')}
          title={ACRONYMS}
          onClick={() => store.openDialog('about')}
        >
          <span className="home-brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span>
            WITT<span className="brand-dot">.</span> <small>GRACE Method</small>
          </span>
          <span className="home-info-mark" aria-hidden="true">
            ⓘ
          </span>
        </button>
        <EditionBadge />
        <div className="home-nav-actions">
          <LanguageSelect id="homeLocaleSelect" />
          <ThemeSelect id="homeThemeSelect" />
          <button type="button" className="btn quiet" id="btnHomeAbout" onClick={toMethod}>
            {t('homeAbout')}
          </button>
        </div>
      </nav>
      <main className="home-main">
        <div className="home-hero">
          <div className="home-hero-copy">
            <p className="home-eyebrow">{t('homeEyebrow')}</p>
            <h1 id="homeTitle">
              <span className="home-hero-line">{t('homeHeroFirst')}</span>
              <span className="home-hero-line accent">{t('homeHeroSecond')}</span>
            </h1>
            <p className="home-lead">{t('homeLead')}</p>
            <p className="home-audience">{t('homeAudience')}</p>
            <p className="home-method-link">
              <button type="button" id="btnHomeHelp" onClick={toMethod}>
                {t('homeLearn')} <span aria-hidden="true">↓</span>
              </button>
            </p>
            {invite ? (
              // Asked, not imposed (owner 2026-11-19, S-15): a card on the page, three plain answers, and where to
              // find the walkthroughs later, so that saying no costs nothing.
              <section className="home-invite" id="tutorialInvite" aria-labelledby="tutorialInviteTitle">
                <h2 id="tutorialInviteTitle">{t('tutInviteTitle')}</h2>
                <p>{t('tutInviteText')}</p>
                <div className="home-invite-actions">
                  <button
                    type="button"
                    className="btn primary"
                    id="btnInviteStart"
                    onClick={() => window.dispatchEvent(new CustomEvent('witt-tutorial'))}
                  >
                    {t('tutInviteStart')}
                  </button>
                  <button
                    type="button"
                    className="btn quiet"
                    id="btnInviteLater"
                    onClick={dismissInviteForNow}
                  >
                    {t('tutInviteLater')}
                  </button>
                  <button
                    type="button"
                    className="btn quiet"
                    id="btnInviteNever"
                    onClick={dismissInviteForGood}
                  >
                    {t('tutInviteNever')}
                  </button>
                </div>
                <small>{t('tutInviteWhere')}</small>
              </section>
            ) : null}
            <div className="home-main-actions">
              {hasWork ? (
                <button
                  type="button"
                  className="btn primary home-primary"
                  id="btnHomeContinue"
                  data-testid="home-continue"
                  ref={continueRef}
                  title={card.saved ? `${card.browserSaveLabel}: ${card.browserSave}` : undefined}
                  onClick={continueWork}
                >
                  {card.title ? t('homeContinueNamed', { title: card.title }) : t('homeContinue')}
                </button>
              ) : null}
              <button
                type="button"
                className={hasWork || invite ? 'btn quiet home-secondary' : 'btn primary home-primary'}
                id="btnHomeNew"
                data-testid="home-new"
                ref={newRef}
                onClick={() => store.openDialog('newWork')}
              >
                {t('homeNew')}
              </button>
            </div>
            {/* Three small groups by what the person came to do (owner 2026-11-19, S-15): fewer things to weigh at
                once, and nothing here that needs an open document (importing and exporting additions lives in the
                document's own menus). */}
            <div className="home-groups">
              <div className="home-other-actions home-group" role="group" aria-labelledby="homeGroupOpen">
                <span className="home-group-label" id="homeGroupOpen">
                  {t('homeGroupOpen')}
                </span>
                <button
                  type="button"
                  id="btnHomeOpen"
                  onClick={() => window.dispatchEvent(new CustomEvent('witt-open-file'))}
                >
                  {t('homeOpen')}
                </button>
                <button type="button" id="btnHomeLibrary" onClick={() => store.openDialog('library')}>
                  {t('documentLibrary')}
                </button>
              </div>
              <div className="home-other-actions home-group" role="group" aria-labelledby="homeGroupLearn">
                <span className="home-group-label" id="homeGroupLearn">
                  {t('homeGroupLearn')}
                </span>
                <button
                  type="button"
                  id="btnHomeTutorial"
                  onClick={() => window.dispatchEvent(new CustomEvent('witt-tutorial'))}
                >
                  {t('tutorialStart')}
                </button>
                <button type="button" id="btnHomeDemo" onClick={() => store.openDialog('examples')}>
                  {t('homeDemo')}
                </button>
              </div>
              <div className="home-other-actions home-group" role="group" aria-labelledby="homeGroupTogether">
                <span className="home-group-label" id="homeGroupTogether">
                  {t('homeGroupTogether')}
                </span>
                <button type="button" id="btnHomeCollab" onClick={() => store.openDialog('collab')}>
                  {t('collabHome')}
                </button>
              </div>
            </div>
            {card.showUnreadableWarning ? (
              <p id="homeSaveWarning" className="home-save-warning">
                {t('homeUnreadableWarning')}
              </p>
            ) : null}
            {card.showSessionWarning ? (
              <p id="homeSessionWarning" className="home-save-warning">
                {t('sessionOnlyWarning')}
              </p>
            ) : null}
            <p className="home-privacy">{t('homePrivacy')}</p>
          </div>
          {/* A picture of the tool, not content: hidden from a screen reader, its dots not in the tab order. Five
              small scenarios take turns (owner 2026-11-20, S-15): slowly, not at all when motion is to be reduced,
              and never again once the reader has picked one or while the pointer rests on the picture. */}
          <div
            className="home-visual"
            aria-hidden="true"
            data-scenario={scenario + 1}
            onPointerEnter={() => setHovering(true)}
            onPointerLeave={() => setHovering(false)}
          >
            <span className="visual-kicker">
              {t('homeCanvasLabel')} · <span id="homeScenarioName">{t(shown.label)}</span>
            </span>
            <div className="visual-scenario" key={scenario}>
              <div className="visual-root">
                <span className="visual-mini-icon">◇</span> <span>{t(shown.root)}</span>
              </div>
              <div className="visual-branches">
                <div className="visual-node supporting">
                  <small>{t('homeCanvasFor')}</small>
                  <strong>{t(shown.pro)}</strong>
                </div>
                <div className="visual-node opposing">
                  <small>{t('homeCanvasAgainst')}</small>
                  <strong>{t(shown.con)}</strong>
                </div>
              </div>
              {/* The reasons' own reasons as cards of their own, as in the real tree (owner 2026-11-20: the lines
                  inside the cards "ei näytä tutulta"). The catalog's older texts begin with an arrow that is dropped. */}
              <div className="visual-leaves">
                <div className="visual-node leaf supporting">
                  <small>{t('homeCanvasFor')}</small>
                  <strong>{t(shown.proWhy).replace(/^↳\s*/, '')}</strong>
                </div>
                <div className="visual-node leaf opposing">
                  <small>{t('homeCanvasAgainst')}</small>
                  <strong>{t(shown.conWhy).replace(/^↳\s*/, '')}</strong>
                </div>
              </div>
            </div>
            <div className="visual-dots">
              {SCENARIOS.map((item, i) => (
                <button
                  key={item.label}
                  type="button"
                  tabIndex={-1}
                  className={i === scenario ? 'active' : ''}
                  title={t('homeScenarioPick', { name: t(item.label) })}
                  onClick={() => {
                    setScenario(i);
                    setPicked(true);
                  }}
                />
              ))}
            </div>
            <div className="visual-footer">
              <span className="visual-dot" /> <span>{t('homeCanvasSteps')}</span>
            </div>
          </div>
        </div>
        <section className="home-method" id="homeMethod" aria-labelledby="homeMethodTitle">
          <h2 id="homeMethodTitle" tabIndex={-1}>
            {t('methodTitle')}
          </h2>
          <p className="method-lead">{t('methodLead')}</p>
          <h3>{t('homeUseHeading')}</h3>
          <ul className="home-uses">
            <li>
              <strong>{t('homeUseMapT')}</strong>
              <span>{t('homeUseMap')}</span>
            </li>
            <li>
              <strong>{t('homeUseGraceT')}</strong>
              <span>{t('homeUseGrace')}</span>
            </li>
          </ul>
          <h3>{t('methodGainHeading')}</h3>
          <ul className="method-gains">
            {gains.map(([title, text]) => (
              <li key={title}>
                <strong>{t(title)}</strong>
                <span>{t(text)}</span>
              </li>
            ))}
          </ul>
          <h3 id="homeStagesHeading">{t('methodHowHeading')}</h3>
          <ol className="home-features" aria-labelledby="homeStagesHeading">
            {stages.map(([title, text], i) => (
              <li key={title}>
                <span className="feature-number" aria-hidden="true">{`0${i + 1}`}</span>
                <h4>{t(title)}</h4>
                <p>{t(text)}</p>
              </li>
            ))}
          </ol>
          <p className="method-questions">{t('methodTwoQuestions')}</p>
          <div className="method-pair">
            <div>
              <h3>{t('methodFitHeading')}</h3>
              <p>{t('methodFit')}</p>
            </div>
            <div>
              <h3>{t('methodNotHeading')}</h3>
              <p>{t('methodNot')}</p>
            </div>
          </div>
          <p className="method-privacy">{t('methodPrivacy')}</p>
          <div className="home-method-actions">
            <button
              type="button"
              className="btn primary"
              id="btnMethodTutorial"
              onClick={() => window.dispatchEvent(new CustomEvent('witt-tutorial'))}
            >
              {t('tutInviteStart')}
            </button>
            <button
              type="button"
              className="btn quiet"
              id="btnMethodDemo"
              onClick={() => store.openDialog('examples')}
            >
              {t('homeDemo')}
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
