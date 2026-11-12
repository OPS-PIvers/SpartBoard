// Messages between a SpartBoard page and the Chrome extension (docs/plans/CHROME_EXTENSION.md D3, D6).
// Pure data and validators: imported by both the page and `extension/`, so no DOM or chrome APIs here.

import {
  WEB_TOUR_ATTR_KEYS,
  type WebTourAction,
  type WebTourFrame,
  type WebTourLocator,
  type WebTourCheckResult,
  type WebTourCondition,
  type WebTourStableAttrs,
  type TourMarkupShape,
} from '@/types';

/** Bumped additively when a message type is added; the page checks it before using a feature. */
export const EXTENSION_PROTOCOL_VERSION = 13;

/** Protocol 4: locators may carry `heading`, `pageTitle` and `attrs`, and steps report `score` matches. */
export const SCORED_MATCH_PROTOCOL = 4;

/** Protocol 5: recorded steps may carry a note for Claude, and a new intake draft a goal. */
export const CLAUDE_NOTES_PROTOCOL = 5;

/** Protocol 6: `web-tour/check` plays a draft in check mode and reports `web-tour/check-*` on the port (C12). */
export const CHECK_PROTOCOL = 6;

/** Protocol 7: `web-tour/suggest` carries a better candidate's clues for a step that missed or played weak (C14). */
export const SUGGEST_PROTOCOL = 7;

/** Protocol 8: `web-tour/open` sends only a set id; the extension loads the tour, waits through sign-in and records the run (WEB_TOURS_HELP_PANEL.md H4). */
export const OPEN_PROTOCOL = 8;

/** Protocol 9: student profiles pull focus sessions (CHROME_EXTENSION.md F3); `focusStatusV1` and `focusReportV1` carry it, and pages see no new messages. */
export const FOCUS_PROTOCOL = 9;

/** Protocol 10: the extension enforces Redirect and Lock (F2) and parks tabs (F10); a lower protocol only monitors. */
export const FOCUS_ENFORCE_PROTOCOL = 10;

/** Protocol 11: `schoology/signed-in` and `schoology/connect` let a page get the extension signed in, so its Schoology button can check the flag. */
export const SCHOOLOGY_CONNECT_PROTOCOL = 11;

/** Protocol 12: a tour may carry step conditions (`conditions`, TOURS_10X.md E6); older extensions get none and play every step. */
export const CONDITIONS_PROTOCOL = 12;

/** Protocol 12 too: a tour may carry the markup drawn on its step pictures (`markup`), shown with Show me where; older extensions get none. */
export const MARKUP_PROTOCOL = 12;

/** Protocol 12 too: playback keeps pace (TOURS_10X.md P1-P5). Nothing the page sends changes, so no page gates on it. */
export const PACING_PROTOCOL = 12;

/** Protocol 13: the ping reply says how the extension was installed, so a quiz page can tell a school-managed profile. */
export const INSTALL_PROTOCOL = 13;

/** Protocol 14: a tour may carry Message steps and cross sites; below it such a tour is not sent (WEB_TOURS_CROSS_SITE.md X13). */
export const CROSS_SITE_PROTOCOL = 14;

/** How Chrome got the extension: pushed by an admin policy, added by the user, or loaded unpacked. */
export type ExtensionInstall = 'policy' | 'user' | 'dev';

/** The district Google domain; students share it, so the server checks a staff member doc too. */
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

/** A step's conditions (E6): when it plays and when it is done. */
export interface WebStepConditions {
  showWhen?: WebTourCondition;
  doneWhen?: WebTourCondition;
}

export interface WebTourStartTour {
  setId: string;
  /** The snapshot's publishedAt. */
  version: number;
  title: string;
  steps: WebTourStartStep[];
  /** By step id; sent only to an extension at CONDITIONS_PROTOCOL or later. */
  conditions?: Record<string, WebStepConditions>;
  /** Picture markup by step id; sent only to an extension at MARKUP_PROTOCOL or later. */
  markup?: Record<string, TourMarkupShape[]>;
  /** Where each step's control sits in its picture, 0-1, by step id; sent with markup, for Show me where's ring. */
  targets?: Record<string, PictureTarget>;
}

