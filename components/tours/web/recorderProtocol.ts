import {
  WEB_TOUR_ATTR_KEYS,
  type WebTourAction,
  type WebTourLocator,
} from '@/types';
import { MAX_CAPTURED_TEXT, MAX_HREF_PATTERN } from './studentData';
import {
  CLAUDE_NOTES_PROTOCOL,
  SCORED_MATCH_PROTOCOL,
} from './extensionProtocol';

/** Port the web-step editor opens to the extension to receive recorded steps. */
export const RECORDER_PORT = 'web-tour-recorder';

/** A finished step as the side panel sends it: picture cropped and blurred. */
export interface RecordedWebStep {
  id: string;
  urlPattern: string;
  action: WebTourAction;
  locator: WebTourLocator;
  picture?: { dataUrl: string; w: number; h: number };
  /** The tip the admin typed in the side panel; older clients ignore it. */
  tip?: string;
  /** The admin's private note for Claude; only to pages on protocol 5 or later. */
  note?: string;
}

export const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
export const isStr = (v: unknown, max = 2048): v is string =>
  typeof v === 'string' && v.length <= max;
export const isNum = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);
const optStr = (v: unknown, max: number) => v === undefined || isStr(v, max);
export const ACTIONS: readonly string[] = [
  'observe',
  'click',
  'type',
  'select',
];

const isFrames = (v: unknown) =>
  v === undefined ||
  (Array.isArray(v) &&
    v.length <= 10 &&
    v.every(
      (f) =>
        isObj(f) &&
        isStr(f.urlPattern) &&
        Number.isInteger(f.index) &&
        (f.index as number) >= 0
    ));

const isBox = (v: unknown) =>
  v === undefined ||
  (isObj(v) && isNum(v.x) && isNum(v.y) && isNum(v.w) && isNum(v.h));

const isAttrs = (v: unknown) =>
  v === undefined ||
  (isObj(v) &&
    Object.entries(v).every(
      ([k, a]) =>
        (WEB_TOUR_ATTR_KEYS as readonly string[]).includes(k) &&
        isStr(a, MAX_HREF_PATTERN)
    ));

export const isLocator = (v: unknown): v is WebTourLocator =>
  isObj(v) &&
  optStr(v.role, 40) &&
  optStr(v.name, MAX_CAPTURED_TEXT) &&
  optStr(v.text, MAX_CAPTURED_TEXT) &&
  optStr(v.css, 400) &&
  optStr(v.heading, MAX_CAPTURED_TEXT) &&
  optStr(v.pageTitle, MAX_CAPTURED_TEXT) &&
  isAttrs(v.attrs) &&
  isFrames(v.frames) &&
  isBox(v.box);

// Step ids become picture file names.
const STEP_ID = /^[A-Za-z0-9_-]{1,64}$/;

export const MAX_TIP_CHARS = 500;
export const MAX_NOTE_CHARS = 500;
export const MAX_GOAL_CHARS = 500;

/** Picture data URLs above this are refused, so one message stays small. */
export const MAX_PICTURE_CHARS = 1_500_000;

export const isRecordedStep = (v: unknown): v is RecordedWebStep =>
  isObj(v) &&
  isStr(v.id, 64) &&
  STEP_ID.test(v.id) &&
  isStr(v.urlPattern) &&
  isStr(v.action, 10) &&
  ACTIONS.includes(v.action) &&
  isLocator(v.locator) &&
  optStr(v.tip, MAX_TIP_CHARS) &&
  optStr(v.note, MAX_NOTE_CHARS) &&
  (v.picture === undefined ||
    (isObj(v.picture) &&
      isStr(v.picture.dataUrl, MAX_PICTURE_CHARS) &&
      v.picture.dataUrl.startsWith('data:image/jpeg;base64,') &&
      isNum(v.picture.w) &&
      isNum(v.picture.h)));

