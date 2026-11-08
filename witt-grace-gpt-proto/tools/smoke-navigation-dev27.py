"""Dev27: menu IA, user identity, dock accessibility, keyboard camera, and multi-target claim shelf."""
from pathlib import Path
import json, traceback
from playwright.sync_api import sync_playwright, expect
root=Path(__file__).resolve().parent.parent
html=(root/'dist/witt-standalone.html').read_text()
fixture=root/'examples/witt-bitberg-reititys-dev26.witt.json'
output=root/'dist/qa-dev27';output.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
 for width,height in ((1440,900),(390,844)):
  page=browser.new_page(viewport={'width':width,'height':height},accept_downloads=True)
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  step='start'
  try:
   page.goto('about:blank');page.set_content(html,wait_until='load')
   step='new work chooser';page.locator('#btnHomeNew').click(timeout=7000)
   assert page.locator('#newWorkDialog').evaluate('(el)=>el.open')
   assert page.locator('#btnNewWorkArgument').is_visible()
   assert page.locator('#btnNewWorkDecision').is_visible()
   step='AI new workflow';page.locator('#btnAIDraft').click(timeout=7000)
   assert page.locator('#aiDialog').evaluate('(el)=>el.open')
   assert page.locator('#aiDraftPromptStep').is_visible()
   page.locator('#btnAIFlowImport').click(timeout=6000)
   assert page.locator('#aiDraftImportStep').is_visible()
   assert not page.locator('#aiDraftPromptStep').is_visible()
   page.locator('#btnAIToPrompt').click(timeout=6000)
   assert page.locator('#aiDraftPromptStep').is_visible()
   page.locator('#btnAIClose').click(timeout=6000)
   step='new blank argument';page.locator('#btnHomeNew').click(timeout=7000)
   page.locator('#btnNewWorkArgument').click(timeout=7000)
   if page.locator('#replaceDialog').evaluate('(el)=>el.open'):page.locator('#replaceForget').click(timeout=6000)
   expect(page.locator('body')).not_to_have_class('home-active',timeout=6000)
   step='menus'
   assert page.locator('#helpMenu #btnDemo').count()==1
   assert page.locator('#helpMenu #btnTutorial').count()==1
   assert page.locator('#fileMenu #btnDemo').count()==0
   assert page.locator('#assessmentMenu #importantToggle').count()==0
   assert page.locator('#viewMenu #importantToggle').count()==1
   assert page.locator('#viewMenu #aiOptionHighlights').count()==1
   step='dock close and show'
   page.locator('#btnViewSettings').click(timeout=7000)
   assert page.locator('#viewDock').is_visible()
   assert page.locator('#dockMove').is_visible()
   if width>700:
    pos=page.locator('#viewDock').bounding_box();drag=page.locator('#dockMove').bounding_box()
    assert pos and drag
    page.mouse.move(drag['x']+min(50,drag['width']/2),drag['y']+drag['height']/2)
    page.mouse.down();page.mouse.move(drag['x']+min(50,drag['width']/2)-60,drag['y']+drag['height']/2+56,steps=8);page.mouse.up()
    newpos=page.locator('#viewDock').bounding_box()
    assert abs(newpos['x']-pos['x'])>10 or abs(newpos['y']-pos['y'])>10,(pos,newpos)
   page.locator('#btnDockClose').click(timeout=6000)
   assert not page.locator('#viewDock').is_visible()
   page.locator('#btnViewSettings').click(timeout=6000)
   assert page.locator('#viewDock').is_visible()
   page.locator('#btnDockClose').click(timeout=6000)
   step='named user and authored project'
   page.locator('#assessmentMenu summary').click(timeout=6000)
   page.locator('#btnPeople').click(timeout=6000)
   assert page.locator('#peopleDialog').evaluate('(el)=>el.open')
   user=page.locator('#currentUserName');assert user.input_value()=='Minä'
   user.fill('Mari – käyttäjä');user.press('Tab')
   expect(page.locator('#actorSelect option:checked')).to_have_text('Mari – käyttäjä')
   page.locator('#btnDialogClose').click(timeout=6000)
   step='keyboard camera'
   page.locator('#viewport').focus()
   before=page.locator('#world').evaluate('(el)=>el.style.transform')
   page.keyboard.down('Control');page.keyboard.press('=');page.keyboard.up('Control')
   after_zoom=page.locator('#world').evaluate('(el)=>el.style.transform')
   assert after_zoom!=before,(before,after_zoom)
   page.keyboard.down('Alt');page.keyboard.press('ArrowRight');page.keyboard.up('Alt')
   after_pan=page.locator('#world').evaluate('(el)=>el.style.transform')
   assert after_pan!=after_zoom,(after_zoom,after_pan)
   page.keyboard.press('0')
   assert page.locator('#world').evaluate('(el)=>el.style.transform')!=after_pan
   step='contribution flow menu'
   page.locator('#fileMenu summary').click(timeout=6000)
   page.locator('#btnAIReview').click(timeout=6000)
   assert page.locator('#aiReviewDialog').evaluate('(el)=>el.open')
   assert page.locator('.ai-proposal-step').count()==3
   assert 'current' in page.locator('.ai-flow-explainer').inner_text().lower() or 'nyky' in page.locator('.ai-flow-explainer').inner_text().lower()
   page.locator('#btnAIReviewClose').click(timeout=6000) if page.locator('#btnAIReviewClose').is_visible() else page.locator('#aiReviewDialog').evaluate('(el)=>el.close()')
   step='import fixture'
   page.locator('#fileInput').set_input_files(str(fixture))
   if page.locator('#replaceDialog').evaluate('(el)=>el.open'):page.locator('#replaceForget').click(timeout=6000)
   expect(page.locator('#nodeCount')).to_have_text('4',timeout=7000)
   step='multi target shelf'
   if width<=760:
    page.locator('#fileMenu summary').click(timeout=6000)
    page.locator('#editMenu summary').click(timeout=5000);page.locator('#btnContextMenu').click(timeout=6000)
   else:page.locator('#btnRepeatTab').click(timeout=6000)
   assert page.locator('#repeatLibraryPane').is_visible()
   expect(page.locator('#repeatMultiCards .repeat-card')).to_have_count(1,timeout=7000)
   card=page.locator('#repeatMultiCards .repeat-card').first
   assert 'Säästöt ylittävät kustannukset' in card.inner_text()
   card.click(timeout=6000)
   assert page.locator('.repeat-inspector-title').inner_text()=='Säästöt ylittävät kustannukset'
   assert page.locator('#inspector .repeat-connection').count()==2
   assert 'Puun ensisijainen yhteys' in page.locator('#inspector').inner_text()
   assert 'Lisäyhteys' in page.locator('#inspector').inner_text()
   page.screenshot(path=str(output/f'connections-{width}.png'))
   step='secondary relation editor'
   page.locator('#inspector .repeat-connection').nth(1).click(timeout=6000)
   assert page.locator('#linkDialog').evaluate('(el)=>el.open')
   page.locator('#linkClose').click(timeout=6000)
   assert not errors,errors
   print(f'{width}: PASS menus, new AI workflow, dock close/move, user rename, keyboard navigation, multi-target claims',flush=True)
  except Exception as exc:
   print('FAILED',width,step,repr(exc),errors,flush=True)
   page.screenshot(path=str(output/f'error-{width}.png'))
   traceback.print_exc();raise
  finally:page.close()
 browser.close()
