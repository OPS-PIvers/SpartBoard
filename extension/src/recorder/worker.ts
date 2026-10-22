import {
  isRecordedStep,
  parseRecorderPageMessage,
  stepForPage,
  type RecordedWebStep,
} from '@/components/tours/web/recorderProtocol';
import { toUrlPattern } from '@/components/tours/web/studentData';
import { getChromeProfile } from '../profile';
import type { CapturedTarget } from './captureTarget';
import { framePath, offsetRect, toBox, type Rect, type Size } from './geometry';
import {
  isRecorderInternal,
  PANEL_PORT,
  type FrameRectReply,
  type FrameRef,
  type RawCapture,
  type RecorderPick,
  type RecorderStatus,
  type RecorderTour,
} from './messages';
import { createIntake, type Intake } from './intake';
import { MAX_PICKS_PER_PAGE, readBlurSettings } from './blurSettings';

const RECORDING_KEY = 'recorder.tabId';
const OUTBOX_KEY = 'recorder.outbox';
// Fixed steps wait here until SpartBoard saves them, like new steps in the outbox.
const FIXES_KEY = 'recorder.fixes';
const PICK_KEY = 'recorder.pick';
// Click to blur picks for this recording, by page url pattern.
const PICKS_KEY = 'recorder.blurPicks';
const PICKING_KEY = 'recorder.blurPicking';
const CONTENT_FILE = 'recorder.js';
// captureVisibleTab allows two calls a second.
const MIN_CAPTURE_GAP_MS = 550;
const FRAME_REPLY_MS = 1000;

type Outbox = Record<string, RecordedWebStep[]>;
type Picks = Record<string, string[]>;

/** Open SpartBoard web-step editors, by set id. */
const ports = new Map<string, Set<chrome.runtime.Port>>();
const titles = new Map<string, string>();
let lastCapture = 0;

const session = chrome.storage.session;

const recordingTab = async (): Promise<number | null> => {
  const got = await session.get(RECORDING_KEY);
  const id = got[RECORDING_KEY];
  return typeof id === 'number' ? id : null;
};

const readBox = async (key: string): Promise<Outbox> => {
  const got = await session.get(key);
  const box = got[key];
  return box && typeof box === 'object' ? (box as Outbox) : {};
};
const readOutbox = () => readBox(OUTBOX_KEY);
const writeOutbox = (box: Outbox) => session.set({ [OUTBOX_KEY]: box });

const readPick = async (): Promise<RecorderPick | null> => {
  const got = await session.get(PICK_KEY);
  const pick = got[PICK_KEY] as RecorderPick | undefined;
  return pick &&
    typeof pick.setId === 'string' &&
    typeof pick.stepId === 'string'
    ? pick
    : null;
};

const notifyPanel = () =>
  void chrome.runtime
    .sendMessage({ type: 'rec/changed' })
    .catch(() => undefined);

const isPanel = (sender: chrome.runtime.MessageSender) =>
  sender.id === chrome.runtime.id &&
  !sender.tab &&
  (sender.url ?? '').startsWith(chrome.runtime.getURL('sidepanel/'));

const count = (box: Outbox) =>
  Object.values(box).reduce((n, steps) => n + steps.length, 0);

async function status(): Promise<RecorderStatus> {
  const tours: RecorderTour[] = [...ports.keys()].map((setId) => ({
    setId,
    title: titles.get(setId) ?? '',
  }));
  const pick = await readPick();
  return {
    profile: await getChromeProfile(),
    recordingTabId: await recordingTab(),
    tours,
    // A fix for a tour that is no longer open in SpartBoard can't be sent.
    pick:
      pick && ports.has(pick.setId)
        ? { ...pick, title: titles.get(pick.setId) ?? '' }
        : null,
    unsaved: count(await readOutbox()) + count(await readBox(FIXES_KEY)),
    intake: (await intake?.status()) ?? {
      phase: 'none',
      drafts: [],
      pending: 0,
      failed: false,
      saved: null,
    },
    blurPicking: await blurPicking(),
  };
}

