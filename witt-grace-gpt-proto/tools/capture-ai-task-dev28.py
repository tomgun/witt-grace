"""Preview initial simplified AI task interface for release notes; no remote calls."""
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
html=(root/'dist/witt-standalone.html').read_text()
with sync_playwright() as pw:
 b=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for width in (1440,390):
  page=b.new_page(viewport={'width':width,'height':900})
  page.set_content(html,wait_until='load')
  page.locator('.home-extra-menu summary').click()
  page.locator('#btnHomeAI').click()
  page.locator('#aiTopic').fill('Kannattaako taloyhtiön asentaa aurinkopaneelit?')
  page.locator('#aiContext').fill('Arvioi kustannuksia, hyötyjä, epävarmuuksia ja vastaperusteluja.')
  assert not page.locator('#btnAIDownloadSchema').is_visible()
  dlg=page.locator('#aiDialog')
  bb=dlg.bounding_box()
  assert bb and bb['x']>=0 and bb['x']+bb['width']<=width+1,bb
  dlg.screenshot(path=str(root/'dist'/f'witt-dev28-ai-task-{width}.png'))
  print(width,'initial UI',bb)
  page.close()
 b.close()
