from pathlib import Path
from playwright.sync_api import sync_playwright
import traceback
import json

root=Path(__file__).resolve().parent.parent
out=root/'dist/qa-dev29'
out.mkdir(exist_ok=True)
html=(root/'dist/witt-standalone.html').read_text()
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else None,args=['--no-sandbox','--disable-dev-shm-usage'])
 for w,h in [(1440,900),(390,844)]:
  page=browser.new_page(viewport={'width':w,'height':h},accept_downloads=True)
  errs=[];page.on('pageerror',lambda e:errs.append(str(e)))
  step='init'
  try:
   page.goto('about:blank');page.set_content(html,wait_until='load')
   step='new project';page.locator('#btnHomeNew').click(timeout=8000);page.locator('#btnNewWorkArgument').click(timeout=8000)
   step='shelf'
   if w<650:
    page.locator('#editMenu summary').click(timeout=5000)
    page.locator('#btnContextMenu').click(timeout=5000)
   else:page.locator('#btnContextReasons').click(timeout=5000)
   assert page.locator('#repeatLibraryPane').is_visible()
   step='create library';page.locator('#repeatNewTitle').fill('Saamme perheen yhteistä aikaa')
   page.locator('#btnRepeatCreate').click(timeout=6000)
   assert page.locator('#repeatCards .repeat-card').count()==1
   step='hide repeats explicitly'
   page.evaluate('''() => {const c=document.querySelector('#showSharedReasons');c.checked=false;c.dispatchEvent(new Event('change',{bubbles:true}));}''')
   step='attach library';page.locator('.repeat-attach').click(timeout=8000)
   assert page.locator('#showSharedReasons').is_checked(), 'attaching should turn on tree visibility'
   assert page.locator('.node.context-use-node').count()==1
   assert page.locator('.node.context-use-node').first.is_visible(), 'newly attached use should be shown'
   assert page.locator('#nodeConfidence').count()==1
   assert page.locator('#nodeImpact').count()==1
   # The selected use's connection is visible in its OWN inspector.
   assert page.locator('.repeat-node-connections .repeat-connection').count()==1
   first_use=page.locator('.node.context-use-node').first.get_attribute('data-id')
   step='assess first context'
   page.locator('#nodeConfidence').evaluate('el=>{el.value="70";el.dispatchEvent(new Event("change",{bubbles:true}));}')
   page.locator('#nodeImpact').evaluate('el=>{el.value="4";el.dispatchEvent(new Event("change",{bubbles:true}));}')
   step='node direct reuse'
   assert page.locator('#inspector .repeat-from-node').count()==1
   page.locator('#inspector .repeat-from-node').click(timeout=8000)
   assert page.locator('#repeatAttachTarget').count()==1
   assert page.locator('#repeatCards .repeat-card').count()==1
   step='create second target using root plus button'
   # A new sibling claim gives us another legal destination.
   rootnode=page.locator('.node.is-root').first
   rootnode.click(force=True,timeout=8000)
   # Use selected root's inspector; left toolbar may be collapsed when shelf is open.
   page.locator('#editMenu summary').click(timeout=5000);page.locator('#btnEditMenuSupport').click(timeout=8000)
   page.keyboard.press('Enter')
   target=page.locator('.node').last.get_attribute('data-id')
   assert target
   step='select original use'
   page.locator('.node.context-use-node').first.click(force=True,timeout=8000)
   page.locator('#inspector .repeat-from-node').click(timeout=8000)
   assert page.locator(f'#repeatAttachTarget option[value="{target}"]').count()==1
   page.locator('#repeatAttachTarget').select_option(target)
   page.locator('.repeat-attach').click(timeout=8000)
   assert page.locator('.node.context-use-node').count()==2
   assert page.locator('.repeat-node-connections .repeat-connection').count()==2
   assert page.locator('#nodeConfidence').count()==1
   assert page.locator('#nodeImpact').count()==1
   step='assess second context'
   second_use=page.locator('.node.context-use-node.selected').first.get_attribute('data-id')
   assert second_use and second_use!=first_use
   page.locator('#nodeConfidence').evaluate('el=>{el.value="90";el.dispatchEvent(new Event("change",{bubbles:true}));}')
   page.locator('#nodeImpact').evaluate('el=>{el.value="-3";el.dispatchEvent(new Event("change",{bubbles:true}));}')
   step='verify project persistence'
   with page.expect_download(timeout=8000) as pending:
    page.locator('#btnSave').evaluate('el=>el.click()')
   saved=json.loads(Path(pending.value.path()).read_text())
   assert saved and len([n for n in saved['nodes'] if n.get('reasonConceptId')])==2
   assert len(saved.get('links',[]))==0
   votes={(v['nodeId'],v['userId']):v['confidence'] for v in saved['votes']}
   actor=saved['users'][0]['id']
   assert votes.get((first_use,actor))==70, votes
   assert votes.get((second_use,actor))==90, votes
   edges={a['subjectId']:a['influence'] for a in saved['edgeAssessments'] if a['subjectType']=='primary'}
   assert edges.get(first_use)==4,edges
   assert edges.get(second_use)==-3,edges
   step='verify shelf links';page.locator('#repeatCards .repeat-card').first.click(timeout=8000)
   assert page.locator('#inspector .repeat-connection').count()==2
   step='screenshot';page.screenshot(path=str(out/f'unified-{w}.png'))
   assert not errs,errs
   print(w,'PASS reusable creation, reveal, direct node action, second target, two per-context reviews',flush=True)
  except Exception as e:
   print(w,'FAIL',step,str(e)[:650],flush=True)
   print('PAGEERR',errs[:10],flush=True)
   page.screenshot(path=str(out/f'error-{w}.png'))
   traceback.print_exc();raise
  finally:page.close()
 browser.close()