let intake: Intake | null = null;

/** The intake tab's port; the caller already checked the sender and port name. */
export function handleIntakePort(port: chrome.runtime.Port): void {
  void getChromeProfile().then((profile) => {
    if (profile !== 'staff' || !intake) port.disconnect();
    else intake.handlePort(port);
  });
}

async function startRecording(tabId: number): Promise<boolean> {
  if ((await getChromeProfile()) !== 'staff') return false;
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab?.url?.startsWith('https:') || !toUrlPattern(tab.url)) return false;
  if (!(await panelOpen())) return false;
  // Picks belong to one recording.
  await session.remove([PICKS_KEY, PICKING_KEY]);
  await session.set({ [RECORDING_KEY]: tabId });
  await inject(tabId);
  notifyPanel();
  return true;
}

/** Whether a side panel is open; the worker can outlive the panel's port, so it asks Chrome. */
async function panelOpen(): Promise<boolean> {
  const contexts = await chrome.runtime
    .getContexts({ contextTypes: [chrome.runtime.ContextType.SIDE_PANEL] })
    .catch(() => []);
  return contexts.length > 0;
}

async function stopRecording(): Promise<void> {
  const tabId = await recordingTab();
  await session.remove([RECORDING_KEY, PICKS_KEY, PICKING_KEY]);
  if (tabId !== null)
    await chrome.tabs
      .sendMessage(tabId, { type: 'rec/stopFrame' })
      .catch(() => undefined);
  notifyPanel();
}

const inject = (tabId: number, frameIds?: number[]) =>
  chrome.scripting
    .executeScript({
      target: frameIds ? { tabId, frameIds } : { tabId, allFrames: true },
      files: [CONTENT_FILE],
    })
    .catch(() => undefined);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Where a click inside a frame sits in the top viewport, or null when an ancestor can't place its child. */
async function placeInTop(
  tabId: number,
  frameId: number,
  frames: readonly chrome.webNavigation.GetAllFrameResultDetails[],
  rect: Rect
): Promise<{ rect: Rect; viewport: Size } | null> {
  const byId = new Map(frames.map((f) => [f.frameId, f]));
  let out = rect;
  let viewport: Size | null = null;
  for (let f = byId.get(frameId); f && f.frameId !== 0;) {
    const child = f;
    const siblings = frames
      .filter((s) => s.parentFrameId === child.parentFrameId)
      .sort((a, b) => a.frameId - b.frameId);
    const reply = (await chrome.tabs
      .sendMessage(
        tabId,
        {
          type: 'rec/frameRect',
          url: child.url,
          index: siblings.findIndex((s) => s.frameId === child.frameId),
        },
        { frameId: child.parentFrameId }
      )
      .catch(() => null)) as FrameRectReply | null;
    if (!reply?.ok) return null;
    out = offsetRect(out, reply);
    viewport = reply.viewport;
    f = byId.get(child.parentFrameId);
  }
  return viewport ? { rect: out, viewport } : null;
}

