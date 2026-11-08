import os
"""New collaboration bundle with full author attribution and zone toggle UI regression."""
from pathlib import Path
import json,traceback
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parent.parent
html=(root/'dist/witt-standalone.html').read_text()
original=json.loads((root/'examples/dev31-original.witt.json').read_text())
edited=json.loads((root/'examples/dev31-edited.witt.json').read_text())
out=root/'dist/qa-dev31';out.mkdir(exist_ok=True,parents=True)
def boot(browser,project,w,h):
 p=browser.new_page(viewport={'width':w,'height':h},accept_downloads=True)
 p.goto('about:blank')
 p.evaluate('''(project) => {const store=new Map();store.set('witt-project-v3',JSON.stringify(project));Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k),clear:()=>store.clear()}});}''',project)
 p.set_content(html,wait_until='load')
 p.locator('#btnHomeContinue').click(timeout=10000)
 return p
with sync_playwright() as sync:
 browser=sync.chromium.launch(headless=True,executable_path=(os.environ.get('WITT_CHROMIUM_EXECUTABLE') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').is_file() else None)),args=['--no-sandbox','--disable-dev-shm-usage'])
 for w,h in [(1440,900),(390,844)]:
  errors=[];page=None;importer=None;step='boot'
  try:
   page=boot(browser,edited,w,h);page.on('pageerror',lambda e:errors.append(str(e)))
   step='zone controls'
   for zone in ('Left','Right','Top','Bottom'):
    btn=page.locator('#btnZone'+zone)
    assert btn.count()==1
    btn.click()
    assert btn.get_attribute('aria-pressed') in ('true','false')
    btn.click()
   assert page.locator('#editMenu summary').count()==1
   assert page.locator('#btnContextMenu').count()==1
   step='export group'
   page.locator('#fileMenu summary').click()
   page.locator('#btnAIReview').click()
   page.locator('.ai-proposal-step').nth(2).locator('summary').click()
   checked=page.locator('#contributionExporterList input[type=checkbox]:checked')
   assert checked.count()==2,checked.count()
   with page.expect_download(timeout=12000) as download_capture:
    page.locator('#btnWITTExport').click()
    page.locator('#wittOriginalInput').set_input_files(str(root/'examples/dev31-original.witt.json'))
   download=download_capture.value
   bundle=json.loads(Path(download.path()).read_text())
   assert bundle['format']=='witt-contribution-bundle-v1'
   assert {c['name'] for c in bundle['contributors']}=={'Aino','Ben'}
   assert any(c['patch']['edits'] for c in bundle['contributors'] if c['name']=='Ben')
   assert all(not c['patch']['edits'] for c in bundle['contributors'] if c['name']=='Aino')
   assert not bundle['unattributedEdits']
   (out/f'export-{w}.json').write_text(json.dumps(bundle,ensure_ascii=False,indent=2))
   page.screenshot(path=str(out/f'export-{w}.png'))
   step='import group'
   importer=boot(browser,original,w,h);importer.on('pageerror',lambda e:errors.append(str(e)))
   importer.locator('#fileMenu summary').click()
   importer.locator('#btnAIReview').click()
   importer.locator('.ai-proposal-step').nth(1).locator('summary').click()
   importer.locator('#aiReviewPaste').fill(json.dumps(bundle,ensure_ascii=False))
   importer.locator('#btnAIReviewImport').click()
   assert importer.locator('#aiReviewPreviewDialog').evaluate('(e)=>e.open'),'Preview not open'
   assert importer.locator('#proposalGroupSources input').count()==2
   assert not importer.locator('#proposalSingleSource').is_visible()
   assert importer.locator('#btnAIReviewApply').is_enabled(),importer.locator('#aiReviewPreview').inner_text()
   importer.screenshot(path=str(out/f'import-{w}.png'))
   importer.locator('#btnAIReviewApply').click()
   assert importer.locator('#aiReviewPreviewDialog').evaluate('(e)=>!e.open')
   # Content and authors loaded: no duplicate owner and owner ID preserved.
   state=importer.evaluate('JSON.parse(localStorage.getItem("witt-project-v3"))')
   assert state['nodes'][0]['title']=='Benin muokkaama pääväite',state['nodes'][0]
   assert state['nodes'][0].get('lastEditedBy')==next(u['id'] for u in state['users'] if u['name']=='Ben'),state['nodes'][0]
   assert len(state['users'])==2,state['users']
   assert len(state['nodes'])==3,state['nodes']
   assert len(state['votes'])==3
   assert any(c['authorName']=='Ben' for c in state['comments'])
   assert not errors,errors
   print(f'{w}: PASS bundle export/import, separate authors and ratings, zone toggles',flush=True)
  except Exception as exc:
   print(f'{w}: FAIL at {step}: {exc} errors={errors}',flush=True)
   if page:page.screenshot(path=str(out/f'error-export-{w}.png'))
   if importer:importer.screenshot(path=str(out/f'error-import-{w}.png'))
   traceback.print_exc();raise
  finally:
   if page:page.close()
   if importer:importer.close()
 browser.close()
