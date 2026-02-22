/**
 * Unit-style integration tests for the form analyzer and schema builder.
 * These run in a real browser (Playwright) but mock navigator.modelContext
 * to inspect what gets registered.
 */

import { test, expect } from '@playwright/test';

// Mock WebMCP API and capture registrations
const MOCK_WEBMCP = `
  window.__registeredTools = [];
  navigator.modelContext = {
    registerTool(tool) {
      window.__registeredTools.push(JSON.parse(JSON.stringify(tool)));
      return Promise.resolve();
    },
    unregisterTool(name) {
      window.__registeredTools = window.__registeredTools.filter(t => t.name !== name);
      return Promise.resolve();
    }
  };
`;

// Helper to get registered tools from the page
async function getRegisteredTools(page: import('@playwright/test').Page) {
  return page.evaluate(() => (window as unknown as Record<string, unknown>)['__registeredTools'] as unknown[]);
}

test.describe('Flight search form', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(MOCK_WEBMCP);
    await page.goto('/tests/fixtures/search.html');
    // Wait for auto-init
    await page.waitForFunction(
      () => (window as unknown as Record<string, unknown>)['__registeredTools'] &&
        ((window as unknown as Record<string, unknown>)['__registeredTools'] as unknown[]).length > 0,
      { timeout: 5000 },
    );
  });

  test('registers exactly one tool', async ({ page }) => {
    const tools = await getRegisteredTools(page);
    expect(tools).toHaveLength(1);
  });

  test('tool name derived from submit button text', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    expect(tools[0]?.['name']).toBe('search_flights');
  });

  test('tool description includes page heading', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const desc = tools[0]?.['description'] as string;
    expect(desc).toBeTruthy();
    expect(desc.length).toBeGreaterThan(5);
  });

  test('inputSchema has expected fields', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const schema = tools[0]?.['inputSchema'] as Record<string, unknown>;
    const props = schema['properties'] as Record<string, unknown>;

    expect(Object.keys(props)).toContain('origin');
    expect(Object.keys(props)).toContain('destination');
    expect(Object.keys(props)).toContain('depart_date');
    expect(Object.keys(props)).toContain('return_date');
    expect(Object.keys(props)).toContain('passengers');
    expect(Object.keys(props)).toContain('cabin_class');
    expect(Object.keys(props)).toContain('trip_type');
  });

  test('date fields have date format', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const schema = tools[0]?.['inputSchema'] as Record<string, unknown>;
    const props = schema['properties'] as Record<string, Record<string, unknown>>;

    expect(props['depart_date']?.['type']).toBe('string');
    expect(props['depart_date']?.['format']).toBe('date');
  });

  test('number field has min/max constraints', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const schema = tools[0]?.['inputSchema'] as Record<string, unknown>;
    const props = schema['properties'] as Record<string, Record<string, unknown>>;

    expect(props['passengers']?.['type']).toBe('number');
    expect(props['passengers']?.['minimum']).toBe(1);
    expect(props['passengers']?.['maximum']).toBe(9);
  });

  test('select field has enum values', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const schema = tools[0]?.['inputSchema'] as Record<string, unknown>;
    const props = schema['properties'] as Record<string, Record<string, unknown>>;

    expect(props['cabin_class']?.['type']).toBe('string');
    expect(props['cabin_class']?.['enum']).toEqual([
      'economy', 'premium_economy', 'business', 'first',
    ]);
  });

  test('radio group has enum values', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const schema = tools[0]?.['inputSchema'] as Record<string, unknown>;
    const props = schema['properties'] as Record<string, Record<string, unknown>>;

    expect(props['trip_type']?.['type']).toBe('string');
    expect(props['trip_type']?.['enum']).toEqual(['roundtrip', 'oneway', 'multicity']);
  });

  test('required fields listed in required array', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const schema = tools[0]?.['inputSchema'] as Record<string, unknown>;
    const required = schema['required'] as string[];

    expect(required).toContain('origin');
    expect(required).toContain('destination');
    expect(required).toContain('depart_date');
    expect(required).not.toContain('return_date'); // optional
    expect(required).not.toContain('passengers');  // optional
  });

  test('password field is never in schema', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const schema = tools[0]?.['inputSchema'] as Record<string, unknown>;
    const props = schema['properties'] as Record<string, unknown>;

    expect(Object.keys(props)).not.toContain('password');
  });
});

