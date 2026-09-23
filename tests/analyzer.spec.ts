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

async function initWithConfig(
  page: import('@playwright/test').Page,
  url: string,
  config: Record<string, unknown>,
) {
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>)['__AUTO_WEBMCP_NO_AUTOINIT'] = true;
  });
  await page.goto(url);
  await page.evaluate(async (cfg) => {
    const mod = await import('/dist/auto-webmcp.esm.js');
    await mod.autoWebMCP(cfg);
  }, config);
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
    expect(tools[0]?.['description']).toMatch(
      /^Complete a purchase by providing shipping address and payment details/,
    );
  });

  test('blocks card fields and skips hidden fields', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const schema = tools[0]?.['inputSchema'] as Record<string, unknown>;
    const props = schema['properties'] as Record<string, unknown>;

    // Card data is entered by the user, never the agent
    expect(Object.keys(props)).not.toContain('card_number');
    expect(Object.keys(props)).not.toContain('card_expiry');
    expect(Object.keys(props)).not.toContain('cvv');
    expect(Object.keys(props)).toContain('promo_code');

    // No hidden or file fields
    expect(Object.keys(props)).not.toContain('__hidden');
  });

  test('checkbox field is type boolean', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const schema = tools[0]?.['inputSchema'] as Record<string, unknown>;
    const props = schema['properties'] as Record<string, Record<string, unknown>>;

    expect(props['save_card']?.['type']).toBe('boolean');
  });

  test('blocked field with data-webmcp-title is named in the description', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    expect(tools[0]?.['description']).toContain('The user must enter: Credit Card Number');
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


// Enhanced mock that preserves execute handlers for invocation testing
const MOCK_WEBMCP_WITH_EXECUTE = `
  window.__registeredTools = [];
  window.__executeHandlers = {};
  navigator.modelContext = {
    registerTool(tool) {
      window.__registeredTools.push(JSON.parse(JSON.stringify(tool)));
      window.__executeHandlers[tool.name] = tool.execute;
      return Promise.resolve();
    },
    unregisterTool(name) {
      window.__registeredTools = window.__registeredTools.filter(t => t.name !== name);
      delete window.__executeHandlers[name];
      return Promise.resolve();
    }
  };
`;

test.describe('Native WebMCP attributes', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(MOCK_WEBMCP);
    await initWithConfig(page, '/tests/fixtures/native-attrs.html', { declarativeMode: 'force' });
    await page.waitForFunction(
      () => ((window as unknown as Record<string, unknown>)['__registeredTools'] as unknown[]).length > 0,
      { timeout: 5000 },
    );
  });

  test('uses toolname attribute for tool name', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    expect(tools[0]?.['name']).toBe('subscribe_newsletter');
  });

  test('uses tooldescription attribute for description', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    expect(tools[0]?.['description']).toBe('Subscribe to our newsletter with your email and preferences');
  });

  test('uses toolparamdescription for field description', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const schema = tools[0]?.['inputSchema'] as Record<string, unknown>;
    const props = schema['properties'] as Record<string, Record<string, unknown>>;
    expect(props['email']?.['description']).toBe('Your email address for the newsletter');
    expect(props['frequency']?.['description']).toBe('How often you want to receive the newsletter');
  });

  test('select field has anyOf with titles', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const schema = tools[0]?.['inputSchema'] as Record<string, unknown>;
    const props = schema['properties'] as Record<string, Record<string, unknown>>;
    const anyOf = props['frequency']?.['anyOf'] as Array<Record<string, string>>;
    expect(anyOf).toBeDefined();
    expect(anyOf).toContainEqual({ type: 'string', const: 'daily', title: 'Daily' });
    expect(anyOf).toContainEqual({ type: 'string', const: 'weekly', title: 'Weekly' });
    expect(anyOf).toContainEqual({ type: 'string', const: 'monthly', title: 'Monthly' });
  });

  test('select field still has enum alongside anyOf', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const schema = tools[0]?.['inputSchema'] as Record<string, unknown>;
    const props = schema['properties'] as Record<string, Record<string, unknown>>;
    expect(props['frequency']?.['enum']).toEqual(['daily', 'weekly', 'monthly']);
  });

  test('uses label text for field title', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const schema = tools[0]?.['inputSchema'] as Record<string, unknown>;
    const props = schema['properties'] as Record<string, Record<string, unknown>>;
    expect(props['email']?.['title']).toBe('Email Address');
  });
});

test.describe('toolactivated and toolcancel events', () => {
  test('fires toolactivated event after agent invocation', async ({ page }) => {
    await page.addInitScript(MOCK_WEBMCP_WITH_EXECUTE);
    await initWithConfig(page, '/tests/fixtures/native-attrs.html', { declarativeMode: 'force' });
    await page.waitForFunction(
      () => ((window as unknown as Record<string, unknown>)['__registeredTools'] as unknown[]).length > 0,
      { timeout: 5000 },
    );

    // Listen for toolactivated event
    await page.evaluate(() => {
      (window as unknown as Record<string, unknown>)['__toolActivatedEvents'] = [];
      window.addEventListener('toolactivated', (e) => {
        ((window as unknown as Record<string, unknown>)['__toolActivatedEvents'] as unknown[]).push(
          (e as CustomEvent).detail,
        );
      });
    });

    // Invoke the execute handler
    await page.evaluate(() => {
      const handlers = (window as unknown as Record<string, unknown>)['__executeHandlers'] as Record<string, (p: Record<string, unknown>) => Promise<unknown>>;
      const fn = handlers['subscribe_newsletter'];
      if (fn) fn({ email: 'test@example.com', frequency: 'weekly' }).catch(() => {});
    });

    await page.waitForTimeout(100);

    const events = await page.evaluate(() =>
      (window as unknown as Record<string, unknown>)['__toolActivatedEvents'] as Array<Record<string, unknown>>,
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.['toolName']).toBe('subscribe_newsletter');
  });

  test('fires toolcancel event on form reset', async ({ page }) => {
    await page.addInitScript(MOCK_WEBMCP_WITH_EXECUTE);
    await initWithConfig(page, '/tests/fixtures/native-attrs.html', { declarativeMode: 'force' });
    await page.waitForFunction(
      () => ((window as unknown as Record<string, unknown>)['__registeredTools'] as unknown[]).length > 0,
      { timeout: 5000 },
    );

    // Listen for toolcancel event
    await page.evaluate(() => {
      (window as unknown as Record<string, unknown>)['__toolCancelEvents'] = [];
      window.addEventListener('toolcancel', (e) => {
        ((window as unknown as Record<string, unknown>)['__toolCancelEvents'] as unknown[]).push(
          (e as CustomEvent).detail,
        );
      });
    });

    // Trigger a form reset
    await page.evaluate(() => {
      const form = document.querySelector('form');
      if (form) form.reset();
    });

    await page.waitForTimeout(100);

    const events = await page.evaluate(() =>
      (window as unknown as Record<string, unknown>)['__toolCancelEvents'] as Array<Record<string, unknown>>,
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.['toolName']).toBe('subscribe_newsletter');
  });
});

