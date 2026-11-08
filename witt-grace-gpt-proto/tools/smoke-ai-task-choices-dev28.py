import os
"""Chromium UI contract: copy and TXT are the same complete task, schema is optional.
Runs from the bundled offline standalone, no network / clipboard permission required.
"""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
html = (root / 'dist' / 'witt-standalone.html').read_text()
shots = root / 'dist' / 'qa-dev28'
shots.mkdir(exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path=(os.environ.get('WITT_CHROMIUM_EXECUTABLE') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').is_file() else None)), args=['--no-sandbox'])
    for width in (1440, 390):
        context = browser.new_context(viewport={'width': width, 'height': 850}, accept_downloads=True)
        page = context.new_page()
        errors=[]
        outgoing=[]
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('request', lambda request: outgoing.append(request.url))
        page.set_content(html, wait_until='load')
        page.locator('.home-extra-menu summary').click()
        page.locator('#btnHomeAI').click()
        assert page.locator('#aiDialog').is_visible()
        assert page.locator('#btnAICopy').inner_text() == 'Kopioi AI-tehtävä'
        assert page.locator('#btnAIDownloadPrompt').inner_text() == 'Lataa sama tehtävä (TXT)'
        assert not page.locator('#btnAIDownloadSchema').is_visible()
        assert not page.locator('#aiDraftPromptPreviewDetails').get_attribute('open')
        page.locator('#aiTopic').fill('Pitäisikö taloyhtiön asentaa aurinkopaneelit?')
        page.locator('#aiContext').fill('Katolla on aurinkoista. Kustannukset tuntemattomat.')
        page.evaluate('''() => Object.defineProperty(navigator, 'clipboard', {configurable:true,value:{writeText:async (text)=>{window.__copiedTask=text}}})''')
        page.locator('#btnAICopy').click()
        page.wait_for_function('Boolean(window.__copiedTask)')
        copied = page.evaluate('window.__copiedTask')
        assert 'Pitäisikö taloyhtiön asentaa aurinkopaneelit?' in copied
        assert 'JSON SCHEMA' in copied
        assert 'JSON SCHEMA' in page.locator('#aiPromptPreview').input_value()
        assert 'kopioitu' in page.locator('#aiDraftTaskStatus').inner_text()
        with page.expect_download() as download:
            page.locator('#btnAIDownloadPrompt').click()
        text=Path(download.value.path()).read_text()
        assert text==copied, 'TXT must match clipboard content byte for byte'
        assert 'ladattu' in page.locator('#aiDraftTaskStatus').inner_text()
        page.locator('#aiDraftAdvanced summary').click()
        assert page.locator('#btnAIDownloadSchema').is_visible()
        with page.expect_download() as schema_download:
            page.locator('#btnAIDownloadSchema').click()
        schema=json.loads(Path(schema_download.value.path()).read_text())
        assert schema['title']=='WITT AI complete assessed draft'
        # Emulate denied/unavailable clipboard; task must be available in the request preview.
        page.evaluate('''() => Object.defineProperty(navigator, 'clipboard', {configurable:true,value:{writeText:async ()=>{throw Error('Denied')}}})''')
        page.locator('#btnAICopy').click()
        assert page.locator('#aiDraftPromptPreviewDetails').get_attribute('open') is not None
        assert page.locator('#aiPromptPreview').input_value()==copied
        assert page.locator('#aiPromptPreview').evaluate('e => e.selectionEnd-e.selectionStart')==len(copied)
        assert 'ei onnistunut' in page.locator('#aiDraftTaskStatus').inner_text()
        page.locator('#btnAIToImport').click()
        assert page.locator('#aiDraftImportStep').is_visible()
        assert not page.locator('#aiDraftPromptStep').is_visible()
        assert not page.locator('#aiDraftPaste').input_value()
        page.locator('#btnAIClose').click()
        page.locator('#btnHomeAIReview').click()
        assert page.locator('#aiReviewDialog').is_visible()
        assert page.locator('#btnAIReviewCopy').inner_text() == 'Kopioi AI-tehtävä'
        assert not page.locator('#btnAIReviewSchema').is_visible()
        # Re-enable copy path, and ensure task for existing tree also carries full schema.
        page.evaluate('''() => Object.defineProperty(navigator, 'clipboard', {configurable:true,value:{writeText:async (text)=>{window.__copiedReview=text}}})''')
        page.locator('#aiReviewMode').select_option('assess')
        page.locator('#btnAIReviewCopy').click()
        page.wait_for_function('Boolean(window.__copiedReview)')
        review = page.evaluate('window.__copiedReview')
        assert 'ASSESS ONLY' in review and 'JSON schema for your response' in review
        assert 'kopioitu' in page.locator('#aiReviewTaskStatus').inner_text()
        with page.expect_download() as task_download:
            page.locator('#btnAIReviewExport').click()
        assert Path(task_download.value.path()).read_text()==review
        page.locator('#aiReviewAdvanced summary').click()
        with page.expect_download() as schema_download:
            page.locator('#btnAIReviewSchema').click()
        contrib_schema = json.loads(Path(schema_download.value.path()).read_text())
        assert 'properties' in contrib_schema
        page.evaluate('''() => Object.defineProperty(navigator, 'clipboard', {configurable:true,value:{writeText:async ()=>{throw Error('Denied')}}})''')
        page.locator('#btnAIReviewCopy').click()
        assert page.locator('#aiReviewPromptPreviewDetails').get_attribute('open') is not None
        assert page.locator('#aiReviewPromptPreview').input_value()==review
        assert page.locator('#aiReviewPromptPreview').evaluate('e => e.selectionEnd-e.selectionStart') == len(review)
        assert page.locator('#aiReviewPaste').input_value()==''
        page.screenshot(path=str(shots / f'ai-task-{width}.png'))
        assert not errors,errors
        assert not outgoing,outgoing
        context.close()
        print('PASS',width,'copy, TXT parity, embedded schema, fallback, AI new tree & contributions, no requests')
    browser.close()
