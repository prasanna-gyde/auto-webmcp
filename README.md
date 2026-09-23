# auto-webmcp

**Automatically make any HTML form WebMCP-ready — zero explicit coding required.**

[Read the article on dev.to](https://dev.to/prasannagyde/every-web-form-should-be-callable-by-ai-agents-and-yours-can-be-today-228) &nbsp;·&nbsp; [Live demo](https://autowebmcp.dev/demo) &nbsp;·&nbsp; [Platform guides](https://autowebmcp.dev/platforms)

Drop in one script tag (or one `import`) and every `<form>` on your page is
instantly registered as a structured tool that in-browser AI agents can
discover and use via Chrome's
[WebMCP](https://developer.chrome.com/blog/webmcp-epp) early preview.

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
2. Also discovers inputs **outside** `<form>` tags (orphan input groups) and inputs inside **Web Component shadow roots**
3. Infers a meaningful **tool name**, **description**, and **JSON Schema** from the form's DOM
4. Registers each form as a WebMCP tool via `document.modelContext.registerTool()` (falls back to `navigator.modelContext` on older Chrome builds)
5. Intercepts submissions to return structured results back to the agent
6. Degrades silently in browsers without WebMCP

---

## Configuration

```js
import { autoWebMCP } from 'auto-webmcp';

await autoWebMCP({
  // Skip specific forms (CSS selectors)
  exclude: ['#login-form', '[data-no-webmcp]'],

  // Auto-submit when agent invokes (default: false — human must click submit)
  autoSubmit: false,

  // Handling for forms already using native declarative WebMCP attributes:
  // 'skip' (default), 'augment' (currently same as skip), or 'force'
  declarativeMode: 'skip',

  // Parameter binding behavior for execute payload keys
  paramBinding: {
    enableAliasResolution: true, // default
    strict: false,               // if true, exact schema keys only
  },

  // Deterministic execute timeout state
  execution: {
    timeoutMs: 15000, // default
  },

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

**Native WebMCP spec attributes** (highest priority):

```html
<form
  toolname="book_appointment"
  tooldescription="Book a doctor appointment"
  toolautosubmit
>
  <input
    name="date"
    type="date"
    toolparamdescription="Preferred appointment date"
  >
</form>
```

**data-webmcp-* attributes** (fallback, useful when you cannot edit the form element directly):

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
</form>
```

### Skip a form entirely

```html
<form data-no-webmcp>…</form>
```

---

## Tool name inference (priority order)

1. `toolname` native attribute on `<form>` (WebMCP spec)
2. `data-webmcp-name` attribute on `<form>`
3. Submit button text (e.g. "Search Flights" → `search_flights`)
4. Nearest `<h1>`–`<h3>` heading above the form
5. Form `id` or `name` attribute
6. Last segment of form `action` URL
7. Fallback: `form_N`

## Tool description inference (priority order)

1. `tooldescription` native attribute on `<form>` (WebMCP spec)
2. `data-webmcp-description` attribute on `<form>`
3. `<legend>` text inside the form
4. `aria-label` on the form
5. `aria-describedby` target
6. Nearest heading + page `<title>`

## Field title inference (priority order)

1. `data-webmcp-title` attribute on the field
2. Associated `<label>` text
3. `name` attribute (humanized)
4. `id` attribute (humanized)
5. `placeholder` text

## Field description inference (priority order)

1. `toolparamdescription` native attribute on the field (WebMCP spec)
2. `data-webmcp-description` attribute on the field
3. `aria-description` / `aria-describedby` target
4. `placeholder` text

---

## HTML → JSON Schema mapping

| HTML input                   | JSON Schema                        |
|------------------------------|------------------------------------|
| `text`, `search`, `tel`      | `string`                           |
| `email`                      | `string` + `format: email`         |
| `url`                        | `string` + `format: uri`           |
| `number`, `range`            | `number` (+ `min` / `max`)         |
| `date`                       | `string` + `format: date`          |
| `datetime-local`             | `string` + `format: date-time`     |
| `checkbox`                   | `boolean`                          |
| checkbox group (same `name`) | `array` + `items.enum`             |
| `radio` group                | `string` + `enum` + `anyOf`        |
| `select`                     | `string` + `enum` + `anyOf`        |
| `select[multiple]`           | `array` + `items.enum`             |
| `textarea`                   | `string`                           |
| ARIA role inputs             | mapped by role (textbox, checkbox…) |
| `file`, `hidden`, `password` | _skipped_                          |

Additional schema enrichment:
- Pre-filled field values are exposed as `schema.default`
- `<optgroup>` labels and `<datalist>` suggestions are included as metadata
- Disabled select options and placeholder options (`"Select..."`, `"---"`) are excluded

---

## ToolAnnotations

auto-webmcp automatically infers [WebMCP ToolAnnotations](https://webmachinelearning.github.io/webmcp/) from your HTML:

| Annotation | Auto-inferred when |
|---|---|
| `readOnlyHint` | Form method is `GET`, or submit button says "Search", "Find", etc. (never when card fields are present) |
| `consequentialHint` | Submit button says "Pay", "Buy", "Place order", "Book", "Transfer", etc., the form has card fields (`autocomplete="cc-*"`), or the form is destructive |

`readOnlyHint` and `consequentialHint` are the WebMCP spec annotations. Browsers and agents can use `consequentialHint` to ask the user for confirmation before a high-stakes action.

auto-webmcp also emits the MCP hints `destructiveHint`, `idempotentHint` and `openWorldHint` for MCP bridges. WebMCP browsers ignore them.

Override any annotation with data attributes:

```html
<form
  data-webmcp-consequential="true"
  data-webmcp-destructive="true"
>
  <!-- delete account form -->
</form>
```

---

## Sensitive fields and country packs

Some fields should never be filled by an agent. auto-webmcp keeps them out of the tool schema, lists them in the description ("The user must enter: Card number"), marks the tool `consequentialHint`, and returns them in `requires_user` so the agent hands off to the user.

**Always blocked (no configuration):** passwords, one-time codes, secret PINs (UPI PIN, MPIN, card PIN), security answers, card number, CVV and expiry, Aadhaar, US SSN, Singapore NRIC/FIN, Dutch BSN, Irish PPSN and Belgian national register numbers.

Tool results only include fields the agent can see. Hidden inputs such as CSRF tokens and password values never leave the page.

**Country packs** add redaction and format hints:

```js
import { autoWebMCP } from 'auto-webmcp';
import { india } from 'auto-webmcp/packs/in';
import { unitedStates } from 'auto-webmcp/packs/us';

autoWebMCP({ packs: [india, unitedStates] });
```

```html
<!-- Script tag: load packs before the core bundle -->
<script src="https://unpkg.com/auto-webmcp@0.6.0/dist/packs/in.iife.js"></script>
<script src="https://unpkg.com/auto-webmcp@0.6.0/dist/auto-webmcp.iife.js"></script>
```

| Pack | Redacted (masked in results) | Formatted (pattern + hint, checksum warnings) |
|---|---|---|
| `in` India | PAN, UPI ID, bank account, passport, voter ID, driving licence, ABHA, UAN | GSTIN, IFSC, TAN, CIN, PIN code, mobile |
| `us` United States | ITIN, bank account, date of birth, driver's license, passport, Medicare MBI | ABA routing, EIN, NPI, ZIP, phone |

Override any field:

```html
<input name="loyalty_no" data-webmcp-sensitive="redact">
<input name="employee_bsn" data-webmcp-sensitive="allow">  <!-- site has a legal basis -->
<input name="nickname" data-webmcp-sensitive="block">
```

This limits what auto-webmcp puts into the agent's context and logs. It cannot stop an agent that reads the page directly, so also send `Permissions-Policy: tools=()` on KYC and payment pages. Design notes and sources: [docs/design/country-packs.md](docs/design/country-packs.md).

---

## Razorpay Checkout adapter

Razorpay Checkout is a button that opens a payment modal, not a form, so form discovery cannot see it. The adapter registers checkout tools directly. The agent can start checkout; the user still pays inside Razorpay's modal (UPI PIN, card OTP), and the agent never sees payment details.

```js
import { razorpay } from 'auto-webmcp/adapters/razorpay';

razorpay({
  merchant: 'Acme',
  plans: async () => [{ id: 'inr-monthly', name: 'Pro', amount: 49900, currency: 'INR', period: 'monthly' }],
  createSubscription: async (planId) => {
    const r = await fetch('/billing/subscribe', { method: 'POST', body: JSON.stringify({ planId }) });
    const { keyId, subscriptionId } = await r.json();
    return { keyId, subscriptionId };
  },
  subscriptionStatus: async () => (await fetch('/billing/status')).json(),
  cancelSubscription: async () => { await fetch('/billing/cancel', { method: 'POST' }); },
});
```

| Tool | Annotation | Registered when you pass |
|---|---|---|
| `get_plans` | `readOnlyHint` | `plans` |
| `start_subscription` | `consequentialHint` | `createSubscription` |
| `get_subscription_status` | `readOnlyHint` | `subscriptionStatus` |
| `cancel_subscription` | `consequentialHint`, asks the user to confirm | `cancelSubscription` |
| `get_order_summary`, `start_payment`, `get_payment_status` | read-only / consequential / read-only | `orderSummary`, `createOrder`, `paymentStatus` (Razorpay Orders) |

`start_*` results report `submitted`, `dismissed`, `failed` (only after the user closes Checkout without a successful retry), `awaiting_user_action` or `cancelled`. Treat `submitted` as pending: confirm the payment from your server's webhook-updated state, never from the browser callback.

Script tag: `<script src="https://unpkg.com/auto-webmcp@0.6.0/dist/adapters/razorpay.iife.js"></script>` exposes `AutoWebMCPRazorpay.razorpay(...)`.

---

## Advanced discovery

### Shadow DOM (Web Components)

Inputs inside custom element shadow roots are automatically discovered and included in the schema. No extra configuration needed.

```html
<form>
  <custom-date-picker></custom-date-picker> <!-- shadow root inputs discovered -->
  <button type="submit">Book</button>
</form>
```

### Orphan inputs (no `<form>` tag)

Input groups not wrapped in a `<form>` element (common in SPAs) are detected by finding the nearest ancestor that contains a visible submit button. Each group is registered as a separate tool.

### React and framework-managed forms

auto-webmcp fills React-controlled inputs using native `HTMLInputElement` prototype setters and `execCommand` to trigger `onChange`. A post-fill snapshot preserves field values if the framework re-renders before submit.

---

## Structured execute result

Every tool execution returns a two-item `content` array:

- `content[0].text` — human-readable summary: `"Form submitted. Fields: {...}"`
- `content[1].text` — JSON-stringified structured data:

```json
{
  "status": "success",
  "filled_fields": { "email": "a@b.com", "frequency": "weekly" },
  "skipped_fields": [],
  "missing_required": [],
  "warnings": [],
  "requires_user": ["Card number"]
}
```

`status` is `"partial"` when required fields were missing or a value was clamped. Each warning in the `warnings` array has a `field`, `type` (`clamped`, `not_filled`, `missing_required`, `type_mismatch`, `invalid_format`), `message`, and optionally `original` / `actual` values. `requires_user` lists sensitive fields the user must complete.

---

## API

```ts
const handle = await autoWebMCP(config?);

handle.isSupported   // boolean: true if document.modelContext (or legacy navigator.modelContext) exists
handle.getTools()    // Array<{ form: HTMLFormElement; name: string }>
handle.destroy()     // Promise<void> — unregister all tools & stop observing
```

### Events

```js
// auto-webmcp lifecycle events
window.addEventListener('form:registered', (e) => {
  console.log('Registered:', e.detail.toolName, e.detail.form);
});
window.addEventListener('form:unregistered', (e) => {
  console.log('Removed:', e.detail.toolName);
});

// WebMCP spec events
window.addEventListener('toolactivated', (e) => {
  // Agent has filled the form fields, waiting for submit
  console.log('Agent activated:', e.detail.toolName);
});
window.addEventListener('toolcancel', (e) => {
  // User reset the form or agent cancelled
  console.log('Cancelled:', e.detail.toolName);
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
npm test               # Playwright integration tests (Chromium)
```

---

## Browser support

- Chrome 149+ via the [WebMCP origin trial](https://developer.chrome.com/blog/ai-webmcp-origin-trial), or locally with `chrome://flags/#enable-webmcp-testing`
- Edge 150+ via origin trial
- Older Chrome builds that expose `navigator.modelContext` are still supported
- All other browsers: the library loads, analyzes forms, and silently no-ops (progressive enhancement)

Tools are unregistered by aborting the `AbortSignal` passed to `registerTool()`, per the current spec. Execute handlers honour the agent's `signal` and resolve with `status: "cancelled"` when aborted.

---

## License

MIT
