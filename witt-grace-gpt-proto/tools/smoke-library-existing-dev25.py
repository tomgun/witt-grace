from pathlib import Path
from playwright.sync_api import sync_playwright
import json
root=Path(__file__).resolve().parent.parent
html=(root/'dist/witt-standalone.html').read_text()
fixture=root/'examples'/'toistuvat-perustelut-dev24.witt.json'
assert fixture.exists()
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1440,'height':900})
 errors=[];page.on('pageerror',lambda err:errors.append(str(err)))
 page.goto('about:blank');page.set_content(html)
 page.locator('#fileInput').set_input_files(str(fixture))
 try:
  page.locator('#replaceDialog').wait_for(state='visible',timeout=1300)
  page.locator('#replaceForget').click()
 except Exception: pass
 page.locator('#btnRepeatTab').click(timeout=8000)
 count=page.locator('#repeatCards .repeat-card').count()
 page.locator('#repeatNewTitle').fill('Uusi perustelu olemassa olevaan v7-puuhun')
 page.locator('#btnRepeatCreate').click()
 assert page.locator('#repeatCards .repeat-card').count()==count+1
 assert page.locator('#repeatCards .repeat-card.selected').count()==1
 assert not errors,errors
 print('PASS existing v7 imported document: before',count,'after',count+1,'no JS errors')
 b.close()