async function onClick(
  target: CapturedTarget,
  sender: chrome.runtime.MessageSender
): Promise<void> {
  const tabId = sender.tab?.id;
  const frameId = sender.frameId ?? 0;
  // The page the click happened on, read before any wait lets it navigate.
  const clickedUrl = sender.tab?.url;
  const urlPattern = clickedUrl ? toUrlPattern(clickedUrl) : null;
  if (tabId === undefined || !urlPattern) return;
  if (tabId !== (await recordingTab())) return;
  if (!(await panelOpen())) {
    await stopRecording();
    return;
  }
  const wait = lastCapture + MIN_CAPTURE_GAP_MS - Date.now();
  lastCapture = Math.max(Date.now(), lastCapture + MIN_CAPTURE_GAP_MS);
  if (wait > 0) await sleep(wait);
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab) return;
  const frames = (await chrome.webNavigation.getAllFrames({ tabId })) ?? [];
  // Only the recorded tab's own screen, still on the clicked page; otherwise no picture.
  const screenshot =
    tab.active && clickedUrl && tab.url === clickedUrl
      ? await captureBlurred(tab, frames, clickedUrl)
      : null;
  const path = frameId === 0 ? [] : framePath(frames, frameId);
  const placed =
    frameId === 0
      ? { rect: target.rect, viewport: target.viewport }
      : await placeInTop(tabId, frameId, frames, target.rect);
  const box = placed ? toBox(placed.rect, placed.viewport) : undefined;
  const capture: RawCapture = {
    id: crypto.randomUUID(),
    at: Date.now(),
    screenshot,
    target: placed?.rect ?? null,
    viewport: placed?.viewport ?? target.viewport,
    urlPattern,
    action: target.action,
    locator: {
      ...target.locator,
      ...(path && path.length ? { frames: path } : {}),
      ...(box ? { box } : {}),
    },
  };
  await chrome.runtime
    .sendMessage({ type: 'rec/captured', capture })
    .catch(() => undefined);
  // A fix takes one click, while its tour is still open to receive it.
  const pick = await readPick();
  if (pick && ports.has(pick.setId)) await stopRecording();
}

const readPicks = async (): Promise<Picks> => {
  const got = await session.get(PICKS_KEY);
  const picks = got[PICKS_KEY];
  return picks && typeof picks === 'object' ? (picks as Picks) : {};
};

const picksFor = (picks: Picks, url: string | undefined) => {
  const pattern = url ? toUrlPattern(url) : null;
  return (pattern && picks[pattern]) || [];
};

const blurPicking = async (): Promise<boolean> =>
  (await session.get(PICKING_KEY))[PICKING_KEY] === true;

/** A frame's reply, or null when it has no recorder or doesn't answer in time. */
const ask = (tabId: number, frameId: number, msg: object) =>
  Promise.race([
    chrome.tabs.sendMessage(tabId, msg, { frameId }).catch(() => null),
    sleep(FRAME_REPLY_MS).then(() => null),
  ]);

/** Tells frames whether Click to blur is on, with the picks already made on each one's page. */
async function syncBlurMode(tabId: number, frameIds?: number[]): Promise<void> {
  const on = await blurPicking();
  const picks = await readPicks();
  const frames = (await chrome.webNavigation.getAllFrames({ tabId })) ?? [];
  await Promise.all(
    frames
      .filter((f) => !frameIds || frameIds.includes(f.frameId))
      .map((f) =>
        ask(tabId, f.frameId, {
          type: 'rec/blurMode',
          on,
          picks: picksFor(picks, f.url),
        })
      )
  );
}

async function setBlurPicking(on: boolean): Promise<boolean> {
  const tabId = await recordingTab();
  if (tabId === null && on) return false;
  await session.set({ [PICKING_KEY]: on });
  if (tabId !== null) await syncBlurMode(tabId);
  notifyPanel();
  return true;
}

async function onBlurPick(
  selector: string,
  on: boolean,
  sender: chrome.runtime.MessageSender
): Promise<void> {
  const pattern = sender.url ? toUrlPattern(sender.url) : null;
  if (!pattern || sender.tab?.id !== (await recordingTab())) return;
  if (!(await blurPicking())) return;
  const picks = await readPicks();
  const kept = (picks[pattern] ?? []).filter((s) => s !== selector);
  picks[pattern] = (on ? [...kept, selector] : kept).slice(-MAX_PICKS_PER_PAGE);
  await session.set({ [PICKS_KEY]: picks });
}

// One picture at a time, so one click's blur is never lifted by another's.
let shooting: Promise<unknown> = Promise.resolve();

type Frame = chrome.webNavigation.GetAllFrameResultDetails;

