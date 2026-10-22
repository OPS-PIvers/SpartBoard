// Messages between a SpartBoard page and the Chrome extension (docs/plans/CHROME_EXTENSION.md D3, D6).
// Pure data and validators: imported by both the page and `extension/`, so no DOM or chrome APIs here.

import {
  WEB_TOUR_ATTR_KEYS,
  type WebTourAction,
  type WebTourFrame,
  type WebTourLocator,
  type WebTourStableAttrs,
} from '@/types';

/** Bumped additively when a message type is added; the page checks it before using a feature. */
export const EXTENSION_PROTOCOL_VERSION = 4;

/** Protocol 4: locators may carry `heading`, `pageTitle` and `attrs`, and steps report `score` matches. */
export const SCORED_MATCH_PROTOCOL = 4;

/** Staff Google accounts; `@students.orono.k12.mn.us` does not match. */
export const STAFF_EMAIL_DOMAIN = 'orono.k12.mn.us';

/** Which Chrome profile the extension runs under; `none` is a browser with no signed-in profile. */
export type ExtensionProfile = 'staff' | 'other' | 'none';

export interface PingMessage {
  type: 'ping';
}

/** A step picture as bytes, since the extension can't read Storage (T9). */
export interface WebTourPictureBytes {
  mime: 'image/png' | 'image/jpeg' | 'image/webp';
  /** Base64 without a `data:` prefix. */
  data: string;
  w: number;
  h: number;
}

export interface WebTourStartStep {
  id: string;
  label?: string;
  text?: string;
  web: { urlPattern: string; action: WebTourAction; locator: WebTourLocator };
  picture?: WebTourPictureBytes;
}

export interface WebTourStartTour {
  setId: string;
  /** The snapshot's publishedAt. */
  version: number;
  title: string;
  steps: WebTourStartStep[];
}

/** Protocol 2, staff only: open `startUrl` in a new tab and play the tour from `stepIndex`. */
export interface WebTourStartMessage {
  type: 'web-tour/start';
  startUrl: string;
  stepIndex: number;
  tour: WebTourStartTour;
}

export interface WebTourStartReply {
  ok: true;
  tabId: number;
}

/** Name of the port a page opens to follow a tour's progress (protocol 2). */
export const WEB_TOUR_PORT = 'web-tour';

/** Page to extension on the `web-tour` port. */
export interface WebTourWatchMessage {
  type: 'web-tour/watch';
  setId: string;
}

/** Extension to page on the `web-tour` port: `role` found clearly (or by role and name, before protocol 4), `text`/`css` found only by that clue (before protocol 4), `score` a weak scored match, `none` the picture fallback. */
export type WebTourProgressMessage =
  | {
      type: 'web-tour/step';
      setId: string;
      stepIndex: number;
      stepId: string;
      match: 'role' | 'text' | 'css' | 'score' | 'none';
    }
  | { type: 'web-tour/done'; setId: string }
  | { type: 'web-tour/exit'; setId: string; stepIndex: number }
  | { type: 'web-tour/closed'; setId: string; stepIndex: number };

export type ExtensionMessage = PingMessage | WebTourStartMessage;
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

export type ExtensionReply =
  PingReply | WebTourStartReply | ExtensionErrorReply;

interface MessageSpec {
  /** Refused unless the Chrome profile is a staff account (D3). */
  staffOnly: boolean;
  /** Exact keys besides `type`, each with its validator. */
  fields: Record<string, (value: unknown) => boolean>;
}