test.describe('radio anyOf labels', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(MOCK_WEBMCP);
    await page.goto('/tests/fixtures/search.html');
    await page.waitForFunction(
      () => ((window as unknown as Record<string, unknown>)['__registeredTools'] as unknown[]).length > 0,
      { timeout: 5000 },
    );
  });

  test('radio group has anyOf with human-readable titles', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const schema = tools[0]?.['inputSchema'] as Record<string, unknown>;
    const props = schema['properties'] as Record<string, Record<string, unknown>>;
    const anyOf = props['trip_type']?.['anyOf'] as Array<Record<string, string>>;
    expect(anyOf).toBeDefined();
    expect(anyOf).toContainEqual({ type: 'string', const: 'roundtrip', title: 'Round Trip' });
    expect(anyOf).toContainEqual({ type: 'string', const: 'oneway', title: 'One Way' });
    expect(anyOf).toContainEqual({ type: 'string', const: 'multicity', title: 'Multi-City' });
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

test.describe('ARIA-role fields (React-style form)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(MOCK_WEBMCP);
    await page.goto('/tests/fixtures/react-form.html');
    await page.waitForFunction(
      () => ((window as unknown as Record<string, unknown>)['__registeredTools'] as unknown[]).length > 0,
      { timeout: 5000 },
    );
  });

  test('registers exactly one tool', async ({ page }) => {
    const tools = await getRegisteredTools(page);
    expect(tools).toHaveLength(1);
  });

  test('tool name derived from submit button', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    expect(tools[0]?.['name']).toBe('create_repository');
  });

  test('unnamed native input keyed by id is included', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const props = (tools[0]?.['inputSchema'] as Record<string, unknown>)?.['properties'] as Record<string, unknown>;
    expect(Object.keys(props)).toContain('repo_name');
    expect((props['repo_name'] as Record<string, unknown>)?.['type']).toBe('string');
  });

  test('ARIA textbox (contenteditable) is included as string', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const props = (tools[0]?.['inputSchema'] as Record<string, unknown>)?.['properties'] as Record<string, unknown>;
    expect(Object.keys(props)).toContain('repo_description');
    expect((props['repo_description'] as Record<string, unknown>)?.['type']).toBe('string');
  });

  test('ARIA radio elements are included', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const props = (tools[0]?.['inputSchema'] as Record<string, unknown>)?.['properties'] as Record<string, unknown>;
    const keys = Object.keys(props);
    // Each radio is a separate key since they have distinct ids/aria-labels
    expect(keys).toContain('visibility_public');
    expect(keys).toContain('visibility_private');
  });

  test('ARIA checkbox is type boolean', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const props = (tools[0]?.['inputSchema'] as Record<string, unknown>)?.['properties'] as Record<string, unknown>;
    expect(Object.keys(props)).toContain('initialize_repo');
    expect((props['initialize_repo'] as Record<string, unknown>)?.['type']).toBe('boolean');
  });

  test('ARIA combobox with linked listbox has enum values', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const props = (tools[0]?.['inputSchema'] as Record<string, unknown>)?.['properties'] as Record<string, unknown>;
    expect(Object.keys(props)).toContain('gitignore_template');
    const comboboxProp = props['gitignore_template'] as Record<string, unknown>;
    expect(comboboxProp?.['type']).toBe('string');
    expect(comboboxProp?.['enum']).toEqual(['none', 'node', 'python', 'java']);
  });
});

test.describe('Lazy-rendered inputs', () => {
  test('re-registers form when inputs are injected after 200ms', async ({ page }) => {
    await page.addInitScript(MOCK_WEBMCP);
    await page.goto('/tests/fixtures/lazy-inputs.html');

    // Wait for initial registration (form with no inputs)
    await page.waitForFunction(
      () => ((window as unknown as Record<string, unknown>)['__registeredTools'] as unknown[]).length > 0,
      { timeout: 5000 },
    );

    // Wait for the 200ms setTimeout + debounce to fire and re-register
    await page.waitForFunction(
      () => {
        const tools = (window as unknown as Record<string, unknown>)['__registeredTools'] as Array<Record<string, unknown>>;
        const schema = tools[0]?.['inputSchema'] as Record<string, unknown>;
        const props = schema?.['properties'] as Record<string, unknown>;
        return props && Object.keys(props).length >= 2;
      },
      { timeout: 3000 },
    );

    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const props = (tools[0]?.['inputSchema'] as Record<string, unknown>)?.['properties'] as Record<string, unknown>;
    expect(Object.keys(props)).toContain('username');
    expect(Object.keys(props)).toContain('email');
  });
});

test.describe('Optgroup select', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(MOCK_WEBMCP);
    await page.goto('/tests/fixtures/optgroup-select.html');
    await page.waitForFunction(
      () => ((window as unknown as Record<string, unknown>)['__registeredTools'] as unknown[]).length > 0,
      { timeout: 5000 },
    );
  });

  test('enum is flat and contains only enabled options', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const props = (tools[0]?.['inputSchema'] as Record<string, unknown>)?.['properties'] as Record<string, unknown>;
    const country = props?.['country'] as Record<string, unknown>;
    expect(country?.['enum']).toEqual(['us', 'ca', 'mx', 'de', 'fr', 'other']);
  });

  test('optgroup options have group field in anyOf', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const props = (tools[0]?.['inputSchema'] as Record<string, unknown>)?.['properties'] as Record<string, unknown>;
    const anyOf = (props?.['country'] as Record<string, unknown>)?.['anyOf'] as Array<Record<string, unknown>>;
    const us = anyOf?.find((o) => o['const'] === 'us');
    const de = anyOf?.find((o) => o['const'] === 'de');
    expect(us?.['group']).toBe('North America');
    expect(de?.['group']).toBe('Europe');
  });

  test('direct select options have no group field', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const props = (tools[0]?.['inputSchema'] as Record<string, unknown>)?.['properties'] as Record<string, unknown>;
    const anyOf = (props?.['country'] as Record<string, unknown>)?.['anyOf'] as Array<Record<string, unknown>>;
    const other = anyOf?.find((o) => o['const'] === 'other');
    expect(other?.['group']).toBeUndefined();
  });

  test('disabled optgroup options are excluded', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const props = (tools[0]?.['inputSchema'] as Record<string, unknown>)?.['properties'] as Record<string, unknown>;
    const country = props?.['country'] as Record<string, unknown>;
    expect((country?.['enum'] as string[])?.includes('xx')).toBe(false);
  });

  test('individually disabled option is excluded', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const props = (tools[0]?.['inputSchema'] as Record<string, unknown>)?.['properties'] as Record<string, unknown>;
    const country = props?.['country'] as Record<string, unknown>;
    expect((country?.['enum'] as string[])?.includes('gb')).toBe(false);
  });
});

test.describe('Datalist suggestions', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(MOCK_WEBMCP);
    await page.goto('/tests/fixtures/datalist-form.html');
    await page.waitForFunction(
      () => ((window as unknown as Record<string, unknown>)['__registeredTools'] as unknown[]).length > 0,
      { timeout: 5000 },
    );
  });

  test('text input with datalist has enum from suggestions', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const props = (tools[0]?.['inputSchema'] as Record<string, unknown>)?.['properties'] as Record<string, unknown>;
    const topic = props?.['topic'] as Record<string, unknown>;
    expect(topic?.['type']).toBe('string');
    expect(topic?.['enum']).toEqual(['javascript', 'python', 'rust', 'typescript']);
  });

  test('text input with datalist has anyOf with titles', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const props = (tools[0]?.['inputSchema'] as Record<string, unknown>)?.['properties'] as Record<string, unknown>;
    const anyOf = (props?.['topic'] as Record<string, unknown>)?.['anyOf'] as Array<Record<string, unknown>>;
    expect(anyOf?.find((o) => o['const'] === 'javascript')?.['title']).toBe('JavaScript');
  });

  test('email input with datalist has format:email and enum', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const props = (tools[0]?.['inputSchema'] as Record<string, unknown>)?.['properties'] as Record<string, unknown>;
    const email = props?.['notify_email'] as Record<string, unknown>;
    expect(email?.['format']).toBe('email');
    expect(email?.['enum']).toEqual(['team@example.com', 'admin@example.com']);
  });

  test('plain text input without datalist has no enum', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const props = (tools[0]?.['inputSchema'] as Record<string, unknown>)?.['properties'] as Record<string, unknown>;
    const plain = props?.['plain_text'] as Record<string, unknown>;
    expect(plain?.['enum']).toBeUndefined();
  });
});

