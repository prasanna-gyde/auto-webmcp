# auto-webmcp

**Automatically make any HTML form WebMCP-ready — zero explicit coding required.**

Drop in one script tag (or one `import`) and every `<form>` on your page is
instantly registered as a structured tool that in-browser AI agents can
discover and use via Google Chrome's
[WebMCP](https://github.com/nicktindall/mcp-browser) proposal.

---

## Quick start

### Script tag (CDN / zero-config)

```html
<script src="https://cdn.jsdelivr.net/npm/auto-webmcp/dist/auto-webmcp.iife.js"></script>
```

All forms on the page are discovered and registered automatically.

### npm / ESM

```bash
npm install auto-webmcp
```

```js
import { autoWebMCP } from 'auto-webmcp';
await autoWebMCP();
```

---

## What it does

1. Scans the page for all `<form>` elements (on load + dynamically via `MutationObserver`)
2. Infers a meaningful **tool name**, **description**, and **JSON Schema** from the form's DOM
3. Registers each form as a WebMCP tool via `navigator.modelContext.registerTool()`
4. Intercepts submissions to return structured results back to the agent
5. Degrades silently in browsers without WebMCP

---

## Configuration

```js
import { autoWebMCP } from 'auto-webmcp';

await autoWebMCP({
  // Skip specific forms
  exclude: ['#login-form', '[data-no-webmcp]'],

  // Auto-submit when agent invokes (default: false — human must click submit)
  autoSubmit: false,

  // Optional AI enrichment for richer descriptions
  enhance: { provider: 'claude', apiKey: 'sk-...' },

  // Per-form name / description overrides
  overrides: {
    '#checkout-form': {
      name: 'checkout',
      description: 'Complete a purchase'
    }
  },

  // Log registered tools to console
  debug: true,
});
```

### Per-form HTML overrides

Override individual forms without JavaScript:

```html
<form
  data-webmcp-name="book_appointment"
  data-webmcp-description="Book a doctor appointment"
  data-webmcp-autosubmit
>
  <input
    name="date"
    type="date"
    data-webmcp-title="Appointment Date"
    data-webmcp-description="Preferred appointment date"
  >
  …
</form>
```

### Skip a form entirely

```html
<form data-no-webmcp>…</form>
```

---

## Tool name inference (priority order)

1. `data-webmcp-name` attribute on `<form>`
2. Submit button text (e.g. "Search Flights" → `search_flights`)
3. Nearest `<h1>`–`<h3>` heading above the form
4. Form `id` or `name` attribute
5. Last segment of form `action` URL
6. Fallback: `form_N`

## Tool description inference (priority order)

1. `data-webmcp-description` attribute on `<form>`
2. `<legend>` text inside the form
3. `aria-label` on the form
4. `aria-describedby` target
5. Nearest heading + page `<title>`

## HTML → JSON Schema mapping

| HTML type              | JSON Schema             |
|------------------------|-------------------------|
| `text`, `search`, `tel`| `string`                |
| `email`                | `string` + format:email |
| `url`                  | `string` + format:uri   |
| `number`, `range`      | `number` (+ min/max)    |
| `date`                 | `string` + format:date  |
| `datetime-local`       | `string` + format:date-time |
| `checkbox`             | `boolean`               |
| `radio`                | `string` + enum         |
| `select`               | `string` + enum         |
| `textarea`             | `string`                |
| `file`, `hidden`, `password` | _skipped_         |

---

## API

```ts
const handle = await autoWebMCP(config?);

handle.isSupported   // boolean — true if navigator.modelContext exists
handle.getTools()    // Array<{ form: HTMLFormElement; name: string }>
handle.destroy()     // Promise<void> — unregister all tools & stop observing
```

### Events

```js
window.addEventListener('form:registered', (e) => {
  console.log('Registered:', e.detail.toolName, e.detail.form);
});
window.addEventListener('form:unregistered', (e) => {
  console.log('Removed:', e.detail.toolName);
});
```

### Prevent auto-init (IIFE build)

Set this before the script loads:

```html
<script>window.__AUTO_WEBMCP_NO_AUTOINIT = true;</script>
<script src="auto-webmcp.iife.js"></script>
<script>
  AutoWebMCP.autoWebMCP({ debug: true });
</script>
```

---

## Development

```bash
npm install
npm run build          # compile to dist/
npm run build:watch    # rebuild on change
npm run typecheck      # TypeScript type check only
npm test               # Playwright integration tests
```

---

## Browser support

- Chrome 146+ with `#enable-webmcp-testing` flag (or WebMCP GA) for full functionality
- All other browsers: forms are analyzed and the library loads without error —
  `navigator.modelContext` calls are silently no-opped (progressive enhancement)

---

## License

MIT
