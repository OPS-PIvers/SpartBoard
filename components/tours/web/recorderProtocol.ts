import type { WebTourAction, WebTourLocator } from '@/types';
import { MAX_CAPTURED_TEXT } from './studentData';

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

export const isLocator = (v: unknown): v is WebTourLocator =>
  isObj(v) &&
  optStr(v.role, 40) &&
  optStr(v.name, MAX_CAPTURED_TEXT) &&
  optStr(v.text, MAX_CAPTURED_TEXT) &&
  optStr(v.css, 400) &&
  isFrames(v.frames) &&
  isBox(v.box);

// Step ids become picture file names.
const STEP_ID = /^[A-Za-z0-9_-]{1,64}$/;

export const MAX_TIP_CHARS = 500;

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
  (v.picture === undefined ||
    (isObj(v.picture) &&
      isStr(v.picture.dataUrl, MAX_PICTURE_CHARS) &&
      v.picture.dataUrl.startsWith('data:image/jpeg;base64,') &&
      isNum(v.picture.w) &&
      isNum(v.picture.h)));

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
  | { type: 'recorder/repick'; setId: string; stepId: string };

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
    (msg.type === 'recorder/ack' || msg.type === 'recorder/repick') &&
    hasKeys(msg, ['type', 'setId', 'stepId']) &&
    isStr(msg.stepId, 64) &&
    STEP_ID.test(msg.stepId)
  )
    return { type: msg.type, setId: msg.setId, stepId: msg.stepId };
  return null;
}