test.describe('Conditional/hidden fields', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(MOCK_WEBMCP);
    await page.goto('/tests/fixtures/conditional-form.html');
    await page.waitForFunction(
      () => ((window as unknown as Record<string, unknown>)['__registeredTools'] as unknown[]).length > 0,
      { timeout: 5000 },
    );
  });

  test('visible field is included in schema', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const props = (tools[0]?.['inputSchema'] as Record<string, unknown>)?.['properties'] as Record<string, unknown>;
    expect(Object.keys(props)).toContain('full_name');
  });

  test('display:none field is excluded from schema', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const props = (tools[0]?.['inputSchema'] as Record<string, unknown>)?.['properties'] as Record<string, unknown>;
    expect(Object.keys(props)).not.toContain('hidden_field');
  });

  test('visibility:hidden field is excluded from schema', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const props = (tools[0]?.['inputSchema'] as Record<string, unknown>)?.['properties'] as Record<string, unknown>;
    expect(Object.keys(props)).not.toContain('invisible_field');
  });

  test('field inside aria-hidden container is excluded', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const props = (tools[0]?.['inputSchema'] as Record<string, unknown>)?.['properties'] as Record<string, unknown>;
    expect(Object.keys(props)).not.toContain('aria_hidden_field');
  });

  test('field inside disabled fieldset is excluded', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const props = (tools[0]?.['inputSchema'] as Record<string, unknown>)?.['properties'] as Record<string, unknown>;
    expect(Object.keys(props)).not.toContain('disabled_fieldset_field');
  });

  test('native hidden input is excluded', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const props = (tools[0]?.['inputSchema'] as Record<string, unknown>)?.['properties'] as Record<string, unknown>;
    expect(Object.keys(props)).not.toContain('csrf_token');
  });
});

test.describe('Checkbox group schema', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(MOCK_WEBMCP);
    await page.goto('/tests/fixtures/checkbox-group.html');
    await page.waitForFunction(
      () => ((window as unknown as Record<string, unknown>)['__registeredTools'] as unknown[]).length > 0,
      { timeout: 5000 },
    );
  });

  test('multi-checkbox group produces array schema', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const props = (tools[0]?.['inputSchema'] as Record<string, unknown>)?.['properties'] as Record<string, unknown>;
    const interests = props?.['interests'] as Record<string, unknown>;
    expect(interests?.['type']).toBe('array');
    expect((interests?.['items'] as Record<string, unknown>)?.['enum']).toEqual(['sports', 'music', 'travel', 'tech']);
  });

  test('multi-checkbox group appears only once in schema', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const props = (tools[0]?.['inputSchema'] as Record<string, unknown>)?.['properties'] as Record<string, unknown>;
    expect(Object.keys(props).filter((k) => k === 'interests').length).toBe(1);
  });

  test('single checkbox stays as boolean', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const props = (tools[0]?.['inputSchema'] as Record<string, unknown>)?.['properties'] as Record<string, unknown>;
    const newsletter = props?.['newsletter'] as Record<string, unknown>;
    expect(newsletter?.['type']).toBe('boolean');
  });
});

test.describe('ARIA radiogroup', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(MOCK_WEBMCP);
    await page.goto('/tests/fixtures/aria-radiogroup.html');
    await page.waitForFunction(
      () => ((window as unknown as Record<string, unknown>)['__registeredTools'] as unknown[]).length > 0,
      { timeout: 5000 },
    );
  });

  test('ARIA radiogroup produces a single enum field', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const props = (tools[0]?.['inputSchema'] as Record<string, unknown>)?.['properties'] as Record<string, unknown>;
    const visibility = props?.['visibility'] as Record<string, unknown>;
    expect(visibility?.['type']).toBe('string');
    expect(visibility?.['enum']).toEqual(['public', 'private']);
  });

  test('ARIA radiogroup anyOf has correct titles', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const props = (tools[0]?.['inputSchema'] as Record<string, unknown>)?.['properties'] as Record<string, unknown>;
    const anyOf = (props?.['visibility'] as Record<string, unknown>)?.['anyOf'] as Array<Record<string, unknown>>;
    expect(anyOf?.find((o) => o['const'] === 'public')?.['title']).toBe('Public');
    expect(anyOf?.find((o) => o['const'] === 'private')?.['title']).toBe('Private');
  });

  test('individual radio elements do not appear as separate fields', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const props = (tools[0]?.['inputSchema'] as Record<string, unknown>)?.['properties'] as Record<string, unknown>;
    expect(Object.keys(props)).not.toContain('public');
    expect(Object.keys(props)).not.toContain('private');
  });
});

test.describe('Multi-select schema and fill', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(MOCK_WEBMCP_WITH_EXECUTE);
    await page.goto('/tests/fixtures/multi-select.html');
    await page.waitForFunction(
      () => ((window as unknown as Record<string, unknown>)['__registeredTools'] as unknown[]).length > 0,
      { timeout: 5000 },
    );
  });

  test('multi-select produces array schema with items.enum', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const props = (tools[0]?.['inputSchema'] as Record<string, unknown>)?.['properties'] as Record<string, unknown>;
    const categories = props?.['categories'] as Record<string, unknown>;
    expect(categories?.['type']).toBe('array');
    expect((categories?.['items'] as Record<string, unknown>)?.['enum']).toEqual([
      'news', 'sports', 'tech', 'health',
    ]);
  });

  test('multi-select array schema has no anyOf', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const props = (tools[0]?.['inputSchema'] as Record<string, unknown>)?.['properties'] as Record<string, unknown>;
    const categories = props?.['categories'] as Record<string, unknown>;
    expect(categories?.['anyOf']).toBeUndefined();
  });

  test('single-value select still produces string schema with enum', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const props = (tools[0]?.['inputSchema'] as Record<string, unknown>)?.['properties'] as Record<string, unknown>;
    const region = props?.['region'] as Record<string, unknown>;
    expect(region?.['type']).toBe('string');
    expect(region?.['enum']).toEqual(['us', 'eu', 'apac']);
  });

  test('agent fills multi-select with an array value', async ({ page }) => {
    await page.evaluate(() => {
      const handlers = (window as unknown as Record<string, unknown>)['__executeHandlers'] as Record<string, (p: Record<string, unknown>) => Promise<unknown>>;
      handlers['filter_results']?.({ categories: ['news', 'tech'] }).catch(() => {});
    });
    await page.waitForTimeout(100);
    const selected = await page.evaluate(() => {
      const sel = document.querySelector<HTMLSelectElement>('select[name="categories"]');
      return Array.from(sel?.options ?? []).filter((o) => o.selected).map((o) => o.value);
    });
    expect(selected).toEqual(['news', 'tech']);
  });

  test('agent fills multi-select with a single string value', async ({ page }) => {
    await page.evaluate(() => {
      const handlers = (window as unknown as Record<string, unknown>)['__executeHandlers'] as Record<string, (p: Record<string, unknown>) => Promise<unknown>>;
      handlers['filter_results']?.({ categories: 'sports' }).catch(() => {});
    });
    await page.waitForTimeout(100);
    const selected = await page.evaluate(() => {
      const sel = document.querySelector<HTMLSelectElement>('select[name="categories"]');
      return Array.from(sel?.options ?? []).filter((o) => o.selected).map((o) => o.value);
    });
    expect(selected).toEqual(['sports']);
  });
});

test.describe('Meaningful empty-value select options', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(MOCK_WEBMCP);
    await page.goto('/tests/fixtures/placeholder-select.html');
    await page.waitForFunction(
      () => ((window as unknown as Record<string, unknown>)['__registeredTools'] as unknown[]).length > 0,
      { timeout: 5000 },
    );
  });

  test('meaningful empty-value option is included in enum', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const props = (tools[0]?.['inputSchema'] as Record<string, unknown>)?.['properties'] as Record<string, unknown>;
    const diet = props?.['diet'] as Record<string, unknown>;
    expect(diet?.['enum']).toEqual(['', 'veg', 'vegan', 'halal']);
  });

  test('meaningful empty-value option has descriptive title in anyOf', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const props = (tools[0]?.['inputSchema'] as Record<string, unknown>)?.['properties'] as Record<string, unknown>;
    const anyOf = (props?.['diet'] as Record<string, unknown>)?.['anyOf'] as Array<Record<string, unknown>>;
    expect(anyOf?.find((o) => o['const'] === '')?.['title']).toBe('No preference');
  });

  test('placeholder option starting with dashes is excluded', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const props = (tools[0]?.['inputSchema'] as Record<string, unknown>)?.['properties'] as Record<string, unknown>;
    const size = props?.['size'] as Record<string, unknown>;
    expect((size?.['enum'] as string[])?.includes('')).toBe(false);
    expect(size?.['enum']).toEqual(['s', 'm', 'l']);
  });

  test('placeholder option starting with "Choose" word is excluded', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const props = (tools[0]?.['inputSchema'] as Record<string, unknown>)?.['properties'] as Record<string, unknown>;
    const region = props?.['region'] as Record<string, unknown>;
    expect((region?.['enum'] as string[])?.includes('')).toBe(false);
    expect(region?.['enum']).toEqual(['na', 'eu']);
  });
});

