---
lens: ux-usability
intent: user-facing flow, discoverability, error messages, accessibility, DX for tools
generated: 2026-09-26
model: claude-fable-5-1
sources: ["NN/G — 10 Usability Heuristics for User Interface Design, nngroup.com (WebSearch 2026-09-26)", "Command Line Interface Guidelines, clig.dev (WebSearch 2026-09-26)", "W3C — Web Content Accessibility Guidelines (WCAG) 2.2, w3.org/TR/WCAG22 (WebSearch 2026-09-26)", "model knowledge — claude-fable-5-1"]
---
# UX & usability — lens

## Plan-time
- Primary flow: does the plan name the ONE flow a first-time user follows, list its steps, and is the count ≤5 user actions from intent to visible result? Which step is the first one that shows system status?
- Discoverability: name the exact place a user finds this capability without reading a manual (`--help` line, command list, menu item, error hint that points at it); is that surface a change in the plan?
- Error inventory: how many distinct user-visible error states does the plan name, and for each, does it state the literal message text AND the recovery action the user takes next? Any error with no next step?
- CLI/DX (if a tool or CLI): does the plan state the exit code per failure mode (0 success, non-zero named), where messages go (stdout vs stderr), the `-h/--help` text, and the zero-config invocation?
- Defaults: is every new flag/option given a default so the no-args path works, and is there a way to undo or dry-run any destructive action (user control and freedom)?
- Accessibility (if a visual surface exists): keyboard-only path for every action (WCAG 2.1.1), text contrast ≥4.5:1 (1.4.3), and a name/role/state for every control (4.1.2) — which of the three is unstated?
- Consistency: do the new commands, flags, labels, and messages match the existing naming and wording in the same product, or does the plan introduce a second vocabulary for the same concept?
Self-report: state the number of user-visible error states the plan names (each with message + recovery) and the one flow a first-time user follows, with its step count.

## Code-time
- Errors say what happened, why, and the next command or action; never a bare exception or stack trace to the user (docs/lenses/ux-usability.md)
- Exit 0 only on success, a distinct non-zero per failure mode, errors to stderr, results to stdout (docs/lenses/ux-usability.md)
- Zero-config first: every option has a working default and `-h/--help` names each one with its default (docs/lenses/ux-usability.md)
- Show status on any step over ~1s and confirm or offer dry-run before destructive actions (docs/lenses/ux-usability.md)
- Every visual control gets a keyboard path, an accessible name and role, and ≥4.5:1 text contrast (docs/lenses/ux-usability.md)
