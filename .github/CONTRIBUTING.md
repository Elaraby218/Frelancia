# Contributing to Frelancia

## Before You Start
- Search [open issues](https://github.com/Elaraby218/Frelancia/issues) before opening a new one.
- Discuss major changes in an issue before submitting a PR.

## Workflow
1. Fork the repo and create a branch: `feature/your-feature` or `fix/your-fix`.
2. Make your changes, then open a Pull Request against `main`.

## Code Rules
- **Vanilla JS only** — no frameworks, no build tools.
- **Minimal** — solve the problem with the least code necessary; no helper abstractions for one-time use.
- **MV3 safe** — no `eval`, no remote scripts, no `setTimeout` in service workers.
- **Module scope** — content script files share one global scope; avoid name collisions by prefixing internal helpers with `_`.
- **No auto-commit** — do not amend published commits or force-push to `main`.

## File Structure
| Folder | Purpose |
|---|---|
| `bg/` | Background service worker modules |
| `content/` | Content script modules (Mostaql page injection) |
| `dashboard/` | Dashboard page modules |
| `dashboard-bids/` | Bid tracker tab modules |

## PR Checklist
- [ ] No new dependencies added
- [ ] Tested on Chrome with the extension loaded unpacked
- [ ] No hardcoded user data or credentials