test.describe('Post-fill snapshot (framework remount protection)', () => {
  test('ExecuteResult preserves filled values when DOM is reset after fill', async ({ page }) => {
    await page.addInitScript(MOCK_WEBMCP_WITH_EXECUTE);
    await page.goto('/tests/fixtures/react-remount-form.html');

    await page.waitForFunction(
      () => ((window as unknown as Record<string, unknown>)['__registeredTools'] as unknown[]).length > 0,
      { timeout: 5000 },
    );

    // Start the execute handler (fills form, then waits for submit)
    const resultPromise = page.evaluate(async () => {
      const handlers = (window as unknown as Record<string, unknown>)['__executeHandlers'] as Record<string, (p: Record<string, unknown>) => Promise<unknown>>;
      return handlers['save_profile']?.({
        username: 'alice',
        bio: 'Software engineer',
      });
    });

    // Wait for the remount to complete (80ms) then submit
    await page.waitForFunction(
      () => (window as unknown as Record<string, unknown>)['__remountDone'] === true,
      { timeout: 2000 },
    );

    // Verify the form fields were blanked by the remount
    const valuesAfterRemount = await page.evaluate(() => ({
      username: (document.querySelector<HTMLInputElement>('#username'))?.value,
      bio: (document.querySelector<HTMLTextAreaElement>('#bio'))?.value,
    }));
    expect(valuesAfterRemount.username).toBe('');
    expect(valuesAfterRemount.bio).toBe('');

    // Now submit the form manually to trigger serialization
    await page.evaluate(() => {
      document.querySelector<HTMLFormElement>('form')?.requestSubmit();
    });

    const result = await resultPromise as Record<string, unknown>;
    const text = (result?.['content'] as Array<Record<string, unknown>>)?.[0]?.['text'] as string;

    // The snapshot should have preserved the filled values despite the DOM reset
    expect(text).toContain('"username":"alice"');
    expect(text).toContain('"bio":"Software engineer"');
  });
});

test.describe('Tool annotations', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(MOCK_WEBMCP);
    await page.goto('/tests/fixtures/annotations-form.html');
    await page.waitForFunction(
      () => ((window as unknown as Record<string, unknown>)['__registeredTools'] as unknown[]).length >= 5,
      { timeout: 5000 },
    );
  });

  test('GET form infers readOnlyHint and idempotentHint', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const search = (tools as Array<Record<string, unknown>>).find((t) => t['name'] === 'search_products');
    const annotations = search?.['annotations'] as Record<string, unknown>;
    expect(annotations?.['readOnlyHint']).toBe(true);
    expect(annotations?.['idempotentHint']).toBe(true);
  });

  test('Delete button text infers destructiveHint', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const del = (tools as Array<Record<string, unknown>>).find((t) => t['name'] === 'delete_account');
    const annotations = del?.['annotations'] as Record<string, unknown>;
    expect(annotations?.['destructiveHint']).toBe(true);
  });

  test('data-webmcp-readonly sets readOnlyHint on POST form', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const status = (tools as Array<Record<string, unknown>>).find((t) => t['name'] === 'get_status');
    const annotations = status?.['annotations'] as Record<string, unknown>;
    expect(annotations?.['readOnlyHint']).toBe(true);
  });

  test('data-webmcp-destructive sets destructiveHint on neutral form', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const reset = (tools as Array<Record<string, unknown>>).find((t) => t['name'] === 'reset_settings');
    const annotations = reset?.['annotations'] as Record<string, unknown>;
    expect(annotations?.['destructiveHint']).toBe(true);
  });

  test('plain POST form with no hints produces no annotations', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const profile = (tools as Array<Record<string, unknown>>).find((t) => t['name'] === 'update_profile');
    const annotations = profile?.['annotations'] as Record<string, unknown> | undefined;
    // Either no annotations key or empty object
    expect(!annotations || Object.keys(annotations).length === 0).toBe(true);
  });
});

test.describe('Default values in schema', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(MOCK_WEBMCP);
    await page.goto('/tests/fixtures/prefilled-form.html');
    await page.waitForFunction(
      () => ((window as unknown as Record<string, unknown>)['__registeredTools'] as unknown[]).length > 0,
      { timeout: 5000 },
    );
  });

  test('pre-filled text input exposes default string value', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const props = (tools[0]?.['inputSchema'] as Record<string, unknown>)?.['properties'] as Record<string, unknown>;
    expect((props?.['destination'] as Record<string, unknown>)?.['default']).toBe('Paris');
  });

  test('pre-selected option exposes default string value', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const props = (tools[0]?.['inputSchema'] as Record<string, unknown>)?.['properties'] as Record<string, unknown>;
    expect((props?.['cabin_class'] as Record<string, unknown>)?.['default']).toBe('economy');
  });

  test('number input with value exposes default as a number', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const props = (tools[0]?.['inputSchema'] as Record<string, unknown>)?.['properties'] as Record<string, unknown>;
    const passengersDefault = (props?.['passengers'] as Record<string, unknown>)?.['default'];
    expect(passengersDefault).toBe(2);
    expect(typeof passengersDefault).toBe('number');
  });

  test('pre-filled textarea exposes default string value', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const props = (tools[0]?.['inputSchema'] as Record<string, unknown>)?.['properties'] as Record<string, unknown>;
    expect((props?.['notes'] as Record<string, unknown>)?.['default']).toBe('Default notes');
  });

  test('empty input has no default key', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const props = (tools[0]?.['inputSchema'] as Record<string, unknown>)?.['properties'] as Record<string, unknown>;
    expect((props?.['promo_code'] as Record<string, unknown>)?.['default']).toBeUndefined();
  });
});

test.describe('Shadow DOM field discovery', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(MOCK_WEBMCP);
    await page.goto('/tests/fixtures/shadow-dom-form.html');
    await page.waitForFunction(
      () => ((window as unknown as Record<string, unknown>)['__registeredTools'] as unknown[]).length > 0,
      { timeout: 5000 },
    );
  });

  test('registers form containing shadow DOM custom element', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    expect(tools.length).toBeGreaterThanOrEqual(1);
  });

  test('includes light DOM field (name) in schema', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const props = (tools[0]?.['inputSchema'] as Record<string, unknown>)?.['properties'] as Record<string, unknown>;
    expect(props).toHaveProperty('name');
    expect((props['name'] as Record<string, unknown>)?.['type']).toBe('string');
  });

  test('discovers city input inside shadow root', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const props = (tools[0]?.['inputSchema'] as Record<string, unknown>)?.['properties'] as Record<string, unknown>;
    expect(props).toHaveProperty('city');
    expect((props['city'] as Record<string, unknown>)?.['type']).toBe('string');
  });

  test('discovers zip input inside shadow root', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const props = (tools[0]?.['inputSchema'] as Record<string, unknown>)?.['properties'] as Record<string, unknown>;
    expect(props).toHaveProperty('zip');
    expect((props['zip'] as Record<string, unknown>)?.['type']).toBe('string');
  });

  test('marks shadow DOM required fields as required', async ({ page }) => {
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const required = (tools[0]?.['inputSchema'] as Record<string, unknown>)?.['required'] as string[];
    expect(required).toContain('name');
    expect(required).toContain('city');
  });
});

