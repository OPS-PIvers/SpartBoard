import {
  isRecordedStep,
  parseRecorderPageMessage,
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
  type RawCapture,
  type RecorderStatus,
  type RecorderTour,
} from './messages';

const RECORDING_KEY = 'recorder.tabId';
const OUTBOX_KEY = 'recorder.outbox';
const CONTENT_FILE = 'recorder.js';
// captureVisibleTab allows two calls a second.
const MIN_CAPTURE_GAP_MS = 550;

type Outbox = Record<string, RecordedWebStep[]>;

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

const readOutbox = async (): Promise<Outbox> => {
  const got = await session.get(OUTBOX_KEY);
  const box = got[OUTBOX_KEY];
  return box && typeof box === 'object' ? (box as Outbox) : {};
};

const writeOutbox = (box: Outbox) => session.set({ [OUTBOX_KEY]: box });

const notifyPanel = () =>
  void chrome.runtime
    .sendMessage({ type: 'rec/changed' })
    .catch(() => undefined);

const isPanel = (sender: chrome.runtime.MessageSender) =>
  sender.id === chrome.runtime.id &&
  !sender.tab &&
  (sender.url ?? '').startsWith(chrome.runtime.getURL('sidepanel/'));

async function status(): Promise<RecorderStatus> {
  const box = await readOutbox();
  const tours: RecorderTour[] = [...ports.keys()].map((setId) => ({
    setId,
    title: titles.get(setId) ?? '',
  }));
  return {
    profile: await getChromeProfile(),
    recordingTabId: await recordingTab(),
    tours,
    unsaved: Object.values(box).reduce((n, steps) => n + steps.length, 0),
  };
}

async function startRecording(tabId: number): Promise<boolean> {
  if ((await getChromeProfile()) !== 'staff') return false;
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab?.url?.startsWith('https:') || !toUrlPattern(tab.url)) return false;
  if (!(await panelOpen())) return false;
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
  await session.remove(RECORDING_KEY);
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
  // Only the recorded tab's own screen, still on the clicked page; otherwise no picture.
  const screenshot =
    tab.active && tab.url === clickedUrl
      ? await chrome.tabs
          .captureVisibleTab(tab.windowId, { format: 'png' })
          .catch(() => null)
      : null;
  const frames = (await chrome.webNavigation.getAllFrames({ tabId })) ?? [];
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
}

const post = (setId: string, msg: object) =>
  ports.get(setId)?.forEach((p) => {
    try {
      p.postMessage(msg);
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
  for (const step of steps) post(setId, { type: 'recorder/step', setId, step });
  notifyPanel();
  return true;
}

async function ack(setId: string, stepId: string): Promise<void> {
  const box = await readOutbox();
  const left = (box[setId] ?? []).filter((s) => s.id !== stepId);
  if (left.length) box[setId] = left;
  else delete box[setId];
  await writeOutbox(box);
  notifyPanel();
}

/** Port messages from a trusted SpartBoard tab; the caller already checked the sender and port name. */
export function handleRecorderPort(port: chrome.runtime.Port): void {
  let attached: string | null = null;
  port.onMessage.addListener((raw) => {
    void (async () => {
      const msg = parseRecorderPageMessage(raw);
      if (!msg) return;
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
          port.postMessage({ type: 'recorder/step', setId: msg.setId, step });
        notifyPanel();
      } else if (msg.setId === attached) {
        await ack(msg.setId, msg.stepId);
      }
    })();
  });
  port.onDisconnect.addListener(() => {
    if (!attached) return;
    const set = ports.get(attached);
    set?.delete(port);
    if (set && set.size === 0) {
      ports.delete(attached);
      titles.delete(attached);
    }
    notifyPanel();
  });
}

/** Wires the recorder into the service worker: panel and content-script messages, re-injection, panel behaviour. */
export function installRecorder(): void {
  void chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => undefined);

  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (sender.id !== chrome.runtime.id) return false;
    if (sender.tab) {
      if (isRecorderInternal(msg, 'rec/click'))
        void onClick(msg.target, sender);
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
    if (isRecorderInternal(msg, 'rec/stop')) {
      void stopRecording().then(() => reply(true));
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
      if (tabId === d.tabId) void inject(d.tabId, [d.frameId]);
    });
  });
  chrome.tabs.onRemoved.addListener((tabId) => {
    void recordingTab().then((id) => {
      if (id === tabId) void stopRecording();
    });
  });
}
