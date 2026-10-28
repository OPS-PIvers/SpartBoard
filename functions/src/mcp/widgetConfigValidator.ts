// Checks Claude's widget settings against the schemas generated from types.ts (AI_BOARDS D14).
import { randomUUID } from 'node:crypto';
import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv';
import { WIDGET_CONFIG_SCHEMAS } from './widgetConfigSchemas.gen';

type Schema = Record<string, unknown>;

const MAX_ERRORS = 10;
const MAX_LISTED = 25;
const MAX_SETTINGS_BYTES = 256 * 1024;
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

// verbose gives each error its parentSchema, which the messages read; the size cap bounds its cost.
const ajv = new Ajv({ allErrors: true, strict: false, verbose: true });
const compiled = new Map<string, ValidateFunction>();

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const hasWidgetSchema = (type: string): boolean =>
  Object.hasOwn(WIDGET_CONFIG_SCHEMAS.widgets, type);

/** The widget's schema with no top-level required keys, since Claude sends only what it changes. */
export function partialWidgetSchema(type: string): Schema | null {
  if (!hasWidgetSchema(type)) return null;
  const schema = { ...WIDGET_CONFIG_SCHEMAS.widgets[type] };
  delete schema.required;
  return schema;
}

function validatorFor(type: string): ValidateFunction | null {
  const cached = compiled.get(type);
  if (cached) return cached;
  const schema = partialWidgetSchema(type);
  if (!schema) return null;
  const fn = ajv.compile({
    ...schema,
    definitions: WIDGET_CONFIG_SCHEMAS.definitions,
  });
  compiled.set(type, fn);
  return fn;
}

function resolveRef(schema: unknown): Schema | null {
  if (!isObject(schema)) return null;
  const ref = schema.$ref;
  if (typeof ref !== 'string') return schema;
  const name = decodeURIComponent(ref.replace(/^#\/definitions\//, ''));
  return resolveRef(WIDGET_CONFIG_SCHEMAS.definitions[name]);
}

const allowsType = (schema: Schema, type: string): boolean =>
  schema.type === type ||
  (Array.isArray(schema.type) && schema.type.includes(type));

/** True when every `const` property of a union branch (its discriminator) matches the value. */
function matchesConsts(
  branch: Schema,
  value: Record<string, unknown>
): boolean {
  const props = isObject(branch.properties) ? branch.properties : {};
  return Object.entries(props).every(([key, prop]) => {
    const p = resolveRef(prop);
    return !p || !('const' in p) || value[key] === p.const;
  });
}

/** Gives every object that needs a string `id` and lacks one a fresh UUID, so Claude never invents ids. */
function fillIds(value: unknown, schemaIn: unknown): unknown {
  const schema = resolveRef(schemaIn);
  if (!schema) return value;
  const branches = schema.anyOf ?? schema.oneOf;
  if (Array.isArray(branches)) {
    const kind = Array.isArray(value)
      ? 'array'
      : isObject(value)
        ? 'object'
        : null;
    const fits = kind
      ? branches
          .map(resolveRef)
          .filter((b): b is Schema => !!b && allowsType(b, kind))
          .filter((b) => !isObject(value) || matchesConsts(b, value))
      : [];
    // Only an unambiguous branch is safe to fill from; a mixed union keeps Claude's value as sent.
    return fits.length === 1 ? fillIds(value, fits[0]) : value;
  }
  if (Array.isArray(value)) {
    const items = schema.items;
    return value.map((item) => fillIds(item, items));
  }
  if (!isObject(value) || !allowsType(schema, 'object')) return value;
  const props = isObject(schema.properties) ? schema.properties : {};
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value))
    out[key] = Object.hasOwn(props, key) ? fillIds(child, props[key]) : child;
  const required = Array.isArray(schema.required) ? schema.required : [];
  const idSchema = resolveRef(props.id);
  if (
    required.includes('id') &&
    idSchema &&
    allowsType(idSchema, 'string') &&
    out.id === undefined
  )
    out.id = randomUUID();
  return out;
}

const article = (word: string) => (/^[aeiou]/.test(word) ? 'an' : 'a');

function pathOf(type: string, instancePath: string): string {
  return instancePath
    .split('/')
    .slice(1)
    .reduce(
      (path, part) =>
        /^\d+$/.test(part)
          ? `${path}[${part}]`
          : `${path}.${part.replace(/~1/g, '/').replace(/~0/g, '~')}`,
      type
    );
}

