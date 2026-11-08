# Security

WITT is a local-first browser application with no server, no accounts and no telemetry; the only data at rest is in the person's own browser storage and in files they export. If you find a vulnerability (for example a document that executes script when opened, or user text reaching an unescaped sink), email the maintainer (see the repository owner's GitHub profile) with a description and a minimal reproducing `.witt.json`. Do not open a public issue for it. Expect an acknowledgement within a week.

Known limitations by design: browser storage is per origin and shared by every site on the same `github.io` host (`docs/spec/SECURITY_AND_PRIVACY.md`); ballot anonymity is a display option; exported files contain every person's opinions in clear text.