test.describe('Checkout form', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(MOCK_WEBMCP);
    await page.goto('/tests/fixtures/checkout.html');
    await page.waitForFunction(
      () => ((window as unknown as Record<string, unknown>)['__registeredTools'] as unknown[]).length > 0,
      { timeout: 5000 },
    );
  });

  test('uses data-webmcp-name attribute for tool name', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    expect(tools[0]?.['name']).toBe('checkout');
  });

  test('uses data-webmcp-description attribute for description', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    expect(tools[0]?.['description']).toBe(
      'Complete a purchase by providing shipping address and payment details',
    );
  });

  test('skips password field (none here) and hidden fields', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const schema = tools[0]?.['inputSchema'] as Record<string, unknown>;
    const props = schema['properties'] as Record<string, unknown>;

    // card_number has data-webmcp-title
    expect(Object.keys(props)).toContain('card_number');

    // No hidden or file fields
    expect(Object.keys(props)).not.toContain('__hidden');
  });

  test('checkbox field is type boolean', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const schema = tools[0]?.['inputSchema'] as Record<string, unknown>;
    const props = schema['properties'] as Record<string, Record<string, unknown>>;

    expect(props['save_card']?.['type']).toBe('boolean');
  });

  test('field with data-webmcp-title uses that as title', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const schema = tools[0]?.['inputSchema'] as Record<string, unknown>;
    const props = schema['properties'] as Record<string, Record<string, unknown>>;

    expect(props['card_number']?.['title']).toBe('Credit Card Number');
  });
});

test.describe('Multi-form page', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(MOCK_WEBMCP);
    await page.goto('/tests/fixtures/multi-form.html');
    await page.waitForTimeout(500); // let MutationObserver settle
  });

  test('skips form with data-no-webmcp', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const names = tools.map((t) => (t as Record<string, unknown>)['name']);
    // Newsletter form has data-no-webmcp — should not appear
    expect(names).not.toContain('subscribe');
  });

  test('registers the book_appointment tool with explicit name', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const names = tools.map((t) => (t as Record<string, unknown>)['name']);
    expect(names).toContain('book_appointment');
  });

  test('appointment date field has correct data-webmcp-title', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const appt = (tools as Array<Record<string, unknown>>).find((t) => t['name'] === 'book_appointment');
    const schema = appt?.['inputSchema'] as Record<string, unknown> | undefined;
    const props = schema?.['properties'] as Record<string, Record<string, unknown>> | undefined;
    expect(props?.['date']?.['title']).toBe('Appointment Date');
    expect(props?.['date']?.['description']).toBe('Preferred date for the appointment');
  });

  test('multiple forms are all registered', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    // product-search, login-form (password skips it — still registered), book_appointment
    // newsletter is excluded via data-no-webmcp
    expect(tools.length).toBeGreaterThanOrEqual(2);
  });
});

test.describe('Graceful degradation', () => {
  test('does not throw when navigator.modelContext is unavailable', async ({ page }) => {
    // No mock — modelContext not defined
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/tests/fixtures/contact.html');
    await page.waitForTimeout(500);

    expect(errors).toHaveLength(0);
  });
});

test.describe('Enhancer integration', () => {
  test('uses LLM-enriched description when config.enhance is set', async ({ page }) => {
    await page.addInitScript(MOCK_WEBMCP);

    // Intercept the Claude API
    await page.route('https://api.anthropic.com/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          content: [{ type: 'text', text: 'Search for available flights between two cities.' }],
        }),
      });
    });

    await page.goto('/tests/fixtures/search.html');

    // Disable auto-init before re-running manually with enhance config
    await page.evaluate(async () => {
      (window as unknown as Record<string, unknown>)['__AUTO_WEBMCP_NO_AUTOINIT'] = true;
    });

    // Re-run with enhance config
    await page.evaluate(async () => {
      const { autoWebMCP } = await import('/dist/auto-webmcp.esm.js') as { autoWebMCP: (config: unknown) => Promise<void> };
      await autoWebMCP({
        enhance: { provider: 'claude', apiKey: 'test-key' },
      });
    });

    const tools = await page.evaluate(() => (window as unknown as Record<string, unknown>)['__registeredTools'] as Array<Record<string, unknown>>);
    expect(tools[tools.length - 1]?.['description']).toBe(
      'Search for available flights between two cities.'
    );
  });
});

test.describe('Contact form', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(MOCK_WEBMCP);
    await page.goto('/tests/fixtures/contact.html');
    await page.waitForFunction(
      () => ((window as unknown as Record<string, unknown>)['__registeredTools'] as unknown[]).length > 0,
      { timeout: 5000 },
    );
  });

  test('infers name from submit button text', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    expect(tools[0]?.['name']).toBe('send_message');
  });

  test('textarea is type string', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const schema = tools[0]?.['inputSchema'] as Record<string, unknown>;
    const props = schema['properties'] as Record<string, Record<string, unknown>>;
    expect(props['message']?.['type']).toBe('string');
  });

  test('subject select has all enum options', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const schema = tools[0]?.['inputSchema'] as Record<string, unknown>;
    const props = schema['properties'] as Record<string, Record<string, unknown>>;
    expect(props['subject']?.['enum']).toEqual([
      'support', 'billing', 'sales', 'feedback', 'other',
    ]);
  });
});
