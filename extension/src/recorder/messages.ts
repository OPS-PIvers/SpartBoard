import type { WebTourAction, WebTourLocator } from '@/types';
import {
  ACTIONS,
  isLocator,
  isNum,
  isObj,
  isRecordedStep,
  isStr,
  type IntakeTarget,
  type RecordedWebStep,
} from '@/components/tours/web/recorderProtocol';
import type { CapturedTarget } from './captureTarget';
import {
  isBlurSettings,
  MAX_PICK_SELECTOR,
  MAX_PICKS_PER_PAGE,
  type BlurSettings,
} from './blurSettings';
import type { IntakeStatus } from './intake';
import type { Rect, Size } from './geometry';

/** The side panel's port to the worker; recording stops when it closes. */
export const PANEL_PORT = 'recorder-panel';

/** A click as the worker hands it to the side panel: full screenshot plus where to crop. */
export interface RawCapture {
  id: string;
  at: number;
  /** Null when the tab wasn't showing, so its screen couldn't be captured. */
  screenshot: string | null;
  /** Target in top-viewport CSS px, or null when a frame couldn't be placed. */
  target: Rect | null;
  viewport: Size;
  urlPattern: string;
  action: WebTourAction;
  locator: WebTourLocator;
}

export interface RecorderTour {
  setId: string;
  title: string;
}

/** A step SpartBoard asked to fix: the next click replaces its target and picture. */
export interface RecorderPick {
  setId: string;
  stepId: string;
}

export interface RecorderStatus {
  profile: 'staff' | 'other' | 'none';
  recordingTabId: number | null;
  tours: RecorderTour[];
  pick: (RecorderPick & { title: string }) | null;
  /** Steps sent to a tour that hasn't saved them yet. */
  unsaved: number;
  intake: IntakeStatus;
  /** Click to blur is on: clicks on the page pick elements to blur instead of making steps. */
  blurPicking: boolean;
}

export type FrameRectReply =
  { ok: true; x: number; y: number; viewport: Size } | { ok: false };

type InternalSpec = {
  'rec/click': { target: CapturedTarget };
  'rec/frameRect': { url: string; index: number };
  'rec/stopFrame': Record<string, never>;
  'rec/status': Record<string, never>;
  'rec/start': { tabId: number };
  'rec/stop': Record<string, never>;
  'rec/send': { setId: string; steps: RecordedWebStep[] };
  'rec/sendFix': RecorderPick & { step: RecordedWebStep };
  /** Blurs this frame (and hides the pill in the top frame) before a picture. */
  'rec/shoot': { blur: BlurSettings; picks: string[] };
  'rec/shot': Record<string, never>;
  'rec/blurMode': { on: boolean; picks: string[] };
  'rec/setBlurPicking': { on: boolean };
  'rec/blurPick': { selector: string; on: boolean };
  'rec/intakeOpen': Record<string, never>;
  'rec/intakeSave': {
    target: IntakeTarget;
    title: string;
    steps: RecordedWebStep[];
    /** Adds to the job an earlier batch of the same Send started. */
    jobId?: string;
  };
  'rec/intakeRetry': Record<string, never>;
  'rec/intakeIdle': Record<string, never>;
  'rec/cancelPick': Record<string, never>;
  'rec/captured': { capture: RawCapture };
  'rec/changed': Record<string, never>;
};

export type RecorderInternal = {
  [K in keyof InternalSpec]: { type: K } & InternalSpec[K];
}[keyof InternalSpec];

const isRect = (v: unknown): v is Rect =>
  isObj(v) && isNum(v.x) && isNum(v.y) && isNum(v.width) && isNum(v.height);

const isTarget = (v: unknown): v is CapturedTarget =>
  isObj(v) &&
  isStr(v.action, 10) &&
  ACTIONS.includes(v.action) &&
  isLocator(v.locator) &&
  isRect(v.rect) &&
  isObj(v.viewport) &&
  isNum(v.viewport.w) &&
  isNum(v.viewport.h);

const isPicks = (v: unknown): v is string[] =>
  Array.isArray(v) &&
  v.length <= MAX_PICKS_PER_PAGE &&
  v.every((s) => isStr(s, MAX_PICK_SELECTOR));

const CHECKS: {
  [K in keyof InternalSpec]: (m: Record<string, unknown>) => boolean;
} = {
  'rec/click': (m) => isTarget(m.target),
  'rec/frameRect': (m) =>
    isStr(m.url) && Number.isInteger(m.index) && (m.index as number) >= 0,
  'rec/stopFrame': () => true,
  'rec/status': () => true,
  'rec/start': (m) => Number.isInteger(m.tabId),
  'rec/stop': () => true,
  'rec/send': (m) =>
    isStr(m.setId, 128) &&
    Array.isArray(m.steps) &&
    m.steps.length <= 50 &&
    m.steps.every(isRecordedStep),
  'rec/sendFix': (m) =>
    isStr(m.setId, 128) && isStr(m.stepId, 64) && isRecordedStep(m.step),
  'rec/shoot': (m) => isBlurSettings(m.blur) && isPicks(m.picks),
  'rec/shot': () => true,
  'rec/blurMode': (m) => typeof m.on === 'boolean' && isPicks(m.picks),
  'rec/setBlurPicking': (m) => typeof m.on === 'boolean',
  'rec/blurPick': (m) =>
    isStr(m.selector, MAX_PICK_SELECTOR) && typeof m.on === 'boolean',
  'rec/intakeOpen': () => true,
  'rec/intakeSave': (m) =>
    isObj(m.target) &&
    ((m.target.kind === 'new' && isStr(m.target.title, 200)) ||
      (m.target.kind === 'append' && isStr(m.target.setId, 128))) &&
    isStr(m.title, 200) &&
    Array.isArray(m.steps) &&
    m.steps.length <= 50 &&
    m.steps.every(isRecordedStep) &&
    (m.jobId === undefined || isStr(m.jobId, 64)),
  'rec/intakeRetry': () => true,
  'rec/intakeIdle': () => true,
  'rec/cancelPick': () => true,
  'rec/captured': (m) => isObj(m.capture),
  'rec/changed': () => true,
};

/** Whether `msg` is the recorder's own message of this type, with valid fields. */
export function isRecorderInternal<K extends keyof InternalSpec>(
  msg: unknown,
  type: K
): msg is { type: K } & InternalSpec[K] {
  return isObj(msg) && msg.type === type && CHECKS[type](msg);
}
