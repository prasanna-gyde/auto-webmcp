# What is WebMCP? Chrome's browser-native API for AI agents

Tags: webmcp, javascript, ai, chrome

---

AI agents are getting good at using the web. But the way they interact with it today is fragile: CSS selectors, XPath queries, visual parsing, and DOM scraping that breaks every time a designer renames a class.

Chrome 146 ships an early preview of something that changes this: **WebMCP**.

---

## The problem with how agents use the web today

When an AI agent needs to fill out a flight search form, it typically does something like this:

1. Take a screenshot or parse the DOM
2. Guess which input is "origin" vs "destination"
3. Figure out the date picker format
4. Click submit and hope the page structure hasn't changed

This works poorly. It's slow, brittle, and requires constant maintenance as sites update their UI. The agent is essentially learning to use a UI designed for humans, not machines.

WebMCP flips this model.

---

## What is WebMCP?

WebMCP is a proposed web standard that lets websites publish structured tools directly to in-browser AI agents. Instead of the agent scraping the DOM to guess how a form works, the page explicitly tells the agent: here is what I can do, here are the inputs I expect, here is what I'll return.

Think of it as MCP (Model Context Protocol) built into the browser itself.

The key difference from server-side MCP: WebMCP tools are defined in the client, inside a web page, and are available only while that page is open in a browser tab. No server to deploy, no infrastructure to maintain.

---

## How WebMCP works

Chrome exposes a new JavaScript API: `navigator.modelContext`. This object is the bridge between your web page and any AI agent running in the browser.

WebMCP offers two ways to define tools: the **Imperative API** (JavaScript) and the **Declarative API** (HTML annotations).

---

## The Imperative API

Use `registerTool()` to define a tool in JavaScript:

```js
navigator.modelContext.registerTool({
  name: "addTodo",
  description: "Add a new item to the todo list",
  inputSchema: {
    type: "object",
    properties: {
      text: { type: "string" }
    }
  },
  execute: ({ text }) => {
    addItemToList(text);
    return { content: [{ type: "text", text: `Added todo: ${text}` }] };
  }
});
```

The `execute` function is called by the agent with structured parameters matching your schema. You fill the UI, run the action, and return a result the agent can read.

To remove a tool (for example, when the user navigates away from a state where it makes sense):

```js
navigator.modelContext.unregisterTool("addTodo");
```

This dynamic registration is useful for single-page apps where available actions change based on UI state.

---

## The Declarative API

For forms, you don't need JavaScript at all. Add a few HTML attributes and the browser generates the tool definition automatically:

```html
<form
  toolname="search_flights"
  tooldescription="Search for available flights between two airports"
  action="/search"
>
  <label for="origin">Departure airport</label>
  <input type="text" name="origin" id="origin">

  <label for="destination">Arrival airport</label>
  <input type="text" name="destination" id="destination">

  <select name="cabin_class" toolparamdescription="Cabin class preference">
    <option value="economy">Economy</option>
    <option value="business">Business</option>
    <option value="first">First</option>
  </select>

  <button type="submit">Search</button>
</form>
```

The browser reads the form structure and generates a full JSON Schema automatically, including field types, required fields, and enum options from `<select>` and `<input type="radio">` elements.

The three key attributes:

| Attribute | Where | Purpose |
|-----------|-------|---------|
| `toolname` | `<form>` | Tool identifier (snake_case, no spaces) |
| `tooldescription` | `<form>` | Plain-language description for the agent |
| `toolautosubmit` | `<form>` | If present, form submits automatically when agent invokes it |
| `toolparamdescription` | any field | Overrides the label text for the JSON Schema description |

By default, when an agent invokes a declarative tool, Chrome fills in the form fields and waits for the user to click submit. Add `toolautosubmit` to the form if you want the agent to submit without user confirmation.

---

## Responding to tool invocations

The Declarative API integrates with the standard `submit` event, extended with two new properties:

```js
document.querySelector("form").addEventListener("submit", (e) => {
  e.preventDefault();

  if (e.agentInvoked) {
    // Agent called this tool, return structured result
    e.respondWith(Promise.resolve("Search complete. 3 flights found."));
  } else {
    // Regular human submission, handle normally
    doRegularSubmit();
  }
});
```

`e.agentInvoked` is `true` when the submission came from an agent. `e.respondWith()` lets you pass a promise that resolves to the result the agent receives.

---

## Events and CSS pseudo-classes

WebMCP fires two events on `window`:

```js
window.addEventListener('toolactivated', ({ toolName }) => {
  // Agent has filled the form, waiting for submit
  console.log(`${toolName} was activated by an agent`);
});

window.addEventListener('toolcancel', ({ toolName }) => {
  // Agent cancelled or user reset the form
  console.log(`${toolName} was cancelled`);
});
```

