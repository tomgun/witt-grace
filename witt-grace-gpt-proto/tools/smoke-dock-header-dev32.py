import os
"""Dev32: toggleable view settings beside its trigger and header zone controls."""
from pathlib import Path
import traceback
from playwright.sync_api import sync_playwright, expect
root=Path(__file__).resolve().parent.parent
html=(root/'dist/witt-standalone.html').read_text()
out=root/'dist/qa-dev32';out.mkdir(parents=True, exist_ok=True)
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path=(os.environ.get('WITT_CHROMIUM_EXECUTABLE') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').is_file() else None)),args=['--no-sandbox','--disable-dev-shm-usage'])
 for width,height in ((1440,900),(390,844)):
  page=browser.new_page(viewport={'width':width,'height':height},accept_downloads=True)
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  step='start'
  try:
   page.goto('about:blank')
   page.evaluate('''() => {const map = new Map();window.__testStorage=map;Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)}});}''')
   page.set_content(html,wait_until='load')
   page.locator('#btnHomeNew').click()
   page.locator('#btnNewWorkArgument').click()
   if page.locator('#replaceDialog').evaluate('(e)=>e.open'):page.locator('#replaceForget').click()
   expect(page.locator('body')).not_to_have_class('home-active')
   step='header order'
   assert page.locator('.header-right > .zone-controls').count()==1
   assert page.locator('.header-right > .zone-controls + label[for="localeSelect"]').count()==1
   assert page.locator('#btnZoneTop').is_visible() and page.locator('#localeSelect').is_visible()
   assert page.locator('#themeSelect').is_visible()
   # DOM order explicitly dictates grouping, and viewport must not overflow.
   assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 2'),page.evaluate('document.documentElement.scrollWidth')
   step='initial closed'
   assert not page.locator('#viewDock').is_visible()
   assert page.locator('#btnViewSettings').get_attribute('aria-expanded')=='false'
   step='open beside toolbar button'
   trigger=page.locator('#btnViewSettings')
   trigger.click(timeout=6000)
   panel=page.locator('#viewDock');expect(panel).to_be_visible()
   assert trigger.get_attribute('aria-expanded')=='true'
   page.wait_for_timeout(100)
   a=trigger.bounding_box();b=panel.bounding_box();assert a and b
   assert b['x']>=0 and b['x']+b['width']<=width+1,(width,a,b)
   assert b['y']>=0 and b['y']+b['height']<=height+1,(height,a,b)
   assert abs(b['x']-a['x'])<max(220,width*.35),(a,b)
   assert page.locator('#viewDock').evaluate('(e)=>e.parentElement.classList.contains("app-shell")')
   page.screenshot(path=str(out/f'view-open-{width}.png'))
   step='click same button closes'
   trigger.click(timeout=6000)
   assert not panel.is_visible()
   assert trigger.get_attribute('aria-pressed')=='false'
   step='reopen'
   trigger.click(timeout=6000)
   expect(panel).to_be_visible()
   step='drag out of argument canvas and remember'
   drag=page.locator('#dockMove').bounding_box()
   assert drag,('drag handle missing',width)
   start=panel.bounding_box()
   dest_x=-90 if width>700 else -15
   dest_y=-70 if width>700 else 45
   page.mouse.move(drag['x']+min(30,drag['width']/2),drag['y']+drag['height']/2)
   page.mouse.down()
   page.mouse.move(drag['x']+min(30,drag['width']/2)+dest_x,drag['y']+drag['height']/2+dest_y,steps=9)
   page.mouse.up()
   page.wait_for_timeout(120)
   moved=panel.bounding_box()
   assert abs(start['x']-moved['x'])>3 or abs(start['y']-moved['y'])>3,(start,moved)
   assert moved['x']>=0 and moved['y']>=0
   saved=page.evaluate('JSON.parse(localStorage.getItem("witt-view-v1")).dockScreenPosition')
   assert saved is not None,saved
   step='toggle remembers manual position'
   trigger.click();assert not panel.is_visible()
   trigger.click();page.wait_for_timeout(100)
   again=panel.bounding_box()
   assert abs(again['x']-moved['x'])<3 and abs(again['y']-moved['y'])<3,(moved,again)
   step='double click resets near trigger'
   page.locator('#dockMove').dblclick(timeout=7000)
   page.wait_for_timeout(100)
   assert page.evaluate('JSON.parse(localStorage.getItem("witt-view-v1")).dockScreenPosition') is None
   step='top zone switch remains reachable'
   top=page.locator('#btnZoneTop')
   top.click(timeout=6000)
   assert top.get_attribute('aria-pressed')=='false'
   assert not page.locator('.toolbar').is_visible()
   top.click(timeout=6000)
   assert page.locator('.toolbar').is_visible()
   page.screenshot(path=str(out/f'view-dragged-{width}.png'))
   assert not errors,errors
   print(f'{width}: PASS header grouping, anchored open, toggle close, viewport drag, saved position, reset, zone switches',flush=True)
  except Exception as exc:
   print(f'FAILED {width} at {step}: {exc}; pageerrors={errors}',flush=True)
   page.screenshot(path=str(out/f'error-{width}.png'))
   traceback.print_exc();raise
  finally:page.close()
 browser.close()
