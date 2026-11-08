// The home screen (UI_INVENTORY S-01): every button, the current-work card and the warnings.
import { useEffect, useRef } from 'react';
import { LanguageSelect, ThemeSelect, ACRONYMS } from './TopBar.tsx';
import { homeCard } from '../lib/workspaceMeta.ts';
import { getStore, useAppState, useTranslator } from './store.ts';

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
  return (
    <section id="homeScreen" className="home-screen" aria-labelledby="homeTitle" data-testid="home">
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
        <div className="home-nav-actions">
          <LanguageSelect id="homeLocaleSelect" />
          <ThemeSelect id="homeThemeSelect" />
          <button
            type="button"
            className="btn quiet"
            id="btnHomeAbout"
            onClick={() => store.openDialog('about')}
          >
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
            <div className="home-main-actions">
              {hasWork ? (
                <button
                  type="button"
                  className="btn quiet home-secondary"
                  id="btnHomeContinue"
                  data-testid="home-continue"
                  ref={continueRef}
                  onClick={continueWork}
                >
                  {t('homeContinue')}
                </button>
              ) : null}
              <button
                type="button"
                className="btn primary home-primary"
                id="btnHomeNew"
                data-testid="home-new"
                ref={newRef}
                onClick={() => store.openDialog('newWork')}
              >
                {t('homeNew')}
              </button>
            </div>
            <div className="home-other-actions home-primary-options" role="group" aria-label={t('homeNew')}>
              <button
                type="button"
                id="btnHomeOpen"
                onClick={() => window.dispatchEvent(new CustomEvent('witt-open-file'))}
              >
                {t('homeOpen')}
              </button>
              <button type="button" id="btnHomeDemo" onClick={() => store.openDialog('examples')}>
                {t('homeDemo')}
              </button>
              <button
                type="button"
                id="btnHomeTutorial"
                onClick={() => window.dispatchEvent(new CustomEvent('witt-tutorial'))}
              >
                {t('tutorialStart')}
              </button>
            </div>
            <details className="home-extra-menu">
              <summary>{t('homeMore')}</summary>
              <div className="home-other-actions home-extra-options">
                <button type="button" id="btnHomeLibrary" onClick={() => store.openDialog('library')}>
                  {t('documentLibrary')}
                </button>
                <button type="button" id="btnHomeAI" onClick={() => store.openDialog('aiDraft')}>
                  {t('newWithAI')}
                </button>
                <button type="button" id="btnHomeAIReview" onClick={() => store.openDialog('aiReview')}>
                  {t('aiProposalMenu')}
                </button>
              </div>
            </details>
            {card.saved ? (
              <section className="home-workspace" id="homeCurrentWork" aria-labelledby="homeSavedHeading">
                <h2 id="homeSavedHeading">{t('homeSavedHeading')}</h2>
                <strong id="homeCurrentTitle">{card.title}</strong>
                <dl>
                  <div>
                    <dt id="homeBrowserSaveLabel">{card.browserSaveLabel}</dt>
                    <dd id="homeBrowserSave">{card.browserSave}</dd>
                  </div>
                  <div>
                    <dt>{t('homeOpenLabel')}</dt>
                    <dd id="homeLatestOpen">{card.latestOpen}</dd>
                  </div>
                  <div>
                    <dt>{t('homeExportLabel')}</dt>
                    <dd id="homeLatestExport">{card.latestExport}</dd>
                  </div>
                </dl>
              </section>
            ) : null}
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
          <div className="home-visual" aria-hidden="true">
            <span className="visual-kicker">{t('homeCanvasLabel')}</span>
            <div className="visual-root">
              <span className="visual-mini-icon">◇</span> <span>{t('homeCanvasRoot')}</span>
            </div>
            <div className="visual-branches">
              <div className="visual-node supporting">
                <small>{t('homeCanvasFor')}</small>
                <strong>{t('homeCanvasForTitle')}</strong>
                <span className="visual-node-child">{t('homeCanvasForDetail')}</span>
              </div>
              <div className="visual-node opposing">
                <small>{t('homeCanvasAgainst')}</small>
                <strong>{t('homeCanvasAgainstTitle')}</strong>
                <span className="visual-node-child">{t('homeCanvasAgainstDetail')}</span>
              </div>
            </div>
            <div className="visual-footer">
              <span className="visual-dot" /> <span>{t('homeCanvasSteps')}</span>
            </div>
          </div>
        </div>
        <div className="home-features" aria-label={t('homeStagesLabel')}>
          <article>
            <span className="feature-number">01</span>
            <h2>{t('homeStageMap')}</h2>
            <p>{t('homeExplore')}</p>
          </article>
          <article>
            <span className="feature-number">02</span>
            <h2>{t('homeStageEvaluate')}</h2>
            <p>{t('homeEvaluate')}</p>
          </article>
          <article>
            <span className="feature-number">03</span>
            <h2>{t('homeStageDecide')}</h2>
            <p>{t('homeDecide')}</p>
            <span className="home-soon">{t('homeSoon')}</span>
          </article>
        </div>
        <div className="home-bottom">
          <span>
            <b>{t('methodName')}</b> <span>{t('homeMethodNote')}</span>
          </span>
          <button type="button" id="btnHomeHelp" onClick={() => store.openDialog('help')}>
            {t('homeLearn')}
          </button>
        </div>
      </main>
    </section>
  );
}