test.describe('Structured ExecuteResult', () => {
  // These tests use native-attrs.html which has no toolautosubmit.
  // Pattern: start the execute handler (fills form, returns pending promise),
  // then programmatically submit the form, then await the result.

  test('execute returns content[0] human-readable text and content[1] structured JSON', async ({ page }) => {
    await page.addInitScript(MOCK_WEBMCP_WITH_EXECUTE);
    await initWithConfig(page, '/tests/fixtures/native-attrs.html', { declarativeMode: 'force' });
    await page.waitForFunction(
      () => ((window as unknown as Record<string, unknown>)['__registeredTools'] as unknown[]).length > 0,
      { timeout: 5000 },
    );

    const resultPromise = page.evaluate(async () => {
      const handlers = (window as unknown as Record<string, unknown>)['__executeHandlers'] as Record<string, (p: Record<string, unknown>) => Promise<unknown>>;
      return handlers['subscribe_newsletter']?.({ email: 'a@b.com', frequency: 'weekly' });
    });

    await page.waitForTimeout(200);
    await page.evaluate(() => {
      document.querySelector<HTMLFormElement>('form')?.requestSubmit();
    });

    const result = await resultPromise as { content: Array<{ type: string; text: string }> };
    expect(result?.content[0]?.type).toBe('text');
    expect(result?.content[0]?.text).toContain('Form submitted');
    const raw = result?.content[1]?.text;
    expect(raw).toBeDefined();
    const structured = JSON.parse(raw!);
    expect(structured).toHaveProperty('status');
    expect(structured).toHaveProperty('filled_fields');
    expect(structured).toHaveProperty('missing_required');
    expect(structured).toHaveProperty('warnings');
    expect(Array.isArray(structured.warnings)).toBe(true);
  });

  test('status is success when all required fields provided', async ({ page }) => {
    await page.addInitScript(MOCK_WEBMCP_WITH_EXECUTE);
    await initWithConfig(page, '/tests/fixtures/native-attrs.html', { declarativeMode: 'force' });
    await page.waitForFunction(
      () => ((window as unknown as Record<string, unknown>)['__registeredTools'] as unknown[]).length > 0,
      { timeout: 5000 },
    );

    const resultPromise = page.evaluate(async () => {
      const handlers = (window as unknown as Record<string, unknown>)['__executeHandlers'] as Record<string, (p: Record<string, unknown>) => Promise<unknown>>;
      return handlers['subscribe_newsletter']?.({ email: 'a@b.com', frequency: 'weekly' });
    });

    await page.waitForTimeout(200);
    await page.evaluate(() => {
      document.querySelector<HTMLFormElement>('form')?.requestSubmit();
    });

    const result = await resultPromise as { content: Array<{ type: string; text: string }> };
    const structured = JSON.parse(result.content[1]!.text);
    expect(structured.status).toBe('success');
    expect(structured.missing_required).toHaveLength(0);
  });

  test('status is partial when required field missing', async ({ page }) => {
    await page.addInitScript(MOCK_WEBMCP_WITH_EXECUTE);
    await initWithConfig(page, '/tests/fixtures/native-attrs.html', { declarativeMode: 'force' });
    await page.waitForFunction(
      () => ((window as unknown as Record<string, unknown>)['__registeredTools'] as unknown[]).length > 0,
      { timeout: 5000 },
    );

    const resultPromise = page.evaluate(async () => {
      const handlers = (window as unknown as Record<string, unknown>)['__executeHandlers'] as Record<string, (p: Record<string, unknown>) => Promise<unknown>>;
      // email is required but not provided
      return handlers['subscribe_newsletter']?.({ frequency: 'weekly' });
    });

    await page.waitForTimeout(200);
    // Bypass HTML5 validation so the submit event fires even with missing required fields
    await page.evaluate(() => {
      const f = document.querySelector<HTMLFormElement>('form');
      if (f) { f.noValidate = true; f.requestSubmit(); }
    });

    const result = await resultPromise as { content: Array<{ type: string; text: string }> };
    const structured = JSON.parse(result.content[1]!.text);
    expect(structured.status).toBe('partial');
    expect(structured.missing_required).toContain('email');
    expect(structured.warnings.some((w: { type: string }) => w.type === 'missing_required')).toBe(true);
  });
});

test.describe('Declarative mode behavior', () => {
  test('default mode skips imperative registration for forms with toolname', async ({ page }) => {
    await page.addInitScript(MOCK_WEBMCP);
    await page.goto('/tests/fixtures/native-attrs.html');
    await page.waitForTimeout(300);
    const tools = await getRegisteredTools(page);
    expect(tools).toHaveLength(0);
  });

  test('force mode registers imperative tool for native declarative forms', async ({ page }) => {
    await page.addInitScript(MOCK_WEBMCP);
    await initWithConfig(page, '/tests/fixtures/native-attrs.html', { declarativeMode: 'force' });
    await page.waitForFunction(
      () => ((window as unknown as Record<string, unknown>)['__registeredTools'] as unknown[]).length > 0,
      { timeout: 5000 },
    );
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    expect(tools[0]?.['name']).toBe('subscribe_newsletter');
  });
});

test.describe('Semantic alias parameter binding', () => {
  test('resolves alias keys and reports alias_resolved warning', async ({ page }) => {
    await page.addInitScript(MOCK_WEBMCP_WITH_EXECUTE);
    await page.goto('/tests/fixtures/alias-binding.html');
    await page.waitForFunction(
      () => ((window as unknown as Record<string, unknown>)['__registeredTools'] as unknown[]).length > 0,
      { timeout: 5000 },
    );

    const resultPromise = page.evaluate(async () => {
      const handlers = (window as unknown as Record<string, unknown>)['__executeHandlers'] as Record<string, (p: Record<string, unknown>) => Promise<unknown>>;
      return handlers['create']?.({ repository_name: 'my_mcp_test', visibility: 'private' });
    });

    await page.waitForTimeout(200);
    await page.evaluate(() => {
      document.querySelector<HTMLFormElement>('form')?.requestSubmit();
    });

    const result = await resultPromise as { content: Array<{ text: string }> };
    const structured = JSON.parse(result.content[1]!.text);
    expect(structured.filled_fields.repo).toBe('my_mcp_test');
    expect(
      structured.warnings.some((w: { type: string; field: string }) =>
        w.type === 'alias_resolved' && w.field === 'repo'),
    ).toBe(true);
  });
});

