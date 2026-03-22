# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Git Commits
Never add "Co-Authored-By: Claude" or any Co-Authored-By line referencing Claude/Sonnet (or any Anthropic model) to commit messages.

## Commands

```bash
npm run build        # Compile TypeScript + bundle ESM, IIFE, CJS
npm run build:watch  # Watch mode
npm run typecheck    # Type-check without emitting
npm test             # Run Playwright integration tests (Chromium)
```

To run a single test by name:
```bash
npx playwright test -g "test name here"
```

The test suite starts a static file server on `http://localhost:4321` automatically (configured in `playwright.config.ts`).

## Architecture

Forms flow through a pipeline: **discover → analyze → enhance → register → intercept**.

| Module | Role |
|--------|------|
| `index.ts` | Public `autoWebMCP(config?)` API + IIFE auto-init |
| `discovery.ts` | Scans DOM for forms via `MutationObserver` + SPA route-change listeners; calls register/unregister |
| `analyzer.ts` | Infers tool name, description, and JSON Schema from a form element |
| `schema.ts` | Maps HTML input types → JSON Schema fragments; handles radio enum/oneOf deduplication |
| `enhancer.ts` | Optional Claude/Gemini API call to enrich metadata descriptions |
| `registry.ts` | Wraps `navigator.modelContext.registerTool()` / unregister |
| `interceptor.ts` | `buildExecuteHandler()` — fills form fields from agent params, auto-submits or waits for user, returns `ExecuteResult` |
| `config.ts` | Merges user config into `ResolvedConfig` with defaults |

## Key Behaviours

**Metadata inference priority (name/description):** native spec attr (`toolname`, `tooldescription`) → `data-webmcp-*` → DOM heuristics (submit button, heading, legend, aria-label, id, action URL).

**Per-field inference priority:** `toolparamdescription` → `data-webmcp-description` → aria-description → placeholder → label.

**Inputs never exposed to agents:** `password`, `hidden`, `file`, `submit`, `button`, `image`, and unnamed controls.

**Select / radio groups** produce both `enum` (raw values) and `oneOf` (array of `{const, title}`) in the schema for richer agent metadata.

**Custom events** dispatched on `window`:
- `toolactivated` — agent filled and submitted a form
- `toolcancel` — form was reset

**Progressive enhancement:** silently no-ops when `navigator.modelContext` is absent.

**SPA support:** `discovery.ts` patches `history.pushState`/`replaceState` and listens to `hashchange`/`popstate` to re-scan on route changes.

## Build

`build.mjs` uses esbuild to produce three bundles from `src/index.ts`:
- `dist/auto-webmcp.esm.js` — unminified, for npm ESM consumers
- `dist/auto-webmcp.iife.js` — minified, for `<script>` tag (`globalName: AutoWebMCP`)
- `dist/auto-webmcp.cjs.js` — unminified, for npm CJS consumers

TypeScript declarations (`.d.ts`) are generated first via `tsc --emitDeclarationOnly`.

## Tests

Tests live in `tests/analyzer.spec.ts` and use Playwright running real Chromium. The pattern:
1. Navigate to a fixture HTML page in `tests/fixtures/`
2. `page.addInitScript()` injects a mock `navigator.modelContext` that captures registered tools into `window.__registeredTools`
3. Assertions inspect `window.__registeredTools` for expected tool names, descriptions, and schemas

No unit tests — all testing is integration-level via real browser DOM.
