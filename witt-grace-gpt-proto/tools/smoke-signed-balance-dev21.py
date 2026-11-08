"""Offline Chromium regression: real controls and collective formula at desktop/mobile."""
import json
from pathlib import Path
from subprocess import check_output
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
html=(root/'dist/witt-standalone.html').read_text()
script=r'''const C=require('./src/core.js'),p=C.createBlankProject('decision'),root=p.nodes[0];
p.title='Painotettu arviointi dev20'; root.title='Mitä teemme?';p.users[0].name='Omistaja';p.users[0].shares=5;
for(let i=0;i<3;i++)p.users.push({id:'u'+i,name:'Osallistuja '+i,shares:1,role:'editor'});
const a=C.addChild(p,root.id,'option',p.users[0].id);a.title='Uimahalli';
const b=C.addChild(p,root.id,'option',p.users[0].id);b.title='Kotona';
const r=C.addChild(p,a.id,'support',p.users[0].id);r.title='Liikunta auttaa';
const leaf=C.addChild(p,r.id,'support',p.users[0].id);leaf.title='Liike virkistää';
for(const [i,user] of p.users.entries()){
 C.upsertVote(p,r.id,user.id,i===0?90:50);C.upsertVote(p,leaf.id,user.id,i===0?90:70);
 C.upsertEdgeAssessment(p,'primary',r.id,user.id,i===0?5:1);
 C.upsertEdgeAssessment(p,'primary',leaf.id,user.id,i===0?4:2);
}
p.settings.voteWeighting='shares';C.autoLayout(p);
p.settings.assessmentWeighting='shares';const expected=C.evaluate(p).get(a.id).score;
p.settings.assessmentWeighting='equal';const equal=C.evaluate(p).get(a.id).score;
p.settings.assessmentWeighting='structural';console.log(JSON.stringify({fixture:C.validateProject(p),expected,equal,leaf:leaf.id,option:a.id}));'''
info=json.loads(check_output(['node','-e',script],cwd=root,text=True))
fixture=info['fixture']
(root/'dist/qa-dev21').mkdir(exist_ok=True)
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 for width in (1440,390):
  page=browser.new_page(viewport={'width':width,'height':960},accept_downloads=True,locale='fi-FI')
  page.set_default_timeout(15000)
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.set_content(html,wait_until='load')
  page.locator('#btnHomeNew').click()
  page.locator('#fileInput').set_input_files({'name':'weighted-dev20.witt.json','mimeType':'application/json','buffer':json.dumps(fixture,ensure_ascii=False).encode()})
  page.wait_for_timeout(250)
  if page.locator('#replaceDialog').is_visible():page.locator('#replaceForget').click()
  page.wait_for_function("document.querySelector('#nodeCount')?.textContent==='5'")
  if width<600:page.locator('#btnTreeView').evaluate('el=>el.click()')
  page.locator('#btnWorkflowEvaluate').evaluate('el=>el.click()')
  def switch(mode):
   page.locator('#btnPeople').evaluate('el=>el.click()')
   selector=page.locator('#assessmentWeighting')
   assert selector.input_value()==switch.last
   selector.select_option(mode)
   page.locator('#btnDialogClose').click()
   switch.last=mode
  switch.last='structural'
  switch('equal')
  page.locator('#btnPeople').evaluate('el=>el.click()')
  assert page.locator('#assessmentWeighting').input_value()=='equal'
  page.locator('#btnDialogClose').click()
  # User-visible option result is derived and not the base 50.
  page.locator('#btnVoting').evaluate('el=>el.click()')
  previews=page.locator('.vote-argument-result')
  assert previews.count()==2,(width,previews.count())
  assert f'{(2*info["equal"]-100):+.1f}' in previews.first.inner_text(),(width,previews.first.inner_text())
  page.locator('#btnVoteClose').click()
  switch('shares')
  page.locator('#btnVoting').evaluate('el=>el.click()')
  previews=page.locator('.vote-argument-result')
  assert f'{(2*info["expected"]-100):+.1f}' in previews.first.inner_text(),(width,previews.first.inner_text())
  assert '—' in previews.nth(1).inner_text(),(width,previews.nth(1).inner_text())
  page.locator('#btnVoteStart').click(force=True)
  row=page.locator('.vote-option-row').first
  assert f'{(2*info["expected"]-100):+.1f}' in row.locator('.vote-argument-result').inner_text()
  page.locator('#btnVoteClose').click()
  # All tree surfaces use signed scores; missing option remains a dash.
  option_node=page.locator('.node').filter(has_text='Uimahalli').first
  assert option_node.count()==1
  net_chip=option_node.locator('.meta-index')
  assert net_chip.count()==1
  assert f'{(2*info["expected"]-100):+.0f}' in net_chip.inner_text(),net_chip.inner_text()
  # Select leaf. The source rating is still present but it is no longer
  # repeated as a 'derived result' on its canvas node.
  leaf=page.locator('.node').filter(has_text='Liike virkistää').first
  assert leaf.count()==1
  metadata=leaf.locator('.meta-index')
  assert metadata.count()==1
  assert '—' in metadata.inner_text(),metadata.inner_text()
  page.locator('#btnPeople').evaluate('el=>el.click()')
  assert page.locator('#assessmentWeighting').input_value()=='shares'
  page.locator('#btnDialogClose').click()
  with page.expect_download() as dl:page.evaluate("document.querySelector('#btnSave').click()")
  doc=json.loads(Path(dl.value.path()).read_text())
  assert doc['settings']['assessmentWeighting']=='shares'
  assert doc['settings']['voteWeighting']=='shares'
  # Visual SVG export must use centered signed figures, not internal 0..100.
  page.locator('#btnExportVisual').evaluate('el=>el.click()')
  page.locator('#exportScope').select_option('all')
  page.locator('#exportDetail').select_option('all')
  page.locator('#exportFormat').select_option('svg')
  with page.expect_download(timeout=25000) as exported:
   page.locator('#btnExportDownload').click()
  svg=Path(exported.value.path()).read_text()
  visual_net=f'{(2*info["expected"]-100):+.0f}'
  assert visual_net in svg,('SVG missing signed score',width,visual_net)
  assert 'netto: '+visual_net in svg,('export lacks score label',width,visual_net,svg.find('netto:'))
  assert 'netto: 65' not in svg,('Raw score leaked in visible net label',width)
  (root/'dist/qa-dev21'/f'signed-export-{width}.svg').write_text(svg)
  page.locator('#btnExportVisualClose').evaluate('el=>el.click()') if page.locator('#btnExportVisualClose').count() else page.keyboard.press('Escape')
  page.screenshot(path=str(root/'dist/qa-dev21'/f'signed-{width}.png'))
  assert not errors,(width,errors)
  print('PASS dev21 signed' ,width,'weighted option',round(info['expected'],3),'equal',round(info['equal'],3),'leaf result hidden, file persisted, vote context visible')
  page.close()
 browser.close()