/** The top frame's child frames that hold each unconfirmed frame, by url and sibling index; null when one can't be placed. */
export function framesToCover(
  frames: readonly Frame[],
  unconfirmed: readonly number[]
): FrameRef[] | null {
  const byId = new Map(frames.map((f) => [f.frameId, f]));
  const children = frames
    .filter((f) => f.parentFrameId === 0)
    .sort((a, b) => a.frameId - b.frameId);
  const out = new Map<number, FrameRef>();
  for (const id of unconfirmed) {
    let f = byId.get(id);
    while (f && f.parentFrameId !== 0) f = byId.get(f.parentFrameId);
    if (!f) return null;
    const child = f;
    out.set(child.frameId, {
      url: child.url,
      index: children.findIndex((c) => c.frameId === child.frameId),
    });
  }
  return [...out.values()];
}

/** Whether the recorded tab is still the one showing, on the clicked page. */
const stillShowing = async (tab: chrome.tabs.Tab, clickedUrl: string) => {
  const now = await chrome.tabs.get(tab.id ?? -1).catch(() => null);
  return (
    !!now?.active && now.url === clickedUrl && now.windowId === tab.windowId
  );
};

/** The tab's screen with every frame blurred and the Recording pill hidden; null unless all of it could be blurred. */
function captureBlurred(
  tab: chrome.tabs.Tab,
  frames: readonly Frame[],
  clickedUrl: string
): Promise<string | null> {
  const run = shooting.then(() => shoot(tab, frames, clickedUrl));
  shooting = run.catch(() => undefined);
  return run;
}

async function shoot(
  tab: chrome.tabs.Tab,
  frames: readonly Frame[],
  clickedUrl: string
): Promise<string | null> {
  const tabId = tab.id;
  if (tabId === undefined) return null;
  const blur = await readBlurSettings();
  const picks = await readPicks();
  const targets = frames.some((f) => f.frameId === 0)
    ? frames.map((f) => ({ frameId: f.frameId, url: f.url }))
    : [{ frameId: 0, url: tab.url }];
  const ready = await Promise.all(
    targets.map((f) =>
      ask(tabId, f.frameId, {
        type: 'rec/shoot',
        blur,
        picks: picksFor(picks, f.url),
      })
    )
  );
  try {
    // Only the blurred picture may exist: the top frame must confirm, and it blurs any frame that didn't.
    if (ready[targets.findIndex((f) => f.frameId === 0)] !== true) return null;
    const unconfirmed = targets
      .filter((f, i) => f.frameId !== 0 && ready[i] !== true)
      .map((f) => f.frameId);
    if (unconfirmed.length) {
      const cover = framesToCover(frames, unconfirmed);
      if (!cover) return null;
      const covered: unknown = await ask(tabId, 0, {
        type: 'rec/cover',
        frames: cover,
      });
      if (covered !== true) return null;
    }
    if (!(await stillShowing(tab, clickedUrl))) return null;
    const image = await chrome.tabs
      .captureVisibleTab(tab.windowId, { format: 'png' })
      .catch(() => null);
    return image && (await stillShowing(tab, clickedUrl)) ? image : null;
  } finally {
    await Promise.all(
      targets.map((f) => ask(tabId, f.frameId, { type: 'rec/shot' }))
    );
  }
}

// The protocol each editor said it reviews; one that never said gets only the clues every page reviews.
const pageProtocols = new WeakMap<chrome.runtime.Port, number>();

const stepMessage = (
  port: chrome.runtime.Port,
  type: 'recorder/step' | 'recorder/repicked',
  setId: string,
  step: RecordedWebStep
) => ({
  type,
  setId,
  step: stepForPage(step, pageProtocols.get(port) ?? 0),
});

const postStep = (
  setId: string,
  type: 'recorder/step' | 'recorder/repicked',
  step: RecordedWebStep
) =>
  ports.get(setId)?.forEach((p) => {
    try {
      p.postMessage(stepMessage(p, type, setId, step));
    } catch {
      // A closed editor just misses it; the outbox re-sends on attach.
    }
  });

