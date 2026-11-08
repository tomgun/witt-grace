"""Browser export QA: SVG, PNG, PDF; full tree outside viewport; no view mutation."""
from pathlib import Path
from playwright.sync_api import sync_playwright
from io import BytesIO
import fitz
from PIL import Image
base=Path(__file__).resolve().parents[1]
html=(base/'dist/witt-standalone.html').read_text()
out=base/'dist/qa-export';out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    for width,height in [(1440,920),(390,844)]:
        context=browser.new_context(viewport={'width':width,'height':height},accept_downloads=True)
        page=context.new_page();errors=[]
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.evaluate('''()=>{const cache=new Map();Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>cache.has(k)?cache.get(k):null,setItem:(k,v)=>cache.set(k,String(v)),removeItem:k=>cache.delete(k),clear:()=>cache.clear()}})}''')
        page.set_content(html,wait_until='load')
        page.locator('#btnHomeNew').click()
        if page.locator('#replaceDialog').is_visible():page.locator('#replaceForget').click()
        page.locator('#fileInput').set_input_files(str(base/'examples/debate-painonhallinta.witt.json'))
        page.wait_for_timeout(250) # import validation is async; avoid racing replacement confirmation
        if page.locator('#replaceDialog').is_visible():page.locator('#replaceForget').click()
        page.locator('#btnTreeView').click()
        assert not page.locator('body').evaluate('(b)=>b.classList.contains("home-active")')
        before=page.evaluate('''()=>({project:localStorage.getItem('witt-project-v3'),view:localStorage.getItem('witt-view-v1')})''')
        page.locator('#fileMenu summary').click()
        page.locator('#btnExportVisual').click()
        assert page.locator('#visualExportDialog').is_visible()
        assert page.locator('#exportHighlights').is_checked()==False
        page.locator('#exportScope').select_option('all')
        page.locator('#exportDetail').select_option('all')
        page.locator('#exportHighlights').check()
        page.locator('#exportLinks').check()
        page.locator('#exportFormat').select_option('svg')
        with page.expect_download(timeout=20000) as dn: page.locator('#btnExportDownload').click()
        downloaded=dn.value
        svg=Path(downloaded.path()).read_text()
        assert '<svg' in svg and 'argument' in svg.lower() and '<script' not in svg
        assert 'stroke-width="10"' in svg,'highlight absent from export'
        (out/f'tree-{width}.svg').write_text(svg)
        page.locator('#exportFormat').select_option('png')
        page.locator('#exportResolution').select_option('1')
        with page.expect_download(timeout=30000) as dn:page.locator('#btnExportDownload').click()
        raw=Path(dn.value.path()).read_bytes()
        img=Image.open(BytesIO(raw));assert img.width>400 and img.height>250,img.size
        assert img.getpixel((5,5))[:3] == (248,250,252)
        (out/f'tree-{width}.png').write_bytes(raw)
        page.locator('#exportFormat').select_option('pdf')
        page.locator('#exportPdfLayout').select_option('pages-auto')
        with page.expect_download(timeout=30000) as dn:page.locator('#btnExportDownload').click()
        pdf=Path(dn.value.path()).read_bytes()
        doc=fitz.open(stream=pdf,filetype='pdf');assert doc.page_count>=1
        assert all(abs(p.rect.width-595.276)<1 for p in doc)
        (out/f'tree-{width}.pdf').write_bytes(pdf)
        page.screenshot(path=str(out/f'ui-{width}.png'))
        after=page.evaluate('''()=>({project:localStorage.getItem('witt-project-v3'),view:localStorage.getItem('witt-view-v1')})''')
        assert before==after,'visual export mutated persisted project or view'
        assert not errors,errors
        print('PASS',width,'x',height,'PNG',img.size,'PDF pages',doc.page_count,'SVG bytes',len(svg))
        context.close()
    browser.close()
