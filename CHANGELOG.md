# Changelog

All notable changes to this project will be documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project uses [Semantic Versioning](https://semver.org/).

---

## [0.3.10] — 2026-03-30

### New Features

- **contenteditable / ARIA textbox support.** The orphan scanner now detects `[role="textbox"]`, `[role="searchbox"]`, and `[contenteditable="true"]` elements outside `<form>` tags (e.g. Twitter/X compose box). Schema keys are inferred from `aria-label` or `placeholder`.

- **React contenteditable fill fixed.** Filling a contenteditable div now uses `document.execCommand('insertText')` with a pre-selected range, which fires the native `InputEvent` that React's synthetic event system listens to. The old `textContent =` assignment silently failed for React-controlled editors.

- **Container-scoped submit button fallback.** When no typed submit button is found in an orphan group container, the scanner now tries text-matched buttons within the container before falling back to a page-wide search. This ensures the compose dialog's "Post" button is used instead of an unrelated sidebar button with the same label.

---

## [0.3.9] — 2026-03-30

### Bug Fixes

- **Duplicate tool name overwrite fixed.** When two orphan input groups resolved to the same name, the second registration silently replaced the first, leaving an execute handler with no mapped fields. Groups with zero inputs matched to schema keys are now skipped.

- **Submit button reference exposed for all registered tools.** `registerForm` now stores the submit button in `window.__pendingSubmitBtns[toolName]`, matching what the orphan path already did. Background.js can now click form-based tools via direct DOM reference rather than CSS selector fallback.

- **Primer/React design system button support.** `button[data-variant="primary"]` added to the orphan grouping and submit selectors, covering GitHub, Primer-based apps, and other React design systems that use `type="button"` with a variant class instead of `type="submit"`.

- **Disabled submit button fallback in orphan grouping.** When no enabled submit button is found in a container, the grouping algorithm now considers disabled `[type="submit"]` and `[data-variant="primary"]` buttons as container anchors. The execute handler polls up to 2s for the button to become enabled before clicking.

---

## [0.3.8] — 2026-03-27

### Bug Fixes

- **Fixed orphan grouping regression (GitHub issues, Twitter).** Removed `button:not([type])` from the grouping selector — it was matching tab/nav buttons (e.g. GitHub's "Preview" markdown tab) and splitting inputs that belong together into separate single-field groups. Only `[type="submit"]` (even disabled) and text-matched buttons now anchor orphan groups.

- **Skip auto-generated framework IDs for schema keys.** React and similar frameworks assign IDs like `_r_1_` and `:r0:` that carry no semantic meaning. These are now skipped so `aria-label` or placeholder text produces a meaningful schema key (e.g. `title` instead of `r_1`).

---

## [0.3.7] — 2026-03-27

### Bug Fix

- **Orphan field key mismatch fixed (GitHub issues, GitLab, Bitbucket, Rails apps).** Fields with namespaced `name` attributes like `issue[title]` were never filled because the schema stored the raw key `issue[title]` while the execute handler sanitized it to `issue_title`. Both now use sanitized keys, so parameters from agents correctly map to the right DOM elements.

### New Features

- **Orphan tools now auto-submit after filling.** When `autoSubmit` is enabled, the orphan execute handler polls for the submit button to become enabled (up to 2 seconds, handles React/Vue re-renders) and clicks it, matching the behavior of regular form tools. When the button remains disabled, a descriptive message is returned so agents can ask for missing required input.

- **JSON Schema 2020-12 dialect declared.** All generated `inputSchema` objects now include `"$schema": "https://json-schema.org/draft/2020-12/schema"`, making the library spec-compliant with validators and future Chrome enforcement.

- **Orphan groups inherit tool annotations.** `analyzeOrphanInputGroup()` now calls `inferOrphanAnnotations()` to set `readOnlyHint`/`idempotentHint` from search-like submit button text and `destructiveHint` from delete/remove/cancel text, matching the annotation inference already done for regular forms.

---

## [0.2.0] — 2026-03-21

### Breaking Changes

- **`ExecuteResult` format changed** to match the WebMCP spec.
  Before: `{ success: true, data: {...}, url: "..." }`
  After: `{ content: [{ type: "text", text: "..." }] }`
  If you were reading the return value of the `execute` callback, update your handler accordingly.

- **Forms with `toolname` are no longer skipped.** Previously, a form with a native `toolname` attribute was excluded on the assumption the browser would handle it. Now, auto-webmcp enhances those forms (adds inferred description if missing) and registers them via the imperative API. If you relied on the skip behavior, add `data-no-webmcp` to opt out instead.

### New Features

- **Native attribute support** — reads Chrome 146 WebMCP spec attributes as primary values:
  - `toolname` on `<form>` → tool name
  - `tooldescription` on `<form>` → tool description
  - `toolparamdescription` on `<input>`/`<select>`/`<textarea>` → field description
  - `toolautosubmit` on `<form>` → auto-submit on agent invocation
  - `data-webmcp-*` attributes remain as fallbacks

- **`oneOf` in select and radio schemas** — select options and radio buttons now emit `oneOf: [{ const, title }]` alongside `enum`, so agents can see human-readable labels (e.g. `"Economy"`) alongside values (e.g. `"economy"`).

- **`toolactivated` event** — `window` receives a `CustomEvent('toolactivated', { detail: { toolName } })` after an agent fills a form.

- **`toolcancel` event** — `window` receives a `CustomEvent('toolcancel', { detail: { toolName } })` when a form is reset.

- **Debug-mode quality warnings** — when `debug: true`, logs warnings to console if a tool has a generic name, no meaningful description, or a description with negative instructions.

### Tests

- 9 new tests (32 total, all passing)
- New fixture: `tests/fixtures/native-attrs.html`

---

## [0.1.2] — 2026-02-23

- Add OG image and social meta tags for autowebmcp.dev
- Fix og:title

## [0.1.1] — 2026-02-23

- GitHub Pages / CNAME setup for autowebmcp.dev

## [0.1.0] — 2026-02-23

Initial release.

- Auto-registers all HTML forms as WebMCP tools via `navigator.modelContext.registerTool()`
- Infers tool name, description, and JSON Schema from DOM
- MutationObserver support for SPAs and dynamic forms
- Optional LLM enrichment (Claude / Gemini) for richer descriptions
- `data-webmcp-*` attributes for per-form overrides
- `data-no-webmcp` to exclude forms
- Graceful degradation when WebMCP is unavailable
