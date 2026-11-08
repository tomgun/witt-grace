# GitHub setup and Pages deployment — owner checklist

**Nothing in this handoff has been committed, uploaded, published or configured in GitHub.** The commands below are for the owner to run after reviewing the files.

## 1. Create a repository

Recommended repository name: `witt-grace` (or another name you choose). Choose **private source** while you decide copyright/licensing and whether demo fixtures contain content you want public; remember that the **Pages website is still public** if your GitHub plan supports Pages from a private repository. GitHub Free can use Pages from public repositories. Read `LICENSE-NOTICE.md` before making code public. Do not create default README/license/.gitignore on GitHub if you want the first push to be clean; these files are included here.

Unzip the prepared release. It contains **one `witt-grace/` folder** that is the intended repository root. Run on your Mac:

```sh
cd /path/to/unzipped/witt-grace
node --version                  # use Node 22 ideally; >=20 required
npm run check
npm run build
node tools/verify-pages-build.cjs

git init -b main
git add .
git commit -m "chore: import verified WITT dev32 prototype"
git remote add origin https://github.com/OWNER/REPOSITORY.git
git push -u origin main
```

Replace `OWNER/REPOSITORY` with the GitHub repository you created. Existing `.gitignore` excludes `dist/` and local caches. If a remote repo already contains commits, **reconcile first**; do not force-push over it.

## 2. Enable GitHub Pages from Actions

Go to **Repository → Settings → Pages → Build and deployment → Source: GitHub Actions**. The included `.github/workflows/pages.yml` is triggered by pushes to `main` and manual `workflow_dispatch`; it runs checks, creates `dist/`, uploads only that folder and then deploys it. `dist/index.html` references `src/*` relatively, so a project URL of the form `https://OWNER.github.io/REPOSITORY/` is supported without a hard-coded base path. `dist/witt-standalone.html` remains an optional one-file offline download.

If the workflow ran before the Pages setting was enabled, run the Pages workflow manually once (Actions → Publish WITT to GitHub Pages → Run workflow) after enabling.

**No hosted AI credentials, runtime API keys or backend are required.** The site is static. Browser-side localStorage still works but does not automatically sync between devices. Existing local `file://` data **will not migrate** to the new origin: export local work as `.witt.json` and import in the Pages app when needed.

Official references:
- https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
- https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages

## 3. Protect main / establish PR gates

Under Repository → Settings → Rules (or Branch protection on an older GitHub UI), protect `main` with required pull-request review and passing verification job. The included `.github/workflows/ci.yml` creates **`verify`** and **`browser-smoke`** jobs. After both have run once, require **both** checks before merging. Recommended: block force pushes, require linear history or squash merge, dismiss stale reviews for new commits, keep deploy permissions scoped to `main` with GitHub Pages environment protection. Exact settings depend on repository/organization plan.

Workflow behavior:
- Pull requests: Node checks + real Chromium desktop/mobile smoke + static build/preflight; **no Pages deployment**.
- Push to `main`: same CI runs; Pages workflow independently checks/builds/deploys.
- CI already runs pinned Python Playwright 1.57.0 + Chromium browser regressions on pull requests (Pages project-path loading, dock/panels, multi-author import/export, repeated reasons and AI task flow). After merging, also verify the real Pages URL manually.

## 4. First live smoke after deployment

Open the actual Pages URL in a fresh browser profile. Confirm:

1. Home screen and Bitberg/light theme load with no missing CSS/scripts; devtools console shows no JS errors.
2. Start argument mode; add a +/− reason; edit its 0..100 credibility and -5..+5 influence; observe computed signed root balance.
3. Switch to decision mode on a separate test project; inspect concrete options and weighted human comparisons.
4. Create a recurring reason, attach it under two targets; each target has independent reviews and is visible in tree.
5. Change local user name, add another user, export WITT JSON and import it back. Validate current draft is described before replacement.
6. Try AI Task Copy and Download TXT; both carry the same complete JSON schema instructions; no AI API call occurs.
7. Open/move/close view settings and toggle side/top/bottom panes; repeat at narrow mobile viewport.
8. Export PNG/SVG/PDF (test large trees within reasonable browser memory).
9. Note that browser save is **local to that domain and browser**, not automatically cloud backed up.

## 5. GitHub Pages security caveat

`localStorage` is scoped to **scheme+host+port**, not URL path. Project sites under one `OWNER.github.io` host generally share origin storage. Another app served from that host may be able to inspect the same localStorage. For sensitive projects, isolate WITT behind a **dedicated custom domain** and audit access/storage/security before use. Changing domain also creates a new storage origin. Do not commit or deploy confidential test trees. See `SECURITY_AND_PRIVACY_BASELINE.md`.

## 6. Claude Code first task

After the owner's first successful push and Pages enablement, run Claude Code with `CLAUDE.md` and the first-PR prompt in `docs/CLAUDE_FIRST_PR_PROMPT.md`. Ask Claude to first **read, test, and write a proposed plan**, then create a feature branch/PR; no app framework rewrite in the first PR.
