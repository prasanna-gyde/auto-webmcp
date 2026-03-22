=== AI-Agent Ready Forms (auto-webmcp) ===
Contributors: getprasannav
Tags: ai, forms, webmcp, ai-agent, automation, woocommerce, contact-form
Requires at least: 6.0
Tested up to: 6.7
Stable tag: 0.2.1
Requires PHP: 7.4
License: MIT
License URI: https://opensource.org/licenses/MIT

Make every form on your WordPress site callable by AI agents. Drop-in, zero configuration, works with WooCommerce and all standard form plugins.

== Description ==

**AI agents are coming for the web. This plugin makes your site ready in 60 seconds.**

auto-webmcp automatically makes every HTML form on your WordPress site callable by AI agents via [Chrome WebMCP](https://developer.chrome.com/docs/extensions/webmcp), the new browser-native standard for AI agent tool registration.

No manual JSON schema writing. No form modifications. No backend changes. Just activate the plugin and every `<form>` on your site is instantly registered as a structured AI tool.

= What it does =

When an AI agent visits your site in a WebMCP-capable browser (Chrome 146+), it can discover and invoke your forms as native tools — filling fields, submitting data, and completing tasks on behalf of users.

auto-webmcp handles everything automatically:

* **Infers tool names** from submit button text, form headings, or form IDs
* **Infers descriptions** from fieldset legends, aria-labels, and page context
* **Generates JSON Schema** for every form field — text, email, select, checkbox, radio, date, number
* **Excludes sensitive fields** — password, hidden, and file inputs are never exposed
* **Works with dynamic forms** — MutationObserver detects forms added by JavaScript

= Compatible form plugins =

* Contact Form 7
* WPForms
* Gravity Forms
* Ninja Forms
* WooCommerce checkout, login, registration, and address forms
* WordPress core login, registration, and comment forms

= How to use =

1. Install and activate this plugin
2. Go to **Settings > AI-Agent Forms** and confirm the plugin is enabled
3. Visit your site in Chrome 146+ with `chrome://flags/#enable-webmcp-testing` enabled
4. Install the **Model Context Tool Inspector** extension
5. Your forms appear as registered AI tools in the inspector panel

= Advanced: annotate individual forms =

For forms you control in a theme or page builder, you can add WebMCP spec attributes for richer agent descriptions:

`<form toolname="submit_enquiry" tooldescription="Submit a product enquiry." toolautosubmit="true">`

= Completely free and open source =

auto-webmcp is MIT licensed with no API keys, no usage tracking, no server calls. The script loads from jsDelivr CDN. [View source on GitHub](https://github.com/prasanna-gyde/auto-webmcp).

== Installation ==

1. Upload the plugin folder to `/wp-content/plugins/`
2. Activate through the **Plugins** screen in WordPress
3. Go to **Settings > AI-Agent Forms** to confirm it is enabled

== Frequently Asked Questions ==

= Does this require any special browser? =

Chrome 146 or later with the WebMCP testing flag enabled at `chrome://flags/#enable-webmcp-testing`. On other browsers the script loads but silently does nothing: no errors, no impact on regular visitors.

= Will this break my forms? =

No. auto-webmcp is read-only during analysis. It only fills form fields when an AI agent actively invokes a tool. Regular user interactions are completely unaffected.

= Does it work with iFrame-embedded forms? =

No. auto-webmcp cannot cross iframe boundaries. Most form plugins (Contact Form 7, WPForms, Gravity Forms) render directly in the page DOM by default, which is fully supported.

= Is my users' data sent anywhere? =

No. auto-webmcp runs entirely in the browser. No data is sent to any server. The script is loaded from jsDelivr CDN (a standard CDN used by millions of plugins).

= Does it expose passwords or sensitive fields? =

Never. Password, hidden, and file inputs are excluded by design and will never appear in the tool schema.

= Can I exclude specific forms? =

Yes. Add `data-no-webmcp` to any `<form>` element to exclude it:
`<form data-no-webmcp>...</form>`

== Changelog ==

= 0.2.1 =
* Initial release — wraps auto-webmcp v0.2.1
* Settings page with enable/disable toggle
* Loads script via wp_enqueue_scripts with async strategy

== Upgrade Notice ==

= 0.2.1 =
Initial release.