/** The step as a page speaking `protocol` can review: older pages never get the clues their review can't show. */
export function stepForPage(
  step: RecordedWebStep,
  protocol: number
): RecordedWebStep {
  const { note, ...rest } = step;
  const kept =
    protocol >= CLAUDE_NOTES_PROTOCOL && note ? { ...rest, note } : rest;
  if (protocol >= SCORED_MATCH_PROTOCOL) return kept;
  const { heading: _h, pageTitle: _t, attrs: _a, ...locator } = step.locator;
  return { ...kept, locator };
}

/** The intake target as a page speaking `protocol` reads it: older pages never get the goal. */
export function targetForPage(
  target: IntakeTarget,
  protocol: number
): IntakeTarget {
  if (target.kind !== 'new' || !target.goal) return target;
  return protocol >= CLAUDE_NOTES_PROTOCOL
    ? target
    : { kind: 'new', title: target.title };
}

/** What the extension posts on the recorder port. */
export type RecorderPortMessage =
  | { type: 'recorder/attached'; setId: string }
  | { type: 'recorder/step'; setId: string; step: RecordedWebStep }
  /** Answers `recorder/repick`: the step's new target and picture, under the step's own id. */
  | { type: 'recorder/repicked'; setId: string; step: RecordedWebStep }
  | { type: 'recorder/stopped'; setId: string };

/** The recorder port message, or null when it isn't one or its fields are wrong. */
export function parseRecorderPortMessage(
  msg: unknown
): RecorderPortMessage | null {
  if (!isObj(msg) || !isStr(msg.setId, 128)) return null;
  if (msg.type === 'recorder/attached' || msg.type === 'recorder/stopped')
    return Object.keys(msg).length === 2
      ? { type: msg.type, setId: msg.setId }
      : null;
  if (
    (msg.type === 'recorder/step' || msg.type === 'recorder/repicked') &&
    isRecordedStep(msg.step)
  )
    return { type: msg.type, setId: msg.setId, step: msg.step };
  return null;
}

/** What the web-step editor posts on the recorder port. */
export type RecorderPageMessage =
  | { type: 'recorder/attach'; setId: string; title: string }
  | { type: 'recorder/ack'; setId: string; stepId: string }
  /** Puts the side panel in pick mode: the next click replaces this step's target and picture. */
  | { type: 'recorder/repick'; setId: string; stepId: string }
  /** Sent before attach: the protocol this page reviews; older extensions ignore it. */
  | { type: 'recorder/hello'; setId: string; protocol: number };

const isProtocol = (v: unknown): v is number =>
  Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 1000;

