/**
 * schema.ts — HTML input type → JSON Schema type mapping
 */

export const ARIA_ROLES_TO_SCAN = [
  'textbox', 'combobox', 'checkbox', 'radio', 'switch',
  'spinbutton', 'searchbox', 'slider',
] as const;

export type AriaRole = typeof ARIA_ROLES_TO_SCAN[number];

export interface JsonSchemaProperty {
  type: string;
  format?: string;
  description?: string;
  title?: string;
  enum?: string[];
  oneOf?: Array<{ const: string; title: string }>;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
}

export interface JsonSchema {
  type: 'object';
  properties: Record<string, JsonSchemaProperty>;
  required: string[];
}

/** Maps an HTML <input type> to a JSON Schema property base */
export function inputTypeToSchema(
  input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
): JsonSchemaProperty | null {
  if (input instanceof HTMLInputElement) {
    return mapInputElement(input);
  }
  if (input instanceof HTMLTextAreaElement) {
    return { type: 'string' };
  }
  if (input instanceof HTMLSelectElement) {
    return mapSelectElement(input);
  }
  return null;
}

function mapInputElement(input: HTMLInputElement): JsonSchemaProperty | null {
  const type = input.type.toLowerCase();

  switch (type) {
    case 'text':
    case 'search':
    case 'tel':
      return buildStringSchema(input);

    case 'email':
      return { ...buildStringSchema(input), format: 'email' };

    case 'url':
      return { ...buildStringSchema(input), format: 'uri' };

    case 'number':
    case 'range': {
      const prop: JsonSchemaProperty = { type: 'number' };
      if (input.min !== '') prop.minimum = parseFloat(input.min);
      if (input.max !== '') prop.maximum = parseFloat(input.max);
      return prop;
    }

    case 'date':
      return { type: 'string', format: 'date' };

    case 'datetime-local':
      return { type: 'string', format: 'date-time' };

    case 'time':
      return { type: 'string', format: 'time' };

    case 'month':
      return { type: 'string', pattern: '^\\d{4}-\\d{2}$' };

    case 'week':
      return { type: 'string', pattern: '^\\d{4}-W\\d{2}$' };

    case 'color':
      return { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' };

    case 'checkbox':
      return { type: 'boolean' };

    case 'radio':
      // Radio groups are handled at the form level in analyzer.ts
      return { type: 'string' };

    case 'file':
    case 'hidden':
    case 'submit':
    case 'reset':
    case 'button':
    case 'image':
      // These are not exposed to agents
      return null;

    case 'password':
      // Skip passwords — never expose to agents
      return null;

    default:
      return { type: 'string' };
  }
}

function buildStringSchema(input: HTMLInputElement): JsonSchemaProperty {
  const prop: JsonSchemaProperty = { type: 'string' };
  if (input.minLength > 0) prop.minLength = input.minLength;
  if (input.maxLength > 0 && input.maxLength !== 524288) prop.maxLength = input.maxLength;
  if (input.pattern) prop.pattern = input.pattern;
  return prop;
}

function mapSelectElement(select: HTMLSelectElement): JsonSchemaProperty {
  const filtered = Array.from(select.options).filter((o) => o.value !== '');

  if (filtered.length === 0) {
    return { type: 'string' };
  }

  const enumValues = filtered.map((o) => o.value);
  const oneOf = filtered.map((o) => ({ const: o.value, title: o.text.trim() || o.value }));

  return { type: 'string', enum: enumValues, oneOf };
}

/** Collect all radio button values for a given name within a form */
export function collectRadioEnum(form: HTMLFormElement, name: string): string[] {
  const radios = Array.from(
    form.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${CSS.escape(name)}"]`),
  );
  return radios.map((r) => r.value).filter((v) => v !== '');
}

/** Collect radio button values + label titles as oneOf entries */
export function collectRadioOneOf(
  form: HTMLFormElement,
  name: string,
): Array<{ const: string; title: string }> {
  const radios = Array.from(
    form.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${CSS.escape(name)}"]`),
  ).filter((r) => r.value !== '');

  return radios.map((r) => {
    const title = getRadioLabelText(r);
    return { const: r.value, title: title || r.value };
  });
}

/** Maps an ARIA role element to a JSON Schema property */
export function ariaRoleToSchema(el: Element, role: AriaRole): JsonSchemaProperty {
  switch (role) {
    case 'checkbox':
    case 'switch':
      return { type: 'boolean' };

    case 'spinbutton':
    case 'slider': {
      const prop: JsonSchemaProperty = { type: 'number' };
      const min = el.getAttribute('aria-valuemin');
      const max = el.getAttribute('aria-valuemax');
      if (min !== null) prop.minimum = parseFloat(min);
      if (max !== null) prop.maximum = parseFloat(max);
      return prop;
    }

    case 'combobox': {
      const ownedId = el.getAttribute('aria-owns') ?? el.getAttribute('aria-controls');
      if (ownedId) {
        const listbox = document.getElementById(ownedId);
        if (listbox) {
          const options = Array.from(listbox.querySelectorAll('[role="option"]')).filter(
            (o) => o.getAttribute('aria-disabled') !== 'true',
          );
          if (options.length > 0) {
            const enumValues = options
              .map((o) => (o.getAttribute('data-value') ?? o.textContent ?? '').trim())
              .filter(Boolean);
            const oneOf = options.map((o) => ({
              const: (o.getAttribute('data-value') ?? o.textContent ?? '').trim(),
              title: (o.textContent ?? '').trim(),
            }));
            return { type: 'string', enum: enumValues, oneOf };
          }
        }
      }
      return { type: 'string' };
    }

    case 'textbox':
    case 'searchbox':
    case 'radio':
    default:
      return { type: 'string' };
  }
}

function getRadioLabelText(radio: HTMLInputElement): string {
  // 1. Wrapping label
  const parent = radio.closest('label');
  if (parent) {
    const clone = parent.cloneNode(true) as HTMLLabelElement;
    clone.querySelectorAll('input, select, textarea, button').forEach((el) => el.remove());
    const text = clone.textContent?.trim() ?? '';
    if (text) return text;
  }
  // 2. Label pointing to radio by id
  if (radio.id) {
    const label = document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(radio.id)}"]`);
    if (label) {
      const text = label.textContent?.trim() ?? '';
      if (text) return text;
    }
  }
  return '';
}