/** False when the outbox can't hold the steps, so the panel keeps its copy. */
async function send(setId: string, steps: RecordedWebStep[]): Promise<boolean> {
  const box = await readOutbox();
  const queued = box[setId] ?? [];
  const ids = new Set(queued.map((s) => s.id));
  box[setId] = [...queued, ...steps.filter((s) => !ids.has(s.id))];
  const stored = await writeOutbox(box).then(
    () => true,
    () => false
  );
  if (!stored) return false;
  for (const step of steps) postStep(setId, 'recorder/step', step);
  notifyPanel();
  return true;
}

/** Sends the picked click as the new target and picture of the step SpartBoard asked to fix. */
async function sendFix(
  forPick: RecorderPick,
  step: RecordedWebStep
): Promise<boolean> {
  const pick = await readPick();
  // A click picked for another step never overwrites this one.
  if (
    !pick ||
    !ports.has(pick.setId) ||
    pick.setId !== forPick.setId ||
    pick.stepId !== forPick.stepId
  )
    return false;
  const { tip: _tip, ...rest } = step;
  const fixed: RecordedWebStep = { ...rest, id: pick.stepId };
  const box = await readBox(FIXES_KEY);
  box[pick.setId] = [
    ...(box[pick.setId] ?? []).filter((s) => s.id !== fixed.id),
    fixed,
  ];
  const stored = await session.set({ [FIXES_KEY]: box }).then(
    () => true,
    () => false
  );
  if (!stored) return false;
  await session.remove(PICK_KEY);
  postStep(pick.setId, 'recorder/repicked', fixed);
  notifyPanel();
  return true;
}

async function ack(setId: string, stepId: string): Promise<void> {
  for (const key of [OUTBOX_KEY, FIXES_KEY]) {
    const box = await readBox(key);
    const left = (box[setId] ?? []).filter((s) => s.id !== stepId);
    if (left.length) box[setId] = left;
    else delete box[setId];
    await session.set({ [key]: box });
  }
  notifyPanel();
}

/** Port messages from a trusted SpartBoard tab; the caller already checked the sender and port name. */
export function handleRecorderPort(port: chrome.runtime.Port): void {
  let attached: string | null = null;
  port.onMessage.addListener((raw) => {
    const msg = parseRecorderPageMessage(raw);
    if (!msg) return;
    // Recorded before the attach that follows it, so no step goes out first.
    if (msg.type === 'recorder/hello') {
      pageProtocols.set(port, msg.protocol);
      return;
    }
    void (async () => {
      if ((await getChromeProfile()) !== 'staff') {
        port.disconnect();
        return;
      }
      if (msg.type === 'recorder/attach') {
        if (attached && attached !== msg.setId)
          ports.get(attached)?.delete(port);
        attached = msg.setId;
        const set = ports.get(msg.setId) ?? new Set();
        set.add(port);
        ports.set(msg.setId, set);
        titles.set(msg.setId, msg.title);
        port.postMessage({ type: 'recorder/attached', setId: msg.setId });
        for (const step of (await readOutbox())[msg.setId] ?? [])
          port.postMessage(stepMessage(port, 'recorder/step', msg.setId, step));
        for (const step of (await readBox(FIXES_KEY))[msg.setId] ?? [])
          port.postMessage(
            stepMessage(port, 'recorder/repicked', msg.setId, step)
          );
        notifyPanel();
      } else if (msg.type === 'recorder/ack' && msg.setId === attached) {
        await ack(msg.setId, msg.stepId);
      } else if (msg.type === 'recorder/repick' && msg.setId === attached) {
        await session.set({
          [PICK_KEY]: { setId: msg.setId, stepId: msg.stepId },
        });
        // The fix click must record, not pick something to blur.
        await setBlurPicking(false);
      }
    })();
  });
  port.onDisconnect.addListener(() => {
    if (!attached) return;
    const set = ports.get(attached);
    set?.delete(port);
    if (set && set.size === 0) {
      const closed = attached;
      ports.delete(closed);
      titles.delete(closed);
      // A fix for a tour no tab has open any more is dropped with it.
      void readPick().then((pick) =>
        pick?.setId === closed && !ports.has(closed)
          ? session.remove(PICK_KEY)
          : undefined
      );
    }
    notifyPanel();
  });
}