test.describe('Execution state machine', () => {
  test('returns awaiting_user_action when manual submit times out', async ({ page }) => {
    await page.addInitScript(MOCK_WEBMCP_WITH_EXECUTE);
    await initWithConfig(page, '/tests/fixtures/search.html', {
      execution: { timeoutMs: 250 },
    });
    await page.waitForFunction(
      () => ((window as unknown as Record<string, unknown>)['__registeredTools'] as unknown[]).length > 0,
      { timeout: 5000 },
    );

    const result = await page.evaluate(async () => {
      const handlers = (window as unknown as Record<string, unknown>)['__executeHandlers'] as Record<string, (p: Record<string, unknown>) => Promise<unknown>>;
      return handlers['search_flights']?.({ origin: 'LON', destination: 'NYC', depart_date: '2026-06-10' });
    }) as { content: Array<{ text: string }> };

    const structured = JSON.parse(result.content[1]!.text);
    expect(structured.status).toBe('awaiting_user_action');
    expect(structured.warnings.some((w: { type: string }) => w.type === 'timeout')).toBe(true);
  });

  test('returns blocked_invalid when auto-submit is prevented by native validation', async ({ page }) => {
    await page.addInitScript(MOCK_WEBMCP_WITH_EXECUTE);
    await initWithConfig(page, '/tests/fixtures/native-attrs.html', {
      declarativeMode: 'force',
      autoSubmit: true,
      execution: { timeoutMs: 1000 },
    });
    await page.waitForFunction(
      () => ((window as unknown as Record<string, unknown>)['__registeredTools'] as unknown[]).length > 0,
      { timeout: 5000 },
    );

    const result = await page.evaluate(async () => {
      const handlers = (window as unknown as Record<string, unknown>)['__executeHandlers'] as Record<string, (p: Record<string, unknown>) => Promise<unknown>>;
      return handlers['subscribe_newsletter']?.({ frequency: 'weekly' });
    }) as { content: Array<{ text: string }> };

    const structured = JSON.parse(result.content[1]!.text);
    expect(structured.status).toBe('blocked_invalid');
    expect(structured.warnings.some((w: { type: string }) => w.type === 'blocked_submit')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Current WebMCP spec: document.modelContext, AbortSignal unregistration
// ---------------------------------------------------------------------------

// Mirrors the spec's registerTool() checks. No unregisterTool: aborting the signal unregisters.
const MOCK_SPEC_WEBMCP = `
  window.__registeredTools = [];
  window.__executeHandlers = {};
  window.__registerErrors = [];
  const ctx = {
    registerTool(tool, options = {}) {
      const invalid = !/^[A-Za-z0-9_.-]{1,128}$/.test(tool.name) || !tool.description ||
        window.__registeredTools.some(t => t.name === tool.name);
      if (invalid) {
        window.__registerErrors.push(tool.name);
        return Promise.reject(new DOMException('invalid tool', 'InvalidStateError'));
      }
      window.__registeredTools.push(JSON.parse(JSON.stringify(tool)));
      window.__executeHandlers[tool.name] = tool.execute;
      options.signal?.addEventListener('abort', () => {
        window.__registeredTools = window.__registeredTools.filter(t => t.name !== tool.name);
        delete window.__executeHandlers[tool.name];
      });
      return Promise.resolve();
    },
  };
  Object.defineProperty(document, 'modelContext', { value: ctx, configurable: true });
`;

test.describe('Spec document.modelContext', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(MOCK_SPEC_WEBMCP);
  });

  test('registers tools on document.modelContext when navigator has none', async ({ page }) => {
    await initWithConfig(page, '/tests/fixtures/multi-form.html', {});
    const tools = await getRegisteredTools(page);
    expect(tools.length).toBeGreaterThanOrEqual(2);
    const errors = await page.evaluate(() => (window as unknown as Record<string, unknown>)['__registerErrors']);
    expect(errors).toEqual([]);
  });

  test('prefers document.modelContext over navigator.modelContext', async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as Record<string, unknown>)['__legacyCalls'] = 0;
      (navigator as unknown as Record<string, unknown>)['modelContext'] = {
        registerTool() {
          ((window as unknown as Record<string, number>)['__legacyCalls'])++;
          return Promise.resolve();
        },
      };
    });
    await initWithConfig(page, '/tests/fixtures/search.html', {});
    const tools = await getRegisteredTools(page);
    expect(tools).toHaveLength(1);
    const legacyCalls = await page.evaluate(() => (window as unknown as Record<string, number>)['__legacyCalls']);
    expect(legacyCalls).toBe(0);
  });

  test('destroy() unregisters by aborting the registration signal', async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as Record<string, unknown>)['__AUTO_WEBMCP_NO_AUTOINIT'] = true;
    });
    await page.goto('/tests/fixtures/multi-form.html');
    const remaining = await page.evaluate(async () => {
      const mod = await import('/dist/auto-webmcp.esm.js');
      const handle = await mod.autoWebMCP();
      await handle.destroy();
      return ((window as unknown as Record<string, unknown>)['__registeredTools'] as unknown[]).length;
    });
    expect(remaining).toBe(0);
  });

  test('tool names are spec-valid and within the 30 character budget', async ({ page }) => {
    await initWithConfig(page, '/tests/fixtures/checkout.html', {
      overrides: { '#checkout-form': { name: 'complete_your_order_with_shipping_and_billing' } },
    });
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    for (const tool of tools) {
      const name = tool['name'] as string;
      expect(name).toMatch(/^[A-Za-z0-9_.-]{1,128}$/);
    }
    // Inferred names are capped at 30 characters on a word boundary
    const long = await page.evaluate(() => {
      document.body.insertAdjacentHTML('beforeend',
        '<form id="long"><input name="q"><button type="submit">Search every product in the entire catalogue now</button></form>');
    });
    void long;
    await page.waitForFunction(
      () => ((window as unknown as Record<string, unknown>)['__registeredTools'] as unknown[]).length >= 2,
      { timeout: 5000 },
    );
    const all = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const inferred = all.find((t) => (t['name'] as string).startsWith('search_every'));
    expect(inferred?.['name']).toBe('search_every_product_in_the');
  });

  test('select anyOf entries carry type string (Chrome declarative shape)', async ({ page }) => {
    await initWithConfig(page, '/tests/fixtures/native-attrs.html', { declarativeMode: 'force' });
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const props = (tools[0]?.['inputSchema'] as Record<string, Record<string, Record<string, unknown>>>)['properties'];
    const anyOf = props['frequency']?.['anyOf'] as Array<Record<string, string>>;
    expect(anyOf.every((o) => o['type'] === 'string')).toBe(true);
    expect(props['frequency']?.['oneOf']).toBeUndefined();
  });

  test('tool title is inferred from the nearest heading', async ({ page }) => {
    await initWithConfig(page, '/tests/fixtures/checkout.html', {});
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    expect(tools[0]?.['title']).toBe('Complete Your Order');
  });

  test('no outputSchema is sent (not part of the spec)', async ({ page }) => {
    await initWithConfig(page, '/tests/fixtures/search.html', {});
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    expect(tools[0]?.['outputSchema']).toBeUndefined();
  });

  test('execute honours an already-aborted signal', async ({ page }) => {
    await initWithConfig(page, '/tests/fixtures/contact.html', {});
    const result = await page.evaluate(async () => {
      const handlers = (window as unknown as Record<string, Record<string, (p: unknown, o: unknown) => Promise<unknown>>>)['__executeHandlers'];
      const name = Object.keys(handlers)[0]!;
      const controller = new AbortController();
      controller.abort();
      return handlers[name]!({}, { signal: controller.signal });
    }) as { content: Array<{ text: string }> };
    expect(JSON.parse(result.content[1]!.text).status).toBe('cancelled');
  });

  test('aborting an in-flight execute resolves as cancelled and fires toolcancel', async ({ page }) => {
    await initWithConfig(page, '/tests/fixtures/contact.html', {});
    const outcome = await page.evaluate(async () => {
      let cancelEvents = 0;
      window.addEventListener('toolcancel', () => cancelEvents++);
      const handlers = (window as unknown as Record<string, Record<string, (p: unknown, o: unknown) => Promise<unknown>>>)['__executeHandlers'];
      const name = Object.keys(handlers)[0]!;
      const controller = new AbortController();
      const pending = handlers[name]!({ name: 'Ada' }, { signal: controller.signal });
      setTimeout(() => controller.abort(), 50);
      const result = await pending as { content: Array<{ text: string }> };
      return { status: JSON.parse(result.content[1]!.text).status, cancelEvents };
    });
    expect(outcome.status).toBe('cancelled');
    expect(outcome.cancelEvents).toBe(1);
  });
});

test.describe('consequentialHint', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(MOCK_WEBMCP);
  });

  test('checkout form ("Place Order") is consequential', async ({ page }) => {
    await initWithConfig(page, '/tests/fixtures/checkout.html', {});
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const annotations = tools[0]?.['annotations'] as Record<string, unknown>;
    expect(annotations?.['consequentialHint']).toBe(true);
  });

  test('destructive form is consequential, read-only and neutral forms are not', async ({ page }) => {
    await page.goto('/tests/fixtures/annotations-form.html');
    await page.waitForFunction(
      () => ((window as unknown as Record<string, unknown>)['__registeredTools'] as unknown[]).length >= 5,
      { timeout: 5000 },
    );
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const hint = (name: string) =>
      ((tools.find((t) => t['name'] === name)?.['annotations'] ?? {}) as Record<string, unknown>)['consequentialHint'];
    expect(hint('delete_account')).toBe(true);
    expect(hint('search_products')).toBeUndefined();
    expect(hint('update_profile')).toBeUndefined();
  });

  test('card fields (autocomplete cc-*) make a form consequential', async ({ page }) => {
    await page.goto('/tests/fixtures/contact.html');
    await page.evaluate(() => {
      document.body.insertAdjacentHTML('beforeend',
        '<form id="card"><input name="card" autocomplete="cc-number"><button type="submit">Save</button></form>');
    });
    await page.waitForFunction(
      () => ((window as unknown as Record<string, unknown>)['__registeredTools'] as Array<Record<string, unknown>>)
        .some((t) => t['name'] === 'save'),
      { timeout: 5000 },
    );
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const card = tools.find((t) => t['name'] === 'save');
    expect((card?.['annotations'] as Record<string, unknown>)?.['consequentialHint']).toBe(true);
  });

  test('data-webmcp-consequential="false" overrides inference', async ({ page }) => {
    await page.goto('/tests/fixtures/checkout.html');
    await page.evaluate(() => {
      document.body.insertAdjacentHTML('beforeend',
        '<form id="b" data-webmcp-consequential="false"><input name="q"><button type="submit">Book</button></form>');
    });
    await page.waitForFunction(
      () => ((window as unknown as Record<string, unknown>)['__registeredTools'] as Array<Record<string, unknown>>)
        .some((t) => t['name'] === 'book'),
      { timeout: 5000 },
    );
    const tools = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const book = tools.find((t) => t['name'] === 'book');
    expect(((book?.['annotations'] ?? {}) as Record<string, unknown>)['consequentialHint']).toBe(false);
  });
});


