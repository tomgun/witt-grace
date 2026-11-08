"""Dev30: current-work identity/timestamps before replacement and neutral multi-route diagnostics."""
from pathlib import Path
import json
import traceback
from playwright.sync_api import sync_playwright

root=Path(__file__).resolve().parent.parent
out=root/'dist/qa-dev30'
out.mkdir(parents=True,exist_ok=True)
html=(root/'dist/witt-standalone.html').read_text()
source=json.loads((root/'examples/witt-bitberg-reititys-dev26.witt.json').read_text())
source['title']='Keskeneräinen strategiapäätös – tärkeä työ'
source['updatedAt']='2026-11-07T17:31:00Z'
meta={'active':{'id':source['id'],'title':source['title'],'savedAt':'2026-11-07T18:55:00Z'}}
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
 for w,h in [(1440,900),(390,844)]:
  page=browser.new_page(viewport={'width':w,'height':h},accept_downloads=True)
  errors=[]
  page.on('pageerror',lambda err: errors.append(str(err)))
  step='init'
  try:
   page.goto('about:blank')
   page.evaluate('''(entries) => {
     const values = new Map(Object.entries(entries));
     Object.defineProperty(window,'localStorage',{configurable:true,value:{
       getItem:k=>values.has(k)?values.get(k):null,
       setItem:(k,v)=>values.set(k,String(v)),
       removeItem:k=>values.delete(k), clear:()=>values.clear()
     }});
   }''',{'witt-project-v3':json.dumps(source,ensure_ascii=False),'witt-workspace-meta-v1':json.dumps(meta)})
   page.set_content(html,wait_until='load')
   step='home/current'
   assert page.locator('#btnHomeContinue').is_visible()
   assert source['title'] in page.locator('#homeCurrentTitle').inner_text()
   step='new replacement'
   page.locator('#btnHomeNew').click(timeout=9000)
   page.locator('#btnNewWorkDecision').click(timeout=9000)
   assert page.locator('#replaceDialog').evaluate('(el)=>el.open')
   assert page.locator('#replaceCurrentName').inner_text()==source['title']
   assert 'Argumentointi' in page.locator('#replaceCurrentInfo').inner_text()
   assert 'Solmuja' in page.locator('#replaceCurrentInfo').inner_text()
   edited=page.locator('#replaceEditedAt').inner_text();saved=page.locator('#replaceAutosavedAt').inner_text()
   assert edited and saved and edited!=saved and 'Tarkka' not in edited,(edited,saved)
   assert page.locator('#replaceDescription').inner_text()
   page.screenshot(path=str(out/f'current-before-new-{w}.png'))
   page.locator('#replaceCancel').click(timeout=9000)
   assert page.locator('#replaceCurrentName').inner_text()==source['title']
   step='file replacement'
   incoming=root/'examples/debate-kaupunkiliikenne.witt.json'
   page.locator('#fileInput').set_input_files(str(incoming))
   assert page.locator('#replaceDialog').evaluate('(el)=>el.open')
   assert page.locator('#replaceCurrentName').inner_text()==source['title']
   assert page.locator('#replaceEditedAt').inner_text()==edited
   assert 'JSON' in page.locator('#replaceDescription').inner_text()
   page.screenshot(path=str(out/f'current-before-file-{w}.png'))
   page.locator('#replaceCancel').click(timeout=9000)
   step='routes are informational'
   if w<=760:
    page.locator('#btnHomeContinue').click(timeout=9000)
    page.locator('#fileMenu summary').click(timeout=9000)
    page.locator('#editMenu summary').click(timeout=5000);page.locator('#btnContextMenu').click(timeout=9000)
   else:
    page.locator('#btnHomeContinue').click(timeout=9000)
    page.locator('#btnRepeatTab').click(timeout=9000)
   assert page.locator('#repeatLibraryPane').is_visible()
   cards=page.locator('#repeatSecondaryCards .repeat-link-card')
   assert cards.count()>0,'fixture must have secondary relations'
   note_cards=page.locator('#repeatSecondaryCards .repeat-link-card.has-route-note')
   assert note_cards.count()>0,'same anchor routes should be noted'
   assert page.locator('.has-overlap').count()==0
   page.locator('#repeatCrossLinks summary').click(timeout=9000)
   note_cards.first.click(timeout=9000)
   assert page.locator('#linkDialog').evaluate('(el)=>el.open')
   assert page.locator('#linkDialog .link-route-note').count()>0
   text=page.locator('#linkDialog .link-route-note').first.inner_text()
   assert 'Yhteysreittien huomio' in text and 'lasketaan mukaan' in text,text
   page.screenshot(path=str(out/f'neutral-route-{w}.png'))
   assert not errors,errors
   print(f'{w}: PASS current draft details, timestamps, import/new cancellation, neutral route notice',flush=True)
  except Exception as exc:
   print(f'{w}: FAIL {step}: {exc}, errors={errors}',flush=True)
   page.screenshot(path=str(out/f'error-{w}.png'))
   traceback.print_exc()
   raise
  finally:page.close()
 browser.close()
