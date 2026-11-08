"""Verify that the selected user review, not the +/- creation template,
controls the visible primary relationship direction, while storage retains
other assessors' reviews and the authored template. Run after npm run build.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
import json, traceback
root=Path(__file__).resolve().parent.parent
html=(root/'dist/witt-standalone.html').read_text()
output=root/'dist/qa-dev27';output.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    for width,height in ((1440,900),(390,844)):
        page=browser.new_page(viewport={'width':width,'height':height},accept_downloads=True)
        errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        step='setup'
        try:
            page.goto('about:blank');page.set_content(html,wait_until='load')
            page.locator('#btnHomeNew').click(timeout=7000)
            page.locator('#btnNewWorkArgument').click(timeout=7000)
            if page.locator('#replaceDialog').evaluate('(el)=>el.open'):
                page.locator('#replaceForget').click(timeout=6000)
            page.locator('#btnTreeView').click(force=True,timeout=6000)
            step='create plus claim'
            page.locator('#nodesLayer .node-add.support').first.click(force=True,timeout=7000)
            if page.locator('.node-inline-editor').count():page.locator('.node-inline-editor').press('Escape')
            expect(page.locator('#nodesLayer .node')).to_have_count(2,timeout=6000)
            expect(page.locator('#nodeRelation')).to_have_value('support')
            page.locator('#inspector .assessment-discovery button').click(timeout=7000)
            step='negative influence and resulting label'
            slider=page.locator('#nodeImpact')
            assert slider.count()==1
            slider.evaluate("el=>{el.value='-3.5';el.dispatchEvent(new Event('change',{bubbles:true}))}")
            expect(page.locator('#nodeRelation')).to_have_value('support')
            assert 'VASTUSTAA' in page.locator('#nodesLayer .node.selected .node-tag').inner_text()
            assert '−3.5' in page.locator('.relation-effective').inner_text() or '-3.5' in page.locator('.relation-effective').inner_text()
            assert page.locator('#nodesLayer .node.selected').get_attribute('data-relation')=='oppose'
            page.screenshot(path=str(output/f'opposing-{width}.png'))
            step='table label'
            page.locator('#btnTableView').click(force=True,timeout=7000)
            assert 'Vastustava' in page.locator('#argumentTableBody').inner_text() or 'Vastustava' in page.locator('#mobileArguments').inner_text()
            page.locator('#btnTreeView').click(force=True,timeout=7000)
            step='saved document still has authored support and personal review -3.5'
            page.evaluate('''() => {window.__capturedWittBlob=null;URL.createObjectURL=blob=>{window.__capturedWittBlob=blob;return 'blob:captured';};URL.revokeObjectURL=()=>{};HTMLAnchorElement.prototype.click=function(){};}''')
            page.locator('#fileMenu summary').click(timeout=7000)
            page.locator('#btnSave').click(timeout=7000)
            saved=json.loads(page.evaluate('() => window.__capturedWittBlob.text()'))
            child=next(n for n in saved['nodes'] if n['parentId'] is not None)
            assert child['relation']=='support',child
            rows=[r for r in saved['edgeAssessments'] if r['subjectType']=='primary' and r['subjectId']==child['id']]
            assert len(rows)==1 and rows[0]['influence']==-3.5,rows
            step='0 becomes neutral, +4 becomes supporting'
            page.locator('#nodeImpact').evaluate("el=>{el.value='0';el.dispatchEvent(new Event('change',{bubbles:true}))}")
            assert page.locator('#nodesLayer .node.selected').get_attribute('data-relation')=='neutral'
            assert 'NEUTRAALI' in page.locator('#nodesLayer .node.selected .node-tag').inner_text()
            page.locator('#nodeImpact').evaluate("el=>{el.value='4';el.dispatchEvent(new Event('change',{bubbles:true}))}")
            assert page.locator('#nodesLayer .node.selected').get_attribute('data-relation')=='support'
            assert 'PUOLTAA' in page.locator('#nodesLayer .node.selected .node-tag').inner_text()
            assert not errors,errors
            page.screenshot(path=str(output/f'direction-{width}.png'))
            print(width,'PASS signed influence + baseline unchanged; tree, inspector, table and JSON',flush=True)
        except Exception as err:
            print('FAIL',width,step,repr(err),errors,flush=True)
            page.screenshot(path=str(output/f'direction-error-{width}.png'))
            traceback.print_exc();raise
        finally:
            page.close()
    browser.close()