Chrome also applies CSS pseudo-classes when a tool is active:

```css
form:tool-form-active {
  outline: blue dashed 1px; /* default Chrome style */
}

input:tool-submit-active {
  outline: red dashed 1px;
}
```

You can override these to match your design system and give users a clear visual indicator that an agent is operating.

---

## What the agent sees

For a form with a `<select>`, Chrome generates a schema like this:

```json
{
  "name": "search_flights",
  "description": "Search for available flights between two airports",
  "inputSchema": {
    "type": "object",
    "properties": {
      "origin": {
        "type": "string",
        "description": "Departure airport"
      },
      "cabin_class": {
        "type": "string",
        "enum": ["economy", "business", "first"],
        "oneOf": [
          { "const": "economy", "title": "Economy" },
          { "const": "business", "title": "Business" },
          { "const": "first", "title": "First" }
        ],
        "description": "Cabin class preference"
      }
    }
  }
}
```

Note the `oneOf` alongside `enum`: this gives the agent both the raw values it needs to submit and the human-readable labels for each option, reducing the chance of the agent picking the wrong value.

---

## Best practices for tool design

A few things the Chrome team recommends:

**Name tools with verbs that describe what happens.** Use `create_event` for immediate creation, but `start_event_creation` if the tool just opens a form. The name is the agent's primary signal for when to use a tool.

**Describe what the tool does, not what it doesn't do.** Avoid descriptions like "Do not use for weather queries." Instead, describe exactly what the tool is for. Limitations should be implicit in a clear, specific description.

**Accept raw user input in your schema.** If a user says "11am to 3pm", your tool should accept strings like `"11:00"` and `"15:00"`, not ask the model to convert to minutes since midnight. The model is not a calculator.

**Return results after the UI updates.** Agents may use UI state to verify an action succeeded before planning next steps. Make sure your `execute` or `respondWith` call happens after the UI reflects the new state.

**Register tools dynamically as UI state changes.** For single-page apps, register tools when they are available and unregister when they are not. An agent should never be offered a tool that does nothing or is currently disabled.

---

## How to try it today

1. Install Chrome 146 or later
2. Navigate to `chrome://flags/#enable-webmcp-testing` and enable the flag, then relaunch
3. Install the **Model Context Tool Inspector** extension from the Chrome Web Store
4. Visit any WebMCP-enabled page, open the extension, and you will see all registered tools with their names, descriptions, and schemas

The extension also lets you manually call tools with custom parameters and test them with natural language via the Gemini API, without needing a full AI agent setup.

Google's official demo: `https://googlechromelabs.github.io/webmcp-tools/demos/react-flightsearch/`

---

## Progressive enhancement by default

A critical design choice: `navigator.modelContext` simply does not exist in browsers that don't support WebMCP. Your code should check for it or use a library that handles this gracefully:

```js
if (navigator.modelContext) {
  navigator.modelContext.registerTool({ ... });
}
```

Sites that adopt WebMCP are not broken for regular users. The tools are only visible to agents in WebMCP-capable browsers.

---

## WebMCP vs MCP

A common question: how does this differ from the Model Context Protocol (MCP) already used by tools like Claude Desktop?

| | MCP | WebMCP |
|--|-----|--------|
| Where tools run | Server-side | Client-side, in the browser |
| Who deploys them | Developer runs a server | Any web page can define tools |
| Requires a server | Yes | No |
| Works with | Desktop AI apps | In-browser AI agents |
| Spec status | Established (Anthropic) | Proposed (Google, early preview) |

They are complementary. MCP gives desktop agents access to tools and data. WebMCP gives browser agents a structured interface to web pages. A future agent might use both: MCP to access your calendar, WebMCP to book a flight on an airline's website.

---

## The bigger picture

WebMCP is in early preview, which means the API will change and the Chrome team is actively seeking feedback. But the direction is clear: the web is gaining a first-class interface for AI agents.

Forms are the most natural starting point. They already represent the actions a site wants users to take: search, submit, book, register. WebMCP makes that intent machine-readable.

If you want to make your existing forms WebMCP-ready without manually adding attributes to every one, [auto-webmcp](https://autowebmcp.dev) is an open-source library that does this automatically with one script tag. But even without a library, you can start today: add `toolname` and `tooldescription` to your most important forms and see them appear in the inspector.

---

The agentic web is not a distant future. It is in Chrome 146, behind a flag, right now.

*Follow along with the WebMCP spec on GitHub and join the early preview at [developer.chrome.com/blog/webmcp-epp](https://developer.chrome.com/blog/webmcp-epp).*