const hasKeys = (m: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(m).length === keys.length && keys.every((k) => k in m);

/** The page's port message, or null when it isn't one or its fields are wrong. */
export function parseRecorderPageMessage(
  msg: unknown
): RecorderPageMessage | null {
  if (!isObj(msg) || !isStr(msg.setId, 128) || !msg.setId) return null;
  if (
    msg.type === 'recorder/attach' &&
    hasKeys(msg, ['type', 'setId', 'title']) &&
    isStr(msg.title, 200)
  )
    return { type: msg.type, setId: msg.setId, title: msg.title };
  if (
    msg.type === 'recorder/hello' &&
    hasKeys(msg, ['type', 'setId', 'protocol']) &&
    isProtocol(msg.protocol)
  )
    return { type: msg.type, setId: msg.setId, protocol: msg.protocol };
  if (
    (msg.type === 'recorder/ack' || msg.type === 'recorder/repick') &&
    hasKeys(msg, ['type', 'setId', 'stepId']) &&
    isStr(msg.stepId, 64) &&
    STEP_ID.test(msg.stepId)
  )
    return { type: msg.type, setId: msg.setId, stepId: msg.stepId };
  return null;
}

/** Port a SpartBoard intake tab opens to the extension, so steps recorded with no editor open can be saved (U17). */
export const INTAKE_PORT = 'web-tour-intake';

/** Where an intake job's steps go: a new draft with this title, or the end of an existing draft. */
export type IntakeTarget =
  | { kind: 'new'; title: string; goal?: string }
  | { kind: 'append'; setId: string };

export interface IntakeDraft {
  setId: string;
  title: string;
}

const JOB_ID = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_INTAKE_STEPS = 10;
const MAX_DRAFTS = 200;

const isTarget = (v: unknown): v is IntakeTarget =>
  isObj(v) &&
  ((v.kind === 'new' &&
    isStr(v.title, 200) &&
    optStr(v.goal, MAX_GOAL_CHARS)) ||
    (v.kind === 'append' && isStr(v.setId, 128) && STEP_ID.test(v.setId)));

/** What the extension posts to the intake tab. */
export type IntakePortMessage =
  | {
      type: 'intake/save';
      jobId: string;
      target: IntakeTarget;
      steps: RecordedWebStep[];
    }
  | { type: 'intake/listDrafts' };

/** The extension's intake message, or null when it isn't one or its fields are wrong. */
export function parseIntakePortMessage(msg: unknown): IntakePortMessage | null {
  if (!isObj(msg)) return null;
  if (msg.type === 'intake/listDrafts' && Object.keys(msg).length === 1)
    return { type: msg.type };
  if (
    msg.type === 'intake/save' &&
    isStr(msg.jobId, 64) &&
    JOB_ID.test(msg.jobId) &&
    isTarget(msg.target) &&
    Array.isArray(msg.steps) &&
    msg.steps.length <= MAX_INTAKE_STEPS &&
    msg.steps.every(isRecordedStep)
  )
    return {
      type: msg.type,
      jobId: msg.jobId,
      target: msg.target,
      steps: msg.steps,
    };
  return null;
}

/** What the intake tab posts back to the extension. */
export type IntakePageMessage =
  /** `protocol` is the one this page reviews; absent from pages before protocol 4. */
  | { type: 'intake/ready'; drafts: IntakeDraft[]; protocol?: number }
  | { type: 'intake/signin' }
  | { type: 'intake/denied' }
  | { type: 'intake/created'; jobId: string; setId: string }
  | { type: 'intake/ack'; jobId: string; stepId: string }
  | { type: 'intake/failed'; jobId: string };

const isDraft = (v: unknown): v is IntakeDraft =>
  isObj(v) &&
  isStr(v.setId, 128) &&
  STEP_ID.test(v.setId) &&
  isStr(v.title, 200);

/** The intake tab's message, or null when it isn't one or its fields are wrong. */
export function parseIntakePageMessage(msg: unknown): IntakePageMessage | null {
  if (!isObj(msg)) return null;
  if (msg.type === 'intake/signin' || msg.type === 'intake/denied')
    return { type: msg.type };
  if (
    msg.type === 'intake/ready' &&
    Array.isArray(msg.drafts) &&
    msg.drafts.length <= MAX_DRAFTS &&
    msg.drafts.every(isDraft)
  )
    return {
      type: msg.type,
      drafts: msg.drafts.map((d) => ({ setId: d.setId, title: d.title })),
      ...(isProtocol(msg.protocol) ? { protocol: msg.protocol } : {}),
    };
  if (!isStr(msg.jobId, 64) || !JOB_ID.test(msg.jobId)) return null;
  if (msg.type === 'intake/failed') return { type: msg.type, jobId: msg.jobId };
  if (
    msg.type === 'intake/created' &&
    isStr(msg.setId, 128) &&
    STEP_ID.test(msg.setId)
  )
    return { type: msg.type, jobId: msg.jobId, setId: msg.setId };
  if (
    msg.type === 'intake/ack' &&
    isStr(msg.stepId, 64) &&
    STEP_ID.test(msg.stepId)
  )
    return { type: msg.type, jobId: msg.jobId, stepId: msg.stepId };
  return null;
}
