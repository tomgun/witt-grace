from pathlib import Path
from playwright.sync_api import sync_playwright
import shutil
root=Path(__file__).resolve().parents[1]
html=(root/'dist/witt-standalone.html').read_text()
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path=shutil.which('chromium'),args=['--no-sandbox','--disable-dev-shm-usage'])
 page=b.new_page(viewport={'width':1600,'height':1000},device_scale_factor=1)
 errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('dialog',lambda dialog:dialog.accept())
 page.set_content(html,wait_until='load')
 page.locator('#fileInput').set_input_files(str(root/'examples/four-way-tree.witt.json'))
 page.wait_for_timeout(100)
 assert page.locator('.node').count()==53, page.locator('.node').count()
 page.locator('#orientationSelect').select_option('four-way')
 page.locator('#btnFocusQuick').click()
 page.locator('#zoomReset').click()
 page.screenshot(path='/mnt/data/witt-four-way-large-preview.png')
 print('nodes',page.locator('.node').count(),'edges',page.locator('.edge').count(),'scale',page.locator('#zoomLabel').inner_text())
 assert not errors, errors
 b.close()
