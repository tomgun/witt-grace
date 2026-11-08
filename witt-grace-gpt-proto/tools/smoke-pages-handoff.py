"""Handoff regression: serve the real Pages dist/ under a GitHub-style project subpath.

No GitHub access, external AI calls, database, or persistent services needed.
Works with either a system Chromium or a Playwright-managed Chromium.
"""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Thread
import json
import os
import shutil

from playwright.sync_api import Error as PlaywrightError, sync_playwright, expect

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / 'dist'


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass


def chromium_path():
    override = os.environ.get('WITT_CHROMIUM_EXECUTABLE')
    if override:
        return override
    system = Path('/usr/bin/chromium')
    return str(system) if system.is_file() else None


if not (DIST / 'index.html').is_file():
    raise SystemExit('Run npm run build before the Pages browser smoke')

with TemporaryDirectory(prefix='witt-pages-') as scratch:
    project_path = Path(scratch) / 'witt-grace'
    shutil.copytree(DIST, project_path)
    handler = partial(QuietHandler, directory=scratch)
    server = ThreadingHTTPServer(('127.0.0.1', 0), handler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        url = f'http://127.0.0.1:{server.server_port}/witt-grace/'
        origin = url.split('/witt-grace/', 1)[0]
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True, executable_path=chromium_path(),
                                         args=['--no-sandbox', '--disable-dev-shm-usage'])
            try:
                for width, height in ((1440, 900), (390, 844)):
                    context = browser.new_context(viewport={'width': width, 'height': height},
                                                  accept_downloads=True)
                    page = context.new_page()
                    errors = []
                    bad_responses = []
                    unexpected_requests = []
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    page.on('response', lambda response: bad_responses.append(
                        (response.status, response.url)) if response.status >= 400 else None)
                    page.on('request', lambda request: unexpected_requests.append(request.url)
                            if not request.url.startswith(origin + '/') else None)
                    try:
                        response = page.goto(url, wait_until='load', timeout=30000)
                        assert response and response.status == 200, 'Pages entrypoint unavailable'
                        mode = 'http'
                    except PlaywrightError as e:
                        if 'ERR_BLOCKED_BY_ADMINISTRATOR' not in str(e):
                            raise
                        # The restricted authoring container denies HTTP, even loopback.
                        # We can still confirm nested asset paths and exercise the
                        # byte-identical standalone on an in-memory page. GitHub CI
                        # (normal HTTP) must exercise the real project-path hosting.
                        import re
                        source = (project_path / 'index.html').read_text()
                        for asset in re.findall(r'<(?:script|link)\b[^>]*?\b(?:src|href)="(src/[^"?#]+)"', source):
                            assert (project_path / asset).is_file(), f'Missing nested asset: {asset}'
                        mode = 'static-path + inline fallback (HTTP blocked)'
                        page.close()
                        page = context.new_page()
                        page.on('pageerror', lambda error: errors.append(str(error)))
                        page.on('response', lambda response: bad_responses.append(
                            (response.status, response.url)) if response.status >= 400 else None)
                        page.on('request', lambda request: unexpected_requests.append(request.url)
                                if not request.url.startswith(origin + '/') else None)
                        page.set_content((project_path / 'witt-standalone.html').read_text(),
                                         wait_until='load')
                        unexpected_requests.clear()
                    expect(page.locator('#btnHomeNew')).to_be_visible()
                    page.locator('#btnHomeNew').click()
                    page.locator('#btnNewWorkArgument').click()
                    if page.locator('#replaceDialog').evaluate('(node) => node.open'):
                        page.locator('#replaceForget').click()
                    expect(page.locator('body')).not_to_have_class('home-active')
                    assert page.evaluate("window.WittCore && typeof window.WittCore.createBlankProject === 'function' && window.WittCore.VERSION === 8"), \
                        'GRACE engine not loaded under project URL'
                    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 2'), \
                        'Horizontal overflow in static Pages build'
                    with page.expect_download(timeout=10000) as captured:
                        page.locator('#btnSave').evaluate('(node) => node.click()')
                    exported = json.loads(Path(captured.value.path()).read_text())
                    assert exported['schemaVersion'] == 8
                    assert exported['settings']['scoring'] == 'evidence-v3-links'
                    assert not errors, errors
                    assert not bad_responses, bad_responses
                    assert not unexpected_requests, unexpected_requests
                    print(f'Pages project path {width}x{height} ({mode}): PASS static assets, '
                          'editor, v8 JSON export, no external network', flush=True)
                    context.close()
            finally:
                browser.close()
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=3)