/** Wires the recorder into the service worker: panel and content-script messages, re-injection, panel behaviour. */
export function installRecorder(origins: readonly string[] = []): void {
  intake = createIntake(origins, notifyPanel);
  void chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => undefined);

  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (sender.id !== chrome.runtime.id) return false;
    if (sender.tab) {
      if (isRecorderInternal(msg, 'rec/click'))
        void onClick(msg.target, sender);
      else if (isRecorderInternal(msg, 'rec/blurPick'))
        void onBlurPick(msg.selector, msg.on, sender);
      return false;
    }
    if (!isPanel(sender)) return false;
    if (isRecorderInternal(msg, 'rec/status')) {
      void status().then(reply);
      return true;
    }
    // Recording starts only here: a press in the side panel, never a page message.
    if (isRecorderInternal(msg, 'rec/start')) {
      void startRecording(msg.tabId).then(reply);
      return true;
    }
    if (isRecorderInternal(msg, 'rec/setBlurPicking')) {
      void setBlurPicking(msg.on).then(reply, () => reply(false));
      return true;
    }
    if (isRecorderInternal(msg, 'rec/stop')) {
      void stopRecording().then(() => reply(true));
      return true;
    }
    if (isRecorderInternal(msg, 'rec/intakeSave')) {
      if (!intake) return false;
      void intake
        .save(msg.target, msg.title, msg.steps, msg.jobId)
        .then(reply, () => reply(null));
      return true;
    }
    for (const type of [
      'rec/intakeOpen',
      'rec/intakeRetry',
      'rec/intakeIdle',
    ] as const) {
      if (!isRecorderInternal(msg, type) || !intake) continue;
      const run =
        type === 'rec/intakeOpen'
          ? intake.ensure()
          : type === 'rec/intakeRetry'
            ? intake.retry()
            : intake.idle();
      void run.then(
        () => reply(true),
        () => reply(false)
      );
      return true;
    }
    if (isRecorderInternal(msg, 'rec/sendFix')) {
      void sendFix({ setId: msg.setId, stepId: msg.stepId }, msg.step).then(
        reply,
        () => reply(false)
      );
      return true;
    }
    if (isRecorderInternal(msg, 'rec/cancelPick')) {
      void session.remove(PICK_KEY).then(() => {
        notifyPanel();
        reply(true);
      });
      return true;
    }
    if (isRecorderInternal(msg, 'rec/send')) {
      if (!ports.has(msg.setId) || !msg.steps.every(isRecordedStep)) {
        reply(false);
        return false;
      }
      void send(msg.setId, msg.steps).then(reply, () => reply(false));
      return true;
    }
    return false;
  });

  // A worker that restarted with no panel open never resumes an old recording.
  void panelOpen().then((open) => {
    if (!open) void stopRecording();
  });

  // Recording lasts only while the side panel is open.
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== PANEL_PORT || !isPanel(port.sender ?? {})) return;
    port.onDisconnect.addListener(() => void stopRecording());
  });

  // New documents and frames added later get the click listener again.
  chrome.webNavigation.onDOMContentLoaded.addListener((d) => {
    void recordingTab().then((tabId) => {
      if (tabId === d.tabId)
        void inject(d.tabId, [d.frameId]).then(() =>
          syncBlurMode(d.tabId, [d.frameId])
        );
    });
  });
  chrome.tabs.onRemoved.addListener((tabId) => {
    void recordingTab().then((id) => {
      if (id === tabId) void stopRecording();
    });
  });
}