// ---------------------------------------------------------------------------
// Sensitive fields and country packs
// ---------------------------------------------------------------------------

type Tool = Record<string, unknown> & { inputSchema: { properties: Record<string, Record<string, unknown>> } };

async function initSensitive(page: import('@playwright/test').Page, packs: string[], extra: Record<string, unknown> = {}) {
  await page.addInitScript(MOCK_WEBMCP_WITH_EXECUTE);
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>)['__AUTO_WEBMCP_NO_AUTOINIT'] = true;
  });
  await page.goto('/tests/fixtures/sensitive-form.html');
  await page.evaluate(async ({ packs, extra }) => {
    const mod = await import('/dist/auto-webmcp.esm.js');
    const loaded = [];
    for (const id of packs) {
      const packMod = await import(`/dist/packs/${id}.esm.js`);
      loaded.push(Object.values(packMod).find((v) => v && typeof v === 'object' && 'rules' in (v as object)));
    }
    await mod.autoWebMCP({ packs: loaded, ...extra });
  }, { packs, extra });
  const tools = await getRegisteredTools(page) as Tool[];
  return {
    kyc: tools.find((t) => (t['name'] as string).startsWith('save_details'))!,
    payout: tools.find((t) => (t['name'] as string).startsWith('add_payout'))!,
  };
}

async function runTool(page: import('@playwright/test').Page, name: string, params: Record<string, unknown>) {
  const result = await page.evaluate(async ({ name, params }) => {
    const handlers = (window as unknown as Record<string, Record<string, (p: unknown) => Promise<unknown>>>)['__executeHandlers'];
    return handlers[name]!(params);
  }, { name, params }) as { content: Array<{ text: string }> };
  return { text: result.content[0]!.text, structured: JSON.parse(result.content[1]!.text) };
}

test.describe('Core sensitive-field rules (no packs)', () => {
  test('blocks Aadhaar, OTP and password; keeps ordinary fields', async ({ page }) => {
    const { kyc } = await initSensitive(page, []);
    const keys = Object.keys(kyc.inputSchema.properties);
    expect(keys).toContain('full_name');
    expect(keys).not.toContain('aadhaar');
    expect(keys).not.toContain('code');
    expect(keys).not.toContain('password');
    expect(keys).not.toContain('csrf_token');
  });

  test('tool is consequential and names the fields the user must enter', async ({ page }) => {
    const { kyc } = await initSensitive(page, []);
    expect((kyc['annotations'] as Record<string, unknown>)['consequentialHint']).toBe(true);
    expect(kyc['description']).toBe('Merchant KYC: KYC and Payout Details. The user must enter: Aadhaar Number, Enter OTP.');
  });

  test('SSN is blocked without the US pack', async ({ page }) => {
    const { payout } = await initSensitive(page, []);
    expect(Object.keys(payout.inputSchema.properties)).not.toContain('ssn');
  });

  test('data-webmcp-sensitive="allow" exposes a field core would block', async ({ page }) => {
    const { kyc } = await initSensitive(page, []);
    expect(Object.keys(kyc.inputSchema.properties)).toContain('referral_bsn');
  });

  test('results never include hidden, password or blocked values', async ({ page }) => {
    const { kyc } = await initSensitive(page, [], { execution: { timeoutMs: 300 } });
    const { structured } = await runTool(page, kyc['name'] as string, { full_name: 'Asha Rao' });
    const serialized = JSON.stringify(structured);
    expect(serialized).not.toContain('secret-csrf-123');
    expect(serialized).not.toContain('hunter2');
    expect(serialized).not.toContain('234567890123');
    expect(structured.requires_user).toEqual(['Aadhaar Number', 'Enter OTP']);
  });

  test('data-webmcp-sensitive="redact" masks the value in results', async ({ page }) => {
    const { kyc } = await initSensitive(page, [], { execution: { timeoutMs: 300 } });
    const { structured } = await runTool(page, kyc['name'] as string, { full_name: 'Asha Rao' });
    expect(structured.existing_values.loyalty_number).toBe('XXX-XXXX7766');
  });
});

test.describe('India pack', () => {
  test('adds formats for GSTIN, IFSC, PIN code and mobile', async ({ page }) => {
    const { kyc } = await initSensitive(page, ['in']);
    const props = kyc.inputSchema.properties;
    expect(props['gstin']?.['pattern']).toBeDefined();
    expect(props['ifsc']?.['pattern']).toBe('^[A-Za-z]{4}0[A-Za-z0-9]{6}$');
    expect(props['pincode']?.['pattern']).toBe('^[1-9]\\d{5}$');
    expect(props['mobile']?.['description']).toContain('Indian mobile');
  });

  test('"PIN Code" is a postal code, not a blocked secret PIN', async ({ page }) => {
    const { kyc } = await initSensitive(page, ['in']);
    expect(Object.keys(kyc.inputSchema.properties)).toContain('pincode');
  });

  test('PAN and UPI ID are exposed but masked in results', async ({ page }) => {
    const { kyc } = await initSensitive(page, ['in'], { execution: { timeoutMs: 300 } });
    expect(Object.keys(kyc.inputSchema.properties)).toContain('pan');
    const { structured, text } = await runTool(page, kyc['name'] as string, { pan: 'ABCDE1234F', upi_id: 'asha@okbank' });
    expect(structured.filled_fields.pan).toBe('XXXXXX234F');
    expect(structured.filled_fields.upi_id).not.toContain('asha');
    expect(text).not.toContain('ABCDE1234F');
  });

  test('invalid GSTIN checksum produces an invalid_format warning', async ({ page }) => {
    const { kyc } = await initSensitive(page, ['in'], { execution: { timeoutMs: 300 } });
    const bad = await runTool(page, kyc['name'] as string, { gstin: '27AAPFU0939F1ZX' });
    expect(bad.structured.warnings.some((w: { type: string; field: string }) => w.type === 'invalid_format' && w.field === 'gstin')).toBe(true);
    const good = await runTool(page, kyc['name'] as string, { gstin: '27AAPFU0939F1ZV' });
    expect(good.structured.warnings.some((w: { type: string }) => w.type === 'invalid_format')).toBe(false);
  });

  test('pack queued on window.__AUTO_WEBMCP_PACKS is picked up', async ({ page }) => {
    await page.addInitScript(MOCK_WEBMCP);
    await page.addInitScript(() => {
      (window as unknown as Record<string, unknown>)['__AUTO_WEBMCP_NO_AUTOINIT'] = true;
    });
    await page.goto('/tests/fixtures/sensitive-form.html');
    await page.evaluate(async () => {
      const packMod = await import('/dist/packs/in.esm.js');
      (window as unknown as Record<string, unknown>)['__AUTO_WEBMCP_PACKS'] = [packMod.india];
      const mod = await import('/dist/auto-webmcp.esm.js');
      await mod.autoWebMCP();
    });
    const tools = await getRegisteredTools(page) as Tool[];
    const kyc = tools.find((t) => (t['name'] as string).startsWith('save_details'))!;
    expect(kyc.inputSchema.properties['ifsc']?.['pattern']).toBeDefined();
  });
});

