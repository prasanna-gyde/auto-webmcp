# auto-webmcp v0.3.0: React support, richer schemas, and full WebMCP spec compliance

*Tags: webmcp, javascript, ai, opensource*

---

When we shipped the first version of [auto-webmcp](https://autowebmcp.dev), the pitch was simple: drop one script tag and every form on your page becomes a callable tool for AI agents, no manual JSON Schema writing required.

That core idea has not changed. But the past two days have been a sprint through every edge case the real web throws at you: React forms that fight you, inputs that live outside `<form>` tags, select menus that lie about their options, and a new set of WebMCP spec fields that make your tools dramatically more useful to agents.

Here is what shipped.

---

## React and framework-managed forms

Vanilla forms are easy. React forms are a different story.

React intercepts input events using its own synthetic event system. Setting `input.value = 'foo'` directly does nothing because React's state never updates. The DOM value changes, but React still thinks the field is empty. When the form submits, it sends blank data.

auto-webmcp now fills React inputs by dispatching a native input event through `HTMLInputElement.prototype` — bypassing the React wrapper and triggering `onChange` as if the user typed the value themselves:

```js
// What we do internally for React-controlled inputs
const nativeSetter = Object.getOwnPropertyDescriptor(
  HTMLInputElement.prototype, 'value'
).set;
nativeSetter.call(input, value);
input.dispatchEvent(new Event('input', { bubbles: true }));
```

For frameworks that use `execCommand` (older content-editable patterns), we fall back to `document.execCommand('insertText', false, value)`.

There is also a subtler React problem: when an agent fills a form and triggers a re-render, React can reset the field values before the submit fires. We now capture a post-fill snapshot immediately after filling, and use that snapshot when constructing the response instead of re-querying the live DOM.

MutationObserver re-analysis is debounced for forms that add inputs lazily (common in multi-step React flows). If a new field appears inside an already-registered form, auto-webmcp re-analyzes the schema without re-registering a duplicate tool.

---

## ARIA inputs and unnamed fields

The web is full of inputs that are not `<input>` elements. Rich text editors, custom dropdowns, date pickers — most of them use `role="textbox"`, `role="combobox"`, or `role="spinbutton"` to communicate their semantics to screen readers. auto-webmcp now reads the same signals.

Any element with a recognized ARIA input role is included in the schema alongside native inputs. The field key is inferred from `aria-label` or the associated `<label>` element.

For inputs without a `name` attribute (common in React where form state lives in JS, not the DOM), we now key the schema field by `id` or `aria-label` so agents can still reference and fill them by name.

One specific fix: Ghost's newsletter signup forms use an `<input type="email">` with no `name` or `id` — only a `placeholder`. Previously, these were silently excluded. Now `placeholder` is used as the field key and title, making these forms fully callable.

---

## Schema improvements for selects and checkboxes

**Optgroup labels** are now surfaced in the schema. If a select menu groups options under `<optgroup label="North America">`, the label appears as metadata on the option, giving agents clearer context for picking values.

**Datalist suggestions** from `<input list="...">` are collected and included in the schema as suggestions, not hard constraints — agents can still provide values outside the list.

**Disabled options** are excluded. If an option is `disabled`, agents should not try to select it.

**Meaningful empty options** are now handled correctly. The old behavior was simple: skip any `<option value="">`. But that excluded legitimate choices like "No preference" or "All Categories". Now we only skip placeholder text that follows the pattern `"Select..."`, `"Choose..."`, `"Pick..."`, or `"---"`. Empty-value options with real labels are included in the schema with `const: ""` so agents can express those choices.

**Multi-select** fields produce `type: array` with `items.enum` instead of a single-value string. The fill handler accepts an array of values or a single string (treated as a one-element array), deselects all options first, then selects matching values.

**Checkbox groups** produce `type: array` with `items.enum` listing the values of each checkbox in the group. Filling accepts an array of values to check.

---

## Orphan inputs (forms without `<form>` tags)

A surprising number of real-world "forms" are not `<form>` elements. They are collections of inputs inside a `<div>`, with a submit button and some JavaScript. Single-page apps love this pattern.

auto-webmcp now scans for inputs outside `<form>` elements, groups them by their nearest ancestor that contains a visible submit button, and registers each group as a tool. The same schema inference rules apply: field types, labels, enums, and descriptions are all collected.

This means subscribe boxes, search widgets, and wizard steps that skip the `<form>` tag are now automatically callable.

---

## WebMCP spec compliance: annotations, field titles, defaults

Version 0.3.0 adds three features that align auto-webmcp with the latest WebMCP spec.

### Tool annotations

`ToolAnnotations` is a set of hints that tell agents about the behavior of a tool before they call it:

| Annotation | Meaning |
|---|---|
| `readOnlyHint` | Tool only reads data, does not modify anything |
| `destructiveHint` | Tool deletes or irreversibly modifies data |
| `idempotentHint` | Calling the tool multiple times has the same effect as calling it once |
| `openWorldHint` | Tool talks to external systems (email, payment, etc.) |

auto-webmcp infers these automatically:

- `GET` forms get `readOnlyHint: true`
- Forms with delete/remove/cancel button text get `destructiveHint: true`
- Forms posting to URLs with `/search` or `/filter` patterns get `idempotentHint: true`
- Forms posting to external domains get `openWorldHint: true`

You can override any inference with data attributes:

```html
<form data-webmcp-destructive="true" data-webmcp-openworld="true">
  <!-- delete account form -->
</form>
```

### Field titles via `toolparamtitle`

The WebMCP spec added `toolparamtitle` as a native attribute for setting the display title of a schema field. auto-webmcp now reads this attribute first, before falling back to `data-webmcp-title` and label text.

```html
<input
  type="text"
  name="q"
  toolparamtitle="Search query"
  toolparamdescription="What you want to search for"
>
```

### Schema defaults from pre-filled values

If a field has a value already set when the page loads — a text input with a default value, a select with a pre-selected option, a checked checkbox — that value is now exposed as `default` in the JSON Schema.

This gives agents a concrete starting point. Instead of guessing that "economy" is probably the default cabin class, the schema tells them directly.

```json
{
  "cabin_class": {
    "type": "string",
    "enum": ["economy", "business", "first"],
    "default": "economy"
  }
}
```

---

## By the numbers

- v0.2.1 shipped with 32 tests
- v0.3.0 ships with 82 tests
- 50 new integration tests covering React remounts, multi-select fill, orphan inputs, annotations, and defaults
- All tests run against real Chromium via Playwright

---

## Try it

```html
<script
  src="https://cdn.jsdelivr.net/npm/auto-webmcp@0.3.0/dist/auto-webmcp.iife.js"
  async>
</script>
```

That is the entire integration. Every form on your page becomes a callable WebMCP tool. React forms, orphan inputs, multi-selects, checkbox groups — all handled.

To test: Chrome 146+, enable `chrome://flags/#enable-webmcp-testing`, install the Model Context Tool Inspector extension, and open any page with the script tag.

**[autowebmcp.dev](https://autowebmcp.dev) · [GitHub](https://github.com/prasanna-gyde/auto-webmcp) · npm: auto-webmcp · MIT**
