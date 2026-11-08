"""Check add-local-user menu is an actual action and preserves existing identity."""
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parent.parent
html=(root/'dist/witt-standalone.html').read_text()
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
 for width,height in [(1440,900),(390,844)]:
  page=b.new_page(viewport={'width':width,'height':height})
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto('about:blank');page.evaluate('''() => { const store = new Map(); Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k),clear:()=>store.clear()}}) }''');page.set_content(html,wait_until='load');page.locator('#btnHomeNew').click();page.locator('#btnNewWorkArgument').click()
  # Reused local actor selector is accessible in both viewports.
  actor=page.locator('#actorSelect');orig=actor.input_value()
  actor.select_option('__add_local_user__')
  assert page.locator('#textDialog').evaluate('(d)=>d.open'),'No name dialog'
  assert actor.input_value()==orig,'Sentinel must not become active author'
  page.locator('#textValue').fill('Veera')
  page.locator('#textAccept').click()
  page.wait_for_function('document.querySelector("#actorSelect").selectedOptions[0].textContent.includes("Veera")')
  data=page.evaluate('JSON.parse(localStorage.getItem("witt-project-v3"))')
  assert len(data['users'])==2,data['users']
  assert actor.input_value()==next(u['id'] for u in data['users'] if u['name']=='Veera')
  assert not errors,errors
  print(f'{width}: PASS add user from dropdown and activate by ID',flush=True)
  page.close()
 b.close()
