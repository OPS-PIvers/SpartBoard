// Messages between a SpartBoard page and the Chrome extension (docs/plans/CHROME_EXTENSION.md D3, D6).
// Pure data and validators: imported by both the page and `extension/`, so no DOM or chrome APIs here.

/** Bumped additively when a message type is added; the page checks it before using a feature. */
export const EXTENSION_PROTOCOL_VERSION = 1;

/** Staff Google accounts; `@students.orono.k12.mn.us` does not match. */
export const STAFF_EMAIL_DOMAIN = 'orono.k12.mn.us';

/** Which Chrome profile the extension runs under; `none` is a browser with no signed-in profile. */
export type ExtensionProfile = 'staff' | 'other' | 'none';

export interface PingMessage {
  type: 'ping';
}

export type ExtensionMessage = PingMessage;
export type ExtensionMessageType = ExtensionMessage['type'];

export interface PingReply {
  ok: true;
  protocol: number;
  version: string;
  profile: ExtensionProfile;
}

export type ExtensionErrorCode = 'unsupported' | 'invalid' | 'refused';

export interface ExtensionErrorReply {
  ok: false;
  error: ExtensionErrorCode;
}

export type ExtensionReply = PingReply | ExtensionErrorReply;

interface MessageSpec {
  /** Refused unless the Chrome profile is a staff account (D3). */
  staffOnly: boolean;
  /** Exact keys besides `type`, each with its validator. */
  fields: Record<string, (value: unknown) => boolean>;
}

const MESSAGE_SPECS: Record<ExtensionMessageType, MessageSpec> = {
  ping: { staffOnly: false, fields: {} },
};

export type ParsedMessage =
  | { kind: 'ok'; message: ExtensionMessage; staffOnly: boolean }
  | { kind: 'unsupported' }
  | { kind: 'invalid' };

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype ||
    Object.getPrototypeOf(value) === null);

const hasSpec = (type: string): type is ExtensionMessageType =>
  Object.prototype.hasOwnProperty.call(MESSAGE_SPECS, type);

/** Checks a message against its schema: known type, exact keys, valid fields. */
export function parseExtensionMessage(raw: unknown): ParsedMessage {
  if (!isPlainObject(raw) || typeof raw.type !== 'string') {
    return { kind: 'invalid' };
  }
  if (!hasSpec(raw.type)) return { kind: 'unsupported' };
  const spec = MESSAGE_SPECS[raw.type];
  const keys = Object.keys(raw).filter((key) => key !== 'type');
  if (keys.length !== Object.keys(spec.fields).length) {
    return { kind: 'invalid' };
  }
  for (const key of keys) {
    const check = Object.prototype.hasOwnProperty.call(spec.fields, key)
      ? spec.fields[key]
      : undefined;
    if (!check?.(raw[key])) return { kind: 'invalid' };
  }
  // Every key was checked against the spec for this type above.
  return {
    kind: 'ok',
    message: raw as unknown as ExtensionMessage,
    staffOnly: spec.staffOnly,
  };
}

/** The only URLs the extension will open: absolute `https:` with no credentials (D3). */
export function isOpenableUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (
    url.protocol === 'https:' &&
    url.username === '' &&
    url.password === '' &&
    url.hostname !== ''
  );
}

/** Classifies a Chrome profile email; empty means no signed-in profile. */
export function profileFromEmail(email: string | undefined): ExtensionProfile {
  const trimmed = (email ?? '').trim().toLowerCase();
  if (trimmed === '') return 'none';
  const at = trimmed.lastIndexOf('@');
  return at > 0 && trimmed.slice(at + 1) === STAFF_EMAIL_DOMAIN
    ? 'staff'
    : 'other';
}
