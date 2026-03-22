# Every web form should be callable by AI agents (and yours can be today)

*Tags: webmcp, javascript, ai, opensource*
*Cover image: use og-image.png from the repo (1200x630, crop to 1000x420)*

---

AI agents are getting good at using computers. They can browse the web, click buttons, read emails, write code. But when it comes to filling out web forms, they still do it the hard way: CSS selectors, fragile XPath queries, DOM scraping that breaks every time a designer tweaks a class name.

Chrome is about to change that.

## WebMCP: structured tool registration, built into the browser

Chrome 146 shipped an Early Preview of **WebMCP**, a browser-native API that lets websites register their interactive elements as structured tools. Think of it as MCP (Model Context Protocol) for desktop AI, but built directly into the browser itself.

When a page registers a tool via WebMCP, an AI agent can see:
- **What the tool is called** (e.g. `submit_flight_search`)
- **What it does** (e.g. "Search for available flights between two cities")
- **What inputs it expects**: a full JSON Schema with field types, constraints, and descriptions

No more guessing from HTML. No more brittle selectors. The agent just calls the tool.

## The problem: adopting WebMCP manually is tedious

Here is what it takes to register a single form manually:

```javascript
navigator.modelContext.registerTool({
  name: 'search_flights',
  description: 'Search for available flights between two airports on a given date.',
  inputSchema: {
    type: 'object',
    properties: {
      origin: { type: 'string', description: 'IATA code of departure airport' },
      destination: { type: 'string', description: 'IATA code of arrival airport' },
      departure_date: { type: 'string', format: 'date', description: 'Departure date (YYYY-MM-DD)' },
      passengers: { type: 'integer', minimum: 1, maximum: 9 },
      cabin_class: { type: 'string', enum: ['economy', 'business', 'first'] }
    },
    required: ['origin', 'destination', 'departure_date']
  },
  execute: async (params) => {
    // fill the form, submit, return result
  }
});
```

That's for *one* form. A typical site has dozens.

Then you have to maintain it every time a field changes. And write it for every platform your users are on: WordPress, Shopify, HubSpot, Zendesk, ServiceNow...

## The solution: one script tag

**[auto-webmcp](https://autowebmcp.dev)** is an open-source library that does all of this automatically.

Drop one script tag into your page:

```html
<script
  src="https://cdn.jsdelivr.net/npm/auto-webmcp@0.2.1/dist/auto-webmcp.iife.js"
  async>
</script>
```

That's it. Every `<form>` on the page is automatically:

1. **Scanned** — MutationObserver catches forms added by JavaScript too
2. **Analyzed** — name inferred from submit button, heading, or form ID; description from legend or aria-label
3. **Schema-generated** — HTML input types mapped to JSON Schema with constraints, enums, and field titles
4. **Registered** — via `navigator.modelContext.registerTool()` with full spec compliance

No manual JSON schema writing. No annotations required. No backend changes.

## It reads your existing HTML intelligently

auto-webmcp infers everything it needs from your existing markup:

| What it needs | Where it looks |
|---|---|
| Tool name | `toolname` attr, then submit button text, then nearest heading, then form `id` |
| Description | `tooldescription` attr, then `<legend>` text, then `aria-label` |
| Field type | `<input type>`, `<select>`, `<textarea>` mapped to JSON Schema |
| Field title | `<label>` text, then humanized field name |
| Options | `<option>` elements collected as `enum` + `oneOf` with display labels |

If you want to override anything, you can add native spec attributes directly to the form:

```html
<form
  toolname="submit_flight_search"
  tooldescription="Search for available flights. Requires origin, destination, and date."
  toolautosubmit="true"
>
  ...
</form>
```

Or use `data-webmcp-*` attributes, which are useful for platforms where you cannot touch the form element directly.

## Safe to ship on any site today

auto-webmcp is built around **progressive enhancement**:

- No `navigator.modelContext`? The script loads and does nothing, silently
- Password, hidden, and file inputs are never exposed to agents
- No data leaves the browser: completely client-side, MIT licensed, no API key required
- Works with React, Vue, Angular, and any framework (MutationObserver handles dynamic forms)

You can drop it into production today and regular users will not notice anything. Only WebMCP-capable agents will see the registered tools.

## Works on every platform

Because it is just a script tag, it works anywhere custom JavaScript is allowed:

- **WordPress**: install the [auto-webmcp plugin](https://autowebmcp.dev/platforms/wordpress) (currently in wp.org review) or add one line to `functions.php`
- **Shopify**: paste into `theme.liquid` before `</body>`
- **Wix**: Settings, Custom Code, Body end
- **HubSpot**: Footer HTML tracking code
- **Zendesk**: Zendesk Apps Framework
- **ServiceNow**: UI Scripts

[Full platform guides](https://autowebmcp.dev/platforms)

## Try it now

1. Open Chrome 146+ and enable `chrome://flags/#enable-webmcp-testing`
2. Install the Model Context Tool Inspector extension from the Chrome Web Store
3. Visit [autowebmcp.dev/demo](https://autowebmcp.dev/demo) and watch the registered tools appear in the inspector panel in real time

The agentic web is arriving. WebMCP is the infrastructure layer. auto-webmcp is the one-line on-ramp.

**[autowebmcp.dev](https://autowebmcp.dev) · [GitHub](https://github.com/prasanna-gyde/auto-webmcp) · MIT · open source**
