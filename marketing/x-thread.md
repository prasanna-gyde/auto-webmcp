# X / Twitter Thread

**Post Monday or Tuesday, 9–11am PT. Attach demo GIF to tweet 1.**

---

**Tweet 1 (hook — attach demo GIF here)**
AI agents can now fill web forms natively in Chrome.

Most sites will take months to support it manually.

This one does it in 60 seconds. 🧵

---

**Tweet 2 (problem)**
Chrome 146 shipped WebMCP — a browser-native API for AI agent tool registration.

To adopt it manually, you write JSON schema for every form field. On every page. On every platform.

For a 5-field form that looks like this: [code snippet showing verbose registerTool() call]

For a 50-form site, that's weeks of work.

---

**Tweet 3 (solution)**
auto-webmcp reduces it to one line:

```
<script src="cdn.jsdelivr.net/npm/auto-webmcp@0.2.1/dist/auto-webmcp.iife.js" async></script>
```

Drop it in. Every <form> on your page is instantly registered as a structured AI tool.

No schema writing. No annotations. No backend changes.

---

**Tweet 4 (how it works)**
It reads your existing HTML intelligently:

→ Tool name from submit button text or form heading
→ Description from <legend> or aria-label
→ JSON Schema from input types, select options, radio groups
→ MutationObserver catches forms added dynamically by React/Vue/Angular

Your DOM is already the spec. It just reads it.

---

**Tweet 5 (platform breadth)**
Works on every platform that allows custom JS:

→ WordPress (free plugin)
→ Shopify (theme.liquid)
→ Wix (Custom Code)
→ HubSpot (tracking code)
→ Zendesk (Apps Framework)
→ ServiceNow (UI Scripts)

Same script tag, every platform: autowebmcp.dev/platforms

---

**Tweet 6 (safety angle)**
And it's safe to ship today:

→ Progressive enhancement — silent no-op on non-Chrome browsers
→ Passwords and hidden fields are NEVER exposed
→ Zero server calls, fully client-side, MIT licensed
→ Regular users see zero difference

The agentic web arrives gradually. This keeps you ahead of it.

---

**Tweet 7 (CTA)**
Try it: autowebmcp.dev/demo
(Chrome 146+ with chrome://flags/#enable-webmcp-testing)

⭐ Star if you're building on WebMCP: github.com/prasanna-gyde/auto-webmcp

MIT · open source · built by @[your handle]

---

# Show HN Post

**Title:**
Show HN: auto-webmcp – Drop a script tag, every HTML form becomes callable by AI agents

**Body:**
Chrome 146 shipped WebMCP Early Preview – a browser-native API for AI agent tool registration. Most sites will need to write JSON schema for every form field manually, which is tedious and platform-specific.

auto-webmcp eliminates that entirely. One script tag and every <form> on the page is automatically registered as a structured WebMCP tool – name and description inferred from the DOM, full JSON Schema generated from input types, dynamic forms handled via MutationObserver.

Works on WordPress, Shopify, Wix, HubSpot, Zendesk, ServiceNow out of the box.

Progressive enhancement – silent no-op on browsers without WebMCP support, so it's safe to ship to production today.

MIT, no API key, no server calls, 8kb minified.

Demo: https://autowebmcp.dev/demo
GitHub: https://github.com/prasanna-gyde/auto-webmcp