function list(values: readonly unknown[]): string {
  const shown = values.slice(0, MAX_LISTED).map((v) => JSON.stringify(v));
  const more = values.length - shown.length;
  return more > 0 ? `${shown.join(', ')} and ${more} more` : shown.join(', ');
}

function shapeOf(branch: unknown): string {
  const schema = resolveRef(branch);
  if (!schema) return 'another value';
  if ('const' in schema) return JSON.stringify(schema.const);
  if (Array.isArray(schema.enum)) return list(schema.enum);
  if (Array.isArray(schema.type)) return schema.type.join(' or ');
  if (typeof schema.type === 'string') {
    if (schema.type !== 'object' || !isObject(schema.properties))
      return schema.type;
    return `an object with ${list(Object.keys(schema.properties))}`;
  }
  return 'another value';
}

function describe(type: string, error: ErrorObject): string {
  const where = `\`${pathOf(type, error.instancePath)}\``;
  const parent = isObject(error.parentSchema) ? error.parentSchema : {};
  const params = error.params as Record<string, unknown>;
  switch (error.keyword) {
    case 'type': {
      const t = Array.isArray(params.type)
        ? params.type.join(' or ')
        : String(params.type);
      const hint =
        typeof parent.description === 'string'
          ? ` (${parent.description.slice(0, 120)})`
          : '';
      return `${where} must be ${article(t)} ${t}${hint}`;
    }
    case 'enum':
      return `${where} must be one of ${list((params.allowedValues as unknown[]) ?? [])}`;
    case 'const':
      return `${where} must be ${JSON.stringify(params.allowedValue)}`;
    case 'additionalProperties': {
      const known = isObject(parent.properties)
        ? Object.keys(parent.properties)
        : [];
      const name = String(params.additionalProperty);
      return known.length
        ? `${where} has no setting "${name}"; its settings are ${list(known)}`
        : `${where} takes no settings, so "${name}" is not allowed`;
    }
    case 'required':
      return `${where} needs "${String(params.missingProperty)}"`;
    case 'anyOf':
    case 'oneOf': {
      const branches = Array.isArray(parent[error.keyword])
        ? (parent[error.keyword] as unknown[])
        : [];
      return `${where} must be one of: ${branches.map(shapeOf).join('; ')}`;
    }
    default:
      return `${where} ${error.message ?? 'is not valid'}`;
  }
}

/** Drops the per-branch noise under a failed union, keeping the union's own summary. */
function summarise(errors: readonly ErrorObject[]): ErrorObject[] {
  const unions = errors
    .filter((e) => e.keyword === 'anyOf' || e.keyword === 'oneOf')
    .map((e) => e.schemaPath);
  return errors.filter(
    (e) =>
      !unions.some(
        (path) => e.schemaPath !== path && e.schemaPath.startsWith(`${path}/`)
      )
  );
}

function unsafeKey(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const hit = unsafeKey(item);
      if (hit) return hit;
    }
    return null;
  }
  if (!isObject(value)) return null;
  for (const [key, child] of Object.entries(value)) {
    if (UNSAFE_KEYS.has(key)) return key;
    const hit = unsafeKey(child);
    if (hit) return hit;
  }
  return null;
}

export type WidgetSettingsCheck =
  | { ok: true; settings: Record<string, unknown> }
  | { ok: false; errors: string[] };

/** Validates Claude's settings for one widget type and fills missing item ids. */
export function checkWidgetSettings(
  type: string,
  settings: unknown
): WidgetSettingsCheck {
  const validate = validatorFor(type);
  if (!validate) return { ok: false, errors: [`"${type}" is not a widget`] };
  if (settings === undefined) return { ok: true, settings: {} };
  if (!isObject(settings))
    return {
      ok: false,
      errors: [`\`${type}\` settings must be an object of setting names`],
    };
  const text = JSON.stringify(settings);
  if (text.length > MAX_SETTINGS_BYTES)
    return {
      ok: false,
      errors: [`\`${type}\` settings are too large; keep them under 256 KB`],
    };
  const unsafe = unsafeKey(settings);
  if (unsafe)
    return {
      ok: false,
      errors: [`"${unsafe}" is not an allowed setting name`],
    };
  const filled = fillIds(settings, partialWidgetSchema(type)) as Record<
    string,
    unknown
  >;
  if (validate(filled)) return { ok: true, settings: filled };
  const messages = [
    ...new Set(summarise(validate.errors ?? []).map((e) => describe(type, e))),
  ];
  const extra = messages.length - MAX_ERRORS;
  return {
    ok: false,
    errors:
      extra > 0
        ? [...messages.slice(0, MAX_ERRORS), `and ${extra} more problems`]
        : messages,
  };
}