const MESSAGE_SPECS: Record<ExtensionMessageType, MessageSpec> = {
  ping: { staffOnly: false, fields: {} },
  'web-tour/start': {
    staffOnly: true,
    fields: {
      startUrl: (v) => isOpenableUrl(v),
      stepIndex: (v) => Number.isInteger(v) && (v as number) >= 0,
      tour: (v) => parseWebTourStartTour(v) !== null,
    },
  },
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

const MAX_STEPS = 200;
const MAX_TEXT = 4000;
const MAX_CLUE = 500;
/** The 5 MB upload cap (WEB_TOUR_PICTURE_MAX_BYTES) as base64, so any stored picture fits. */
export const MAX_PICTURE_CHARS = Math.ceil((5 * 1024 * 1024) / 3) * 4;
/** Pictures past this many base64 characters in one tour are dropped (the extension's 10 MB session store). */
export const MAX_PICTURE_TOTAL_CHARS = 8 * 1024 * 1024;
const PICTURE_MIMES: readonly WebTourPictureBytes['mime'][] = [
  'image/png',
  'image/jpeg',
  'image/webp',
];
const WEB_ACTIONS: readonly WebTourAction[] = [
  'observe',
  'click',
  'type',
  'select',
];

type Obj = Record<string, unknown>;
const str = (v: unknown, max: number): v is string =>
  typeof v === 'string' && v.length <= max;
const optStr = (v: unknown, max: number) => v === undefined || str(v, max);
const onlyKeys = (o: Obj, keys: readonly string[]) =>
  Object.keys(o).every((k) => keys.includes(k));
const unit = (v: unknown) =>
  typeof v === 'number' && Number.isFinite(v) && v >= -1 && v <= 2;
const isPattern = (v: unknown): v is string =>
  str(v, 2048) && v.startsWith('https://');

function parseFrames(v: unknown): WebTourFrame[] | null {
  if (!Array.isArray(v) || v.length > 10) return null;
  const out: WebTourFrame[] = [];
  for (const f of v) {
    if (!isPlainObject(f) || !onlyKeys(f, ['urlPattern', 'index'])) return null;
    if (!isPattern(f.urlPattern) || !Number.isInteger(f.index)) return null;
    out.push({ urlPattern: f.urlPattern, index: f.index as number });
  }
  return out;
}

function parseLocator(v: unknown): WebTourLocator | null {
  const keys = [
    'role',
    'name',
    'text',
    'css',
    'frames',
    'box',
    'heading',
    'pageTitle',
    'attrs',
  ];
  if (!isPlainObject(v) || !onlyKeys(v, keys)) return null;
  const out: WebTourLocator = {};
  for (const key of [
    'role',
    'name',
    'text',
    'css',
    'heading',
    'pageTitle',
  ] as const) {
    if (!optStr(v[key], MAX_CLUE)) return null;
    if (v[key]) out[key] = v[key];
  }
  if (v.attrs !== undefined) {
    const a = v.attrs;
    if (!isPlainObject(a) || !onlyKeys(a, WEB_TOUR_ATTR_KEYS)) return null;
    const attrs: WebTourStableAttrs = {};
    for (const key of WEB_TOUR_ATTR_KEYS) {
      if (!optStr(a[key], MAX_CLUE)) return null;
      const value = a[key];
      if (typeof value === 'string' && value) attrs[key] = value;
    }
    out.attrs = attrs;
  }
  if (v.frames !== undefined) {
    const frames = parseFrames(v.frames);
    if (!frames) return null;
    out.frames = frames;
  }
  if (v.box !== undefined) {
    const b = v.box;
    if (!isPlainObject(b) || !onlyKeys(b, ['x', 'y', 'w', 'h'])) return null;
    if (!unit(b.x) || !unit(b.y) || !unit(b.w) || !unit(b.h)) return null;
    out.box = {
      x: b.x as number,
      y: b.y as number,
      w: b.w as number,
      h: b.h as number,
    };
  }
  return out;
}

function parsePicture(v: unknown): WebTourPictureBytes | null {
  if (!isPlainObject(v) || !onlyKeys(v, ['mime', 'data', 'w', 'h'])) {
    return null;
  }
  const mime = PICTURE_MIMES.find((m) => m === v.mime);
  if (!mime || !str(v.data, MAX_PICTURE_CHARS)) return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(v.data)) return null;
  const { w, h } = v;
  if (typeof w !== 'number' || typeof h !== 'number' || !(w > 0 && h > 0)) {
    return null;
  }
  return { mime, data: v.data, w, h };
}

/** The tour in a `web-tour/start` message, checked field by field; null if anything is off. */
export function parseWebTourStartTour(raw: unknown): WebTourStartTour | null {
  if (
    !isPlainObject(raw) ||
    !onlyKeys(raw, ['setId', 'version', 'title', 'steps'])
  ) {
    return null;
  }
  const { setId, version, title, steps } = raw;
  if (!str(setId, 200) || !setId || !str(title, 500)) return null;
  if (typeof version !== 'number' || !Number.isFinite(version)) return null;
  if (!Array.isArray(steps) || steps.length === 0 || steps.length > MAX_STEPS) {
    return null;
  }
  const ids = new Set<string>();
  const out: WebTourStartStep[] = [];
  for (const s of steps) {
    if (
      !isPlainObject(s) ||
      !onlyKeys(s, ['id', 'label', 'text', 'web', 'picture'])
    ) {
      return null;
    }
    if (!str(s.id, 200) || !s.id || ids.has(s.id)) return null;
    if (!optStr(s.label, MAX_TEXT) || !optStr(s.text, MAX_TEXT)) return null;
    const web = s.web;
    if (
      !isPlainObject(web) ||
      !onlyKeys(web, ['urlPattern', 'action', 'locator'])
    ) {
      return null;
    }
    const action = WEB_ACTIONS.find((a) => a === web.action);
    const locator = parseLocator(web.locator);
    if (!isPattern(web.urlPattern) || !action || !locator) return null;
    const step: WebTourStartStep = {
      id: s.id,
      web: { urlPattern: web.urlPattern, action, locator },
    };
    if (s.label !== undefined) step.label = s.label;
    if (s.text !== undefined) step.text = s.text;
    if (s.picture !== undefined) {
      const picture = parsePicture(s.picture);
      if (!picture) return null;
      step.picture = picture;
    }
    ids.add(s.id);
    out.push(step);
  }
  return { setId, version, title, steps: out };
}

/** A message a page sends on the `web-tour` port, or null. */
export function parseWebTourPortMessage(
  raw: unknown
): WebTourWatchMessage | null {
  if (!isPlainObject(raw) || !onlyKeys(raw, ['type', 'setId'])) return null;
  if (raw.type !== 'web-tour/watch' || !str(raw.setId, 200) || !raw.setId) {
    return null;
  }
  return { type: 'web-tour/watch', setId: raw.setId };
}
