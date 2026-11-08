"""Offline Chromium UI test for empty and named library creation, Bitberg skin,
signed cross-links and routing shelf. Run after npm run build.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
import json,traceback
root=Path(__file__).resolve().parent.parent
html=(root/'dist/witt-standalone.html').read_text()
out=root/'dist/qa-dev26';out.mkdir(exist_ok=True)
fixture=root/'examples/witt-lisayhteydet-dev26.witt.json'
assert fixture.exists()
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
 for width,height in ((1440,900),(390,844)):
  page=browser.new_page(viewport={'width':width,'height':height},accept_downloads=True)
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  step='start'
  try:
   page.goto('about:blank');page.set_content(html,wait_until='load')
   assert page.locator('#homeThemeSelect option[value="bitberg"]').count()==1
   page.locator('#btnHomeNew').click(timeout=7000)
   if page.locator('#newWorkDialog').evaluate('(el)=>el.open'):
    page.locator('#btnNewWorkArgument').click(timeout=7000)
    if page.locator('#replaceDialog').evaluate('(el)=>el.open'):page.locator('#replaceForget').click(timeout=7000)
   step='bitberg';page.locator('#themeSelect').select_option('bitberg')
   assert page.locator('body').get_attribute('data-theme')=='bitberg'
   step='open library'
   if width<=760:
    page.locator('#fileMenu summary').click(timeout=6000)
    page.locator('#btnContextMenu').click(timeout=6000)
   else:page.locator('#btnRepeatTab').click(timeout=6000)
   assert page.locator('#repeatLibraryPane').is_visible()
   step='empty title -> placeholder'
   page.locator('#btnRepeatCreate').click(timeout=6000)
   assert page.locator('#repeatCards .repeat-card').count()==1
   assert page.locator('.repeat-card.selected').count()==1
   assert page.locator('.repeat-inspector-title').inner_text()=='Uusi perustelu'
   step='named library reason'
   page.locator('#repeatNewTitle').fill('Vähentää virheitä')
   page.locator('#btnRepeatCreate').click(timeout=6000)
   assert page.locator('#repeatCards .repeat-card').count()==2
   assert page.locator('.repeat-inspector-title').inner_text()=='Vähentää virheitä'
   assert 'luotu' in page.locator('#repeatLibraryStatus').inner_text()
   page.screenshot(path=str(out/f'bitberg-library-{width}.png'))
   step='save library snapshot'
   page.evaluate('''() => { window.__capturedWittBlob=null;
     URL.createObjectURL=blob=>{window.__capturedWittBlob=blob;return 'blob:test-captured';};
     URL.revokeObjectURL=()=>{};HTMLAnchorElement.prototype.click=function(){};
   }''')
   if not page.locator('#fileMenu').evaluate('(el)=>el.open'):
    page.locator('#fileMenu summary').click(timeout=5000)
   page.locator('#btnSave').click(timeout=5000)
   saved=json.loads(page.evaluate('() => window.__capturedWittBlob.text()'))
   assert saved['schemaVersion']==8
   assert sorted(c['title'] for c in saved['reasonConcepts'])==['Uusi perustelu','Vähentää virheitä']
   step='import v8 fixture'
   page.locator('#fileInput').set_input_files(str(fixture))
   try:
    page.locator('#replaceDialog').wait_for(state='visible',timeout=2500)
    page.locator('#replaceForget').click(timeout=5000)
   except Exception:pass
   expect(page.locator('#nodeCount')).to_have_text('4',timeout=10000)
   step='select nested source'
   source_title='Säästöt ylittävät kustannukset'
   source_node=page.locator('#nodesLayer .node').filter(has_text=source_title).first
   source_node.click(force=True,timeout=6000)
   assert page.locator('#nodeTitle').input_value()==source_title
   step='open link dialog'
   page.locator('#inspector').get_by_role('button',name='Hallinnoi lisäyhteyksiä').click(timeout=6000)
   assert page.locator('#linkDialog').evaluate('(el)=>el.open')
   assert page.locator('#linkImpact').get_attribute('min')=='-5'
   assert page.locator('#linkImpact').get_attribute('max')=='5'
   step='add negative scored link'
   page.locator('#linkImpact').fill('-4')
   assert page.locator('#linkImpactValue').inner_text()=='-4'
   page.locator('#linkAdd').click(timeout=6000)
   assert page.locator('#existingLinks .link-row').count()==1
   assert page.locator('#existingLinks .link-row .link-overlap-warning').count()==1
   step='link update +4'
   page.locator('#existingLinks .link-row input[type="range"]').fill('4')
   assert page.locator('#existingLinks .link-row .link-signed-output').inner_text()=='+4'
   assert page.locator('.link-scale-labels').is_visible()
   page.screenshot(path=str(out/f'bitberg-link-axis-{width}.png'))
   page.locator('#linkClose').click(timeout=6000)
   step='save scored-link snapshot'
   if not page.locator('#fileMenu').evaluate('(el)=>el.open'):
    page.locator('#fileMenu summary').click(timeout=5000)
   page.locator('#btnSave').click(timeout=5000)
   saved=json.loads(page.evaluate('() => window.__capturedWittBlob.text()'))
   assert len(saved['links'])==1
   link=saved['links'][0]
   assert link['impact']==4 and link['relation']=='support'
   assert any(a['subjectType']=='secondary' and a['subjectId']==link['id'] and a['influence']==4 for a in saved['edgeAssessments']),saved['edgeAssessments']
   step='library route shelf'
   if width<=760:
    page.locator('#fileMenu summary').click(timeout=6000)
    page.locator('#btnContextMenu').click(timeout=6000)
   else:page.locator('#btnRepeatTab').click(timeout=6000)
   assert page.locator('#repeatSecondaryCards .repeat-link-card').count()==1
   if not page.locator('#repeatCrossLinks').evaluate('(el)=>el.open'):
    page.locator('#repeatCrossLinks summary').click(timeout=6000)
   assert '+4' in page.locator('#repeatSecondaryCards').inner_text()
   page.screenshot(path=str(out/f'bitberg-routing-{width}.png'))
   assert not errors,errors
   print(width,'PASS library blank and named; Bitberg; signed link create/edit; overlap warning; modulator shelf',flush=True)
  except Exception:
   print('FAIL',width,step,errors,flush=True)
   page.screenshot(path=str(out/f'error-{width}.png'))
   traceback.print_exc();raise
  finally:page.close()
 browser.close()
