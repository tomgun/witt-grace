const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const I18n = require('../src/i18n.js');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const stylesheet = fs.readFileSync(path.join(__dirname, '..', 'src', 'styles.css'), 'utf8');

const home = html.slice(html.indexOf('<section id="homeScreen"'), html.indexOf('<div class="app-shell">'));

const visibleHomeKeys = [
  'homeEyebrow','homeHeroFirst','homeHeroSecond','homeLead',
  'homeNew','homeContinue','homeOpen','homeDemo','homePrivacy',
  'homeCanvasLabel','homeCanvasRoot','homeCanvasFor','homeCanvasForTitle','homeCanvasForDetail',
  'homeCanvasAgainst','homeCanvasAgainstTitle','homeCanvasAgainstDetail','homeCanvasSteps',
  'homeStageMap','homeStageEvaluate','homeStageDecide',
  'homeExplore','homeEvaluate','homeDecide','homeSoon','homeMethodNote','homeLearn',
  'methodName','homeAbout'
];

test('the landing page localizes every visible headline, sample tree and mode label', () => {
  for (const key of visibleHomeKeys) assert.ok(home.includes(`data-i18n="${key}"`), `missing localization marker: ${key}`);
  for (const literal of ['A THINKING CANVAS','Should we launch?', '>Explore</h2>','>Evaluate</h2>','>Decide Together</h2>']) {
    assert.equal(home.includes(literal), false, `English-only markup leaked: ${literal}`);
  }
  assert.match(home, /<h1 id="homeTitle">[\s\S]*data-i18n="homeHeroFirst"[\s\S]*data-i18n="homeHeroSecond"/);
  assert.match(stylesheet, /\.home-hero h1 \.home-hero-line\.accent/);
});

test('Finnish defaults use Kartoita -> Punnitse -> Päätä, preserving the WITT / GRACE Method logo', () => {
  assert.equal(I18n.messages.fi.explore, 'Kartoita');
  assert.equal(I18n.messages.fi.homeStageMap, 'Kartoita');
  assert.equal(I18n.messages.fi.homeStageEvaluate, 'Punnitse');
  assert.equal(I18n.messages.fi.homeStageDecide, 'Päätä yhdessä');
  assert.equal(I18n.messages.fi.homeHeroFirst, 'Ajattele selkeästi.');
  assert.equal(I18n.messages.fi.homeHeroSecond, 'Päätä viisaasti.');
  assert.equal(I18n.messages.fi.methodName, 'GRACE-menetelmä');
  assert.match(home, /<small>GRACE Method<\/small>/, 'requested brand logo must remain unchanged');
  assert.match(html, /value="explore"/, 'workflow storage key must not be renamed');
});

test('all nine locales have non-Finnish language-specific landing headlines, sample tree and stages', () => {
  const headlinePairs = new Set();
  const sampleRoots = new Set();
  for (const lang of I18n.languages) {
    const t = I18n.messages[lang];
    for (const key of visibleHomeKeys) assert.ok(typeof t[key] === 'string' && t[key].trim(), `${lang}/${key}`);
    headlinePairs.add(`${t.homeHeroFirst} ${t.homeHeroSecond}`);
    sampleRoots.add(t.homeCanvasRoot);
    assert.notEqual(t.homeStageMap, t.homeStageEvaluate, `${lang} must distinguish map from evaluate`);
  }
  assert.equal(headlinePairs.size, 9);
  assert.equal(sampleRoots.size, 9);
  assert.equal(I18n.messages.en.homeHeroFirst, 'Think with WITT.');
  assert.equal(I18n.messages.en.homeHeroSecond, 'Decide with GRACE.');
});

test('home language selection does not translate the user-authored document', () => {
  const doc = require('../src/core.js').createDemoProject();
  const before = JSON.stringify(doc);
  for (const lang of I18n.languages) {
    I18n.setLocale(lang);
    I18n.t('homeCanvasRoot');
    I18n.t('homeHeroFirst');
  }
  I18n.setLocale('fi');
  assert.equal(JSON.stringify(doc), before);
});
