/**
 * schema.ts — HTML input type → JSON Schema type mapping
 */

export interface JsonSchemaProperty {
  type: string;
  format?: string;
  description?: string;
  title?: string;
  enum?: string[];
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
  const options = Array.from(select.options)
    .filter((o) => o.value !== '')
    .map((o) => o.value);

  if (options.length === 0) {
    return { type: 'string' };
  }

  return {
    type: 'string',
    enum: options,
  };
}

/** Collect all radio button values for a given name within a form */
export function collectRadioEnum(form: HTMLFormElement, name: string): string[] {
  const radios = Array.from(
    form.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${CSS.escape(name)}"]`),
  );
  return radios.map((r) => r.value).filter((v) => v !== '');
}
