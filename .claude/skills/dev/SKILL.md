---
name: dev
description: Build and serve the frozen prototype locally (and, once it exists, the new app) and print the URLs. Use when asked to run, start, demo or compare the app.
---
Bring up what can run today. Run each step and stop at the first failure, quoting its output.

1. `npm run proto:build` — regenerates locales, schema and examples, builds `witt-grace-gpt-proto/dist/` and runs the Pages preflight.
2. `npm run proto:dev` in the background — the prototype's dependency-free static server; read the port from its output.
3. When `src/app` exists (WG-007), start the new app's dev server too and print its URL beside the prototype's.

Then print, verbatim:
- Prototype: the URL the server printed (in a sandbox, ask the owner to publish the port: `sbx ports <sandbox> --publish PORT:PORT/tcp`)
- One-file offline prototype: `witt-grace-gpt-proto/dist/witt-standalone.html` (open from disk)
- Checks: `npm run check` (docs, spec lock) · `npm run proto:check` (372 prototype tests)

Never edit anything under `witt-grace-gpt-proto/` (frozen; the hook refuses). Browser storage is per origin: work saved at one URL does not appear at another.