/** A control's place in its step picture, as 0-1 of the picture. */
export interface PictureTarget {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Protocol 2, staff only: open `startUrl` in a new tab and play the tour from `stepIndex`. */
export interface WebTourStartMessage {
  type: 'web-tour/start';
  startUrl: string;
  stepIndex: number;
  tour: WebTourStartTour;
}

/** Protocol 6, staff only: the same tour played in check mode, reported only as check results. */
export interface WebTourCheckStartMessage {
  type: 'web-tour/check';
  startUrl: string;
  stepIndex: number;
  tour: WebTourStartTour;
  /** A nonce the page picks; every result of this run echoes it. */
  runId: string;
}

/** Protocol 8, staff only: the extension loads the published tour itself and opens it. */
export interface WebTourOpenMessage {
  type: 'web-tour/open';
  setId: string;
}

/** Protocol 11, staff only: whether the extension holds a Google sign-in; `connect` asks Google for one. */
export interface SchoologySignInMessage {
  type: 'schoology/signed-in' | 'schoology/connect';
}

export interface SchoologySignInReply {
  ok: true;
  signedIn: boolean;
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
  /** The protocol the page reads; sent only to an extension at protocol 4 or later, which rejects nothing else. */
  protocol?: number;
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

/** Extension to page on the `web-tour` port during a check run (protocol 6); `done` false means it stopped early. */
export type WebTourCheckProgress =
  | {
      type: 'web-tour/check-step';
      setId: string;
      runId: string;
      stepIndex: number;
      stepId: string;
      result: WebTourCheckResult;
    }
  | {
      type: 'web-tour/check-end';
      setId: string;
      runId: string;
      stepIndex: number;
      done: boolean;
    };

/** Extension to page on the `web-tour` port (protocol 7): scrubbed clues of the best candidate for a missed or weak step; `runId` marks a check run. */
export interface WebTourSuggestPost {
  type: 'web-tour/suggest';
  setId: string;
  stepIndex: number;
  stepId: string;
  locator: WebTourLocator;
  runId?: string;
}

export type WebTourPortPost =
  WebTourProgressMessage | WebTourCheckProgress | WebTourSuggestPost;

export type ExtensionMessage =
  | PingMessage
  | WebTourStartMessage
  | WebTourCheckStartMessage
  | WebTourOpenMessage
  | SchoologySignInMessage;
export type ExtensionMessageType = ExtensionMessage['type'];

export interface PingReply {
  ok: true;
  protocol: number;
  version: string;
  profile: ExtensionProfile;
  /** Protocol 13; absent when Chrome wouldn't say. */
  install?: ExtensionInstall;
}

/** `unavailable`: the extension couldn't load the tour for `web-tour/open`, so the page falls back to handing it over. */
export type ExtensionErrorCode =
  'unsupported' | 'invalid' | 'refused' | 'unavailable';

export interface ExtensionErrorReply {
  ok: false;
  error: ExtensionErrorCode;
}

export type ExtensionReply =
  PingReply | WebTourStartReply | SchoologySignInReply | ExtensionErrorReply;

interface MessageSpec {
  /** Refused unless the Chrome profile is a staff account (D3). */
  staffOnly: boolean;
  /** Exact keys besides `type`, each with its validator. */
  fields: Record<string, (value: unknown) => boolean>;
}

const START_SPEC: MessageSpec = {
  staffOnly: true,
  fields: {
    startUrl: (v) => isOpenableUrl(v),
    stepIndex: (v) => Number.isInteger(v) && (v as number) >= 0,
    tour: (v) => parseWebTourStartTour(v) !== null,
  },
};

/** A published tour's id, as the `/tour/{setId}` link carries it. */
export const isTourSetId = (v: unknown): v is string =>
  typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v);

/** A check run's id: short, plain characters only. */
export const isCheckRunId = (v: unknown): v is string =>
  typeof v === 'string' && /^[A-Za-z0-9-]{1,64}$/.test(v);

const MESSAGE_SPECS: Record<ExtensionMessageType, MessageSpec> = {
  ping: { staffOnly: false, fields: {} },
  'web-tour/start': START_SPEC,
  'web-tour/check': {
    staffOnly: true,
    fields: { ...START_SPEC.fields, runId: isCheckRunId },
  },
  'web-tour/open': { staffOnly: true, fields: { setId: isTourSetId } },
  'schoology/signed-in': { staffOnly: true, fields: {} },
  'schoology/connect': { staffOnly: true, fields: {} },
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

/** A locator checked key by key, or null; the same validator the start message uses. */
export const parseWebTourLocator = (v: unknown): WebTourLocator | null =>
  parseLocator(v);

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
    !onlyKeys(raw, [
      'setId',
      'version',
      'title',
      'steps',
      'conditions',
      'markup',
      'targets',
    ])
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
  const conditions =
    raw.conditions === undefined
      ? undefined
      : parseStepConditions(raw.conditions, ids);
  if (conditions === null) return null;
  const markup =
    raw.markup === undefined ? undefined : parseStepMarkup(raw.markup, ids);
  if (markup === null) return null;
  const targets =
    raw.targets === undefined ? undefined : parseStepTargets(raw.targets, ids);
  if (targets === null) return null;
  return {
    setId,
    version,
    title,
    steps: out,
    ...(conditions ? { conditions } : {}),
    ...(markup ? { markup } : {}),
    ...(targets ? { targets } : {}),
  };
}

/** A control's place in a picture, or null when it isn't one. */
export function parsePictureTarget(v: unknown): PictureTarget | null {
  if (!isPlainObject(v) || !onlyKeys(v, ['x', 'y', 'w', 'h'])) return null;
  const { x, y, w, h } = v;
  const unitNum = (n: unknown): n is number =>
    typeof n === 'number' && Number.isFinite(n) && n >= -1 && n <= 2;
  if (!unitNum(x) || !unitNum(y) || !unitNum(w) || !unitNum(h)) return null;
  if (!(w > 0 && h > 0)) return null;
  return { x, y, w, h };
}

/** Picture targets by step id, each for a step the tour has; null when anything is off. */
function parseStepTargets(
  v: unknown,
  stepIds: ReadonlySet<string>
): Record<string, PictureTarget> | null {
  if (!isPlainObject(v)) return null;
  const out: Record<string, PictureTarget> = {};
  for (const [id, raw] of Object.entries(v)) {
    const t = parsePictureTarget(raw);
    if (!stepIds.has(id) || !t) return null;
    out[id] = t;
  }
  return out;
}

/** Most shapes one step picture carries. */
export const MAX_MARKUP_SHAPES = 40;
const inPicture = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= -1 && v <= 2;

/** Markup shapes as a picture draws them, or null when any is malformed. */
export function parseMarkupShapes(v: unknown): TourMarkupShape[] | null {
  if (!Array.isArray(v) || v.length > MAX_MARKUP_SHAPES) return null;
  const out: TourMarkupShape[] = [];
  for (const s of v) {
    if (!isPlainObject(s) || typeof s.id !== 'string' || s.id.length > 64)
      return null;
    const { id } = s;
    if (
      s.kind === 'arrow' &&
      onlyKeys(s, ['id', 'kind', 'x1', 'y1', 'x2', 'y2']) &&
      inPicture(s.x1) &&
      inPicture(s.y1) &&
      inPicture(s.x2) &&
      inPicture(s.y2)
    )
      out.push({ id, kind: 'arrow', x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2 });
    else if (
      s.kind === 'box' &&
      onlyKeys(s, ['id', 'kind', 'x', 'y', 'w', 'h']) &&
      inPicture(s.x) &&
      inPicture(s.y) &&
      inPicture(s.w) &&
      inPicture(s.h)
    )
      out.push({ id, kind: 'box', x: s.x, y: s.y, w: s.w, h: s.h });
    else if (
      s.kind === 'number' &&
      onlyKeys(s, ['id', 'kind', 'x', 'y', 'n']) &&
      inPicture(s.x) &&
      inPicture(s.y) &&
      Number.isInteger(s.n) &&
      (s.n as number) >= 1 &&
      (s.n as number) <= 99
    )
      out.push({ id, kind: 'number', x: s.x, y: s.y, n: s.n as number });
    else return null;
  }
  return out;
}

/** A tour's picture markup by step id, each for a step the tour has; null when anything is off. */
export function parseStepMarkup(
  v: unknown,
  stepIds: ReadonlySet<string>
): Record<string, TourMarkupShape[]> | null {
  if (!isPlainObject(v)) return null;
  const out: Record<string, TourMarkupShape[]> = {};
  for (const [id, raw] of Object.entries(v)) {
    if (!stepIds.has(id)) return null;
    const shapes = parseMarkupShapes(raw);
    if (!shapes) return null;
    out[id] = shapes;
  }
  return out;
}

/** One web step condition, or null when it is malformed. */
export function parseWebTourCondition(v: unknown): WebTourCondition | null {
  if (!isPlainObject(v)) return null;
  if (v.kind === 'target' && onlyKeys(v, ['kind'])) return { kind: 'target' };
  if (
    v.kind === 'url' &&
    onlyKeys(v, ['kind', 'pattern']) &&
    typeof v.pattern === 'string' &&
    isPattern(v.pattern)
  )
    return { kind: 'url', pattern: v.pattern };
  return null;
}

/** A tour's conditions by step id, each for a step the tour has; null when anything is off. */
export function parseStepConditions(
  v: unknown,
  stepIds: ReadonlySet<string>
): Record<string, WebStepConditions> | null {
  if (!isPlainObject(v)) return null;
  const out: Record<string, WebStepConditions> = {};
  for (const [id, raw] of Object.entries(v)) {
    if (!stepIds.has(id) || !isPlainObject(raw)) return null;
    if (!onlyKeys(raw, ['showWhen', 'doneWhen'])) return null;
    const c: WebStepConditions = {};
    for (const key of ['showWhen', 'doneWhen'] as const) {
      if (raw[key] === undefined) continue;
      const cond = parseWebTourCondition(raw[key]);
      if (!cond) return null;
      c[key] = cond;
    }
    out[id] = c;
  }
  return out;
}

/** A message a page sends on the `web-tour` port, or null. */
export function parseWebTourPortMessage(
  raw: unknown
): WebTourWatchMessage | null {
  if (!isPlainObject(raw) || !onlyKeys(raw, ['type', 'setId', 'protocol'])) {
    return null;
  }
  if (raw.type !== 'web-tour/watch' || !str(raw.setId, 200) || !raw.setId) {
    return null;
  }
  const { protocol } = raw;
  if (protocol !== undefined && !Number.isInteger(protocol)) return null;
  return {
    type: 'web-tour/watch',
    setId: raw.setId,
    ...(typeof protocol === 'number' ? { protocol } : {}),
  };
}

const isCheckProgress = (msg: WebTourPortPost): msg is WebTourCheckProgress =>
  msg.type === 'web-tour/check-step' || msg.type === 'web-tour/check-end';

/** A port message as a page at `protocol` reads it: older pages get a weak match as `text`, and no check results or suggestions (null). */
export function progressForPage(
  msg: WebTourPortPost,
  protocol: number
): WebTourPortPost | null {
  if (msg.type === 'web-tour/suggest')
    return protocol >= SUGGEST_PROTOCOL ? msg : null;
  if (isCheckProgress(msg)) return protocol >= CHECK_PROTOCOL ? msg : null;
  if (msg.type !== 'web-tour/step' || msg.match !== 'score') return msg;
  return protocol >= SCORED_MATCH_PROTOCOL ? msg : { ...msg, match: 'text' };
}
