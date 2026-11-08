---
name: dev
description: Start the new app's dev server (Vite) and, on request, the frozen prototype, and print the URLs. Use when asked to run, start, demo or compare the app.
---
Run each step and stop at the first failure, quoting its output.

1. `npm run dev` in the background — Vite on http://127.0.0.1:5173 (the app at `/`). In a sandbox, ask the owner to publish the port: `sbx ports <sandbox> --publish 5173:5173/tcp`.
2. To compare with the prototype: `npm run proto:build` then `npm run proto:dev` in the background; read its port from the output. The one-file offline prototype is `witt-grace-gpt-proto/dist/witt-standalone.html`.
3. For a machine-driven look at the UI use the browser suite, not screenshots by hand: `npm run build && npm run e2e` (Chromium, desktop and mobile). A failed walk leaves a screenshot and a trace under `test-results/`; read the screenshot with the Read tool.

Print, verbatim:
- App: http://127.0.0.1:5173
- Checks: `npm run check` (docs, spec lock, lint, typecheck, format, unit and golden tests) · `npm run e2e` (browser walks) · `npm run proto:check` (372 prototype tests)

Never edit anything under `witt-grace-gpt-proto/` (frozen; the hook refuses). Browser storage is per origin: work saved at one URL does not appear at another.
