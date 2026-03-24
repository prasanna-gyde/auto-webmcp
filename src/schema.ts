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
  oneOf?: Array<{ const: string; title: string; group?: string }>;
  items?: { type: string; enum?: string[] };
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

  // Expose <datalist> suggestions as enum/oneOf so agents know the preferred values.
  // The field stays type:string because datalist is advisory, not restrictive.
  const listId = input.getAttribute('list');
  if (listId) {
    const datalist = input.ownerDocument.getElementById(listId);
    if (datalist instanceof HTMLDataListElement) {
      const options = Array.from(datalist.options).filter(
        (o) => !o.disabled && o.value.trim() !== '',
      );
      if (options.length > 0) {
        prop.enum = options.map((o) => o.value.trim());
        prop.oneOf = options.map((o) => ({
          const: o.value.trim(),
          title: o.textContent?.trim() || o.value.trim(),
        }));
      }
    }
  }

  return prop;
}

function mapSelectElement(select: HTMLSelectElement): JsonSchemaProperty {
  const enumValues: string[] = [];
  const oneOf: Array<{ const: string; title: string; group?: string }> = [];

  for (const child of Array.from(select.children)) {
    if (child instanceof HTMLOptGroupElement) {
      if (child.disabled) continue;
      const groupLabel = child.label?.trim() ?? '';
      for (const opt of Array.from(child.children)) {
        if (!(opt instanceof HTMLOptionElement)) continue;
        if (opt.disabled || opt.value === '') continue;
        enumValues.push(opt.value);
        const entry: { const: string; title: string; group?: string } = {
          const: opt.value,
          title: opt.text.trim() || opt.value,
        };
        if (groupLabel) entry.group = groupLabel;
        oneOf.push(entry);
      }
    } else if (child instanceof HTMLOptionElement) {
      if (child.disabled || child.value === '') continue;
      enumValues.push(child.value);
      oneOf.push({ const: child.value, title: child.text.trim() || child.value });
    }
  }

  if (enumValues.length === 0) return { type: 'string' };
  return { type: 'string', enum: enumValues, oneOf };
}

/** Collect all checkbox values for a given name within a form (for checkbox groups) */
export function collectCheckboxEnum(form: HTMLFormElement, name: string): string[] {
  return Array.from(
    form.querySelectorAll<HTMLInputElement>(`input[type="checkbox"][name="${CSS.escape(name)}"]`),
  )
    .map((cb) => cb.value)
    .filter((v) => v !== '' && v !== 'on'); // 'on' is the browser default when no value attr is set
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