test.describe('US pack', () => {
  test('adds ZIP and routing formats; routing checksum is validated', async ({ page }) => {
    const { payout } = await initSensitive(page, ['us'], { execution: { timeoutMs: 300 } });
    const props = payout.inputSchema.properties;
    expect(props['zip']?.['pattern']).toBe('^\\d{5}(-\\d{4})?$');
    expect(props['routing_number']?.['pattern']).toBe('^\\d{9}$');
    const bad = await runTool(page, payout['name'] as string, { routing_number: '021000022' });
    expect(bad.structured.warnings.some((w: { type: string }) => w.type === 'invalid_format')).toBe(true);
    const good = await runTool(page, payout['name'] as string, { routing_number: '021000021' });
    expect(good.structured.warnings.some((w: { type: string }) => w.type === 'invalid_format')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Razorpay adapter
// ---------------------------------------------------------------------------

// Stub of Razorpay Checkout. window.__rzpBehaviour picks how the modal "resolves".
const MOCK_RAZORPAY = `
  window.__rzpOpened = [];
  window.__rzpBehaviour = 'pay';
  window.Razorpay = function (opts) {
    const handlers = {};
    return {
      on(evt, cb) { handlers[evt] = cb; },
      close() { window.__rzpClosed = true; },
      open() {
        window.__rzpOpened.push({ key: opts.key, subscription_id: opts.subscription_id, order_id: opts.order_id, name: opts.name });
        setTimeout(() => {
          const b = window.__rzpBehaviour;
          if (b === 'pay') opts.handler({ razorpay_payment_id: 'pay_test_123', razorpay_subscription_id: opts.subscription_id });
          else if (b === 'dismiss') opts.modal.ondismiss();
          else if (b === 'fail') { handlers['payment.failed']({ error: { description: 'Card declined.' } }); setTimeout(() => opts.modal.ondismiss(), 20); }
          else if (b === 'fail-then-pay') { handlers['payment.failed']({ error: { description: 'Card declined' } }); setTimeout(() => opts.handler({ razorpay_payment_id: 'pay_retry_456' }), 20); }
        }, 20);
      },
    };
  };
`;

async function initRazorpay(page: import('@playwright/test').Page, extra = '') {
  await page.addInitScript(MOCK_WEBMCP_WITH_EXECUTE);
  await page.addInitScript(MOCK_RAZORPAY);
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>)['__AUTO_WEBMCP_NO_AUTOINIT'] = true;
  });
  await page.goto('/tests/fixtures/razorpay.html');
  return page.evaluate(async (extraSrc) => {
    const { razorpay } = await import('/dist/adapters/razorpay.esm.js');
    const w = window as unknown as Record<string, unknown>;
    w['__cancelled'] = 0;
    const handle = await razorpay({
      merchant: 'Arbr',
      plans: async () => [{ id: 'inr-monthly', name: 'Paid', amount: 10000, currency: 'INR', period: 'monthly' }],
      createSubscription: async (planId: string) => ({ keyId: 'rzp_test_x', subscriptionId: `sub_for_${planId}` }),
      subscriptionStatus: async () => ({ plan: 'free' }),
      cancelSubscription: async () => { w['__cancelled'] = (w['__cancelled'] as number) + 1; },
      checkoutTimeoutMs: 2000,
    });
    if (extraSrc) new Function(extraSrc)();
    return handle.tools;
  }, extra);
}

async function callTool(page: import('@playwright/test').Page, name: string, params: Record<string, unknown> = {}, abortAfterMs?: number) {
  const r = await page.evaluate(async ({ name, params, abortAfterMs }) => {
    const handlers = (window as unknown as Record<string, Record<string, (p: unknown, o?: unknown) => Promise<unknown>>>)['__executeHandlers'];
    const controller = new AbortController();
    if (abortAfterMs !== undefined) setTimeout(() => controller.abort(), abortAfterMs);
    return handlers[name]!(params, { signal: controller.signal });
  }, { name, params, abortAfterMs }) as { content: Array<{ text: string }> };
  return { text: r.content[0]!.text, data: JSON.parse(r.content[1]!.text) };
}

test.describe('Razorpay adapter', () => {
  test('registers only tools whose hooks are supplied, with spec annotations', async ({ page }) => {
    const tools = await initRazorpay(page);
    expect(tools.sort()).toEqual(['cancel_subscription', 'get_plans', 'get_subscription_status', 'start_subscription']);
    const registered = await getRegisteredTools(page) as Array<Record<string, unknown>>;
    const ann = (n: string) => registered.find((t) => t['name'] === n)?.['annotations'] as Record<string, unknown>;
    expect(ann('get_plans')['readOnlyHint']).toBe(true);
    expect(ann('start_subscription')['consequentialHint']).toBe(true);
    expect(ann('cancel_subscription')['consequentialHint']).toBe(true);
  });

  test('get_plans returns merchant plans', async ({ page }) => {
    await initRazorpay(page);
    const { data } = await callTool(page, 'get_plans');
    expect(data.plans[0].id).toBe('inr-monthly');
  });

  test('start_subscription opens Checkout with the server session and reports submission', async ({ page }) => {
    await initRazorpay(page);
    const { data, text } = await callTool(page, 'start_subscription', { plan_id: 'inr-monthly' });
    expect(data.status).toBe('submitted');
    expect(data.payment_id).toBe('pay_test_123');
    expect(text).toContain('get_subscription_status');
    const opened = await page.evaluate(() => (window as unknown as Record<string, unknown>)['__rzpOpened']);
    expect(opened).toEqual([{ key: 'rzp_test_x', subscription_id: 'sub_for_inr-monthly', name: 'Arbr' }]);
  });

  test('dismissed and failed checkouts are reported, not treated as paid', async ({ page }) => {
    await initRazorpay(page);
    await page.evaluate(() => { (window as unknown as Record<string, unknown>)['__rzpBehaviour'] = 'dismiss'; });
    expect((await callTool(page, 'start_subscription', { plan_id: 'inr-monthly' })).data.status).toBe('dismissed');
    await page.evaluate(() => { (window as unknown as Record<string, unknown>)['__rzpBehaviour'] = 'fail'; });
    const failed = await callTool(page, 'start_subscription', { plan_id: 'inr-monthly' });
    expect(failed.data.status).toBe('failed');
    expect(failed.data.reason).toBe('Card declined');
    expect(failed.text).not.toContain('..');
  });

  test('a failed attempt followed by a successful retry reports the payment', async ({ page }) => {
    await initRazorpay(page);
    await page.evaluate(() => { (window as unknown as Record<string, unknown>)['__rzpBehaviour'] = 'fail-then-pay'; });
    const { data } = await callTool(page, 'start_subscription', { plan_id: 'inr-monthly' });
    expect(data.status).toBe('submitted');
    expect(data.payment_id).toBe('pay_retry_456');
  });

  test('an open checkout times out to awaiting_user_action; abort closes it', async ({ page }) => {
    await initRazorpay(page);
    await page.evaluate(() => { (window as unknown as Record<string, unknown>)['__rzpBehaviour'] = 'hang'; });
    expect((await callTool(page, 'start_subscription', { plan_id: 'inr-monthly' })).data.status).toBe('awaiting_user_action');
    const aborted = await callTool(page, 'start_subscription', { plan_id: 'inr-monthly' }, 50);
    expect(aborted.data.status).toBe('cancelled');
    expect(await page.evaluate(() => (window as unknown as Record<string, unknown>)['__rzpClosed'])).toBe(true);
  });

  test('start_subscription without plan_id asks for one', async ({ page }) => {
    await initRazorpay(page);
    const { data } = await callTool(page, 'start_subscription', {});
    expect(data.status).toBe('error');
  });

  test('cancel_subscription asks the user and respects a decline', async ({ page }) => {
    await initRazorpay(page);
    page.once('dialog', (d) => d.dismiss());
    const declined = await callTool(page, 'cancel_subscription');
    expect(declined.data.status).toBe('declined');
    expect(await page.evaluate(() => (window as unknown as Record<string, unknown>)['__cancelled'])).toBe(0);
    page.once('dialog', (d) => d.accept());
    const accepted = await callTool(page, 'cancel_subscription');
    expect(accepted.data.status).toBe('cancel_requested');
  });
});
