# Research & Code Provenance Registry

Technical research with traceable sources. Only record sources actually consulted.

## Format
| Date | Source | Relevant Section | License | Purpose | Status |
|------|--------|------------------|---------|---------|--------|

## Entries

### 2026-10-11 — Playwright page.evaluate
- **Source:** https://playwright.dev/docs/evaluating
- **Section:** "Evaluate JavaScript in page context"
- **License:** Apache 2.0 (Playwright docs)
- **Purpose:** Confirmed that external Playwright process can execute JS in page via `page.evaluate()` — the key insight that enabled the real-game testing bridge
- **Status:** Integrated — used in all `tests/real-game/*.mjs` via `page.evaluate(() => window.__gameTest...)`
- **Test evidence:** smoke.mjs 9/9 pass, combat.mjs 9/9 pass

### 2026-10-11 — FOnline (cvet/fonline)
- **Source:** https://github.com/cvet/fonline
- **Section:** `Docs/en/explanation/maps-and-movement.md`, `Docs/en/contributing/testing/index.md`
- **License:** GPL-3.0 (not copied, concepts only)
- **Purpose:** Architectural reference for caller-owned collision policy, shared line trace, deterministic fixtures
- **Status:** Researched — concepts adapted independently in BUILD 531 (no code copied)
- **Note:** Attached exiled-kingdoms.apk remains uninspected (reference material only)
