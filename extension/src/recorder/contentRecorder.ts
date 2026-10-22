// Injected into every frame of the tab being recorded, only after the side panel's Record press.
import { captureTarget } from './captureTarget';
import { isRecorderInternal, type FrameRectReply } from './messages';

const FLAG = '__spartTourRecorder';
// The overlay's own hosts never count as clicks on the site.
const OWN_HOST = '[data-spart-extension]';

type Scope = typeof globalThis & { [FLAG]?: () => void };

const frameElementFor = (url: string, index: number): Element | null => {
  const frames = Array.from(document.querySelectorAll('iframe, frame'));
  const byUrl = frames.filter((f) => {
    const src = (f as HTMLIFrameElement).src;
    return !!src && src === url;
  });
  if (byUrl.length === 1) return byUrl[0];
  return frames[index] ?? null;
};

/** The child frame's content box in this frame's viewport, so the worker can place a click inside it. */
const frameRect = (url: string, index: number): FrameRectReply => {
  const el = frameElementFor(url, index);
  if (!el) return { ok: false };
  const r = el.getBoundingClientRect();
  const style = getComputedStyle(el);
  const left =
    parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft) || 0;
  const top =
    parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop) || 0;
  return {
    ok: true,
    x: r.x + left,
    y: r.y + top,
    viewport: { w: innerWidth, h: innerHeight },
  };
};

function start(): () => void {
  const onPointerDown = (e: PointerEvent) => {
    // Only real presses by the admin; the page can't make steps by dispatching events.
    if (!e.isTrusted || e.button !== 0) return;
    const el = e.target instanceof Element ? e.target : null;
    if (!el || el.closest(OWN_HOST)) return;
    void chrome.runtime
      .sendMessage({ type: 'rec/click', target: captureTarget(el) })
      .catch(() => undefined);
  };
  const onMessage = (
    msg: unknown,
    sender: chrome.runtime.MessageSender,
    reply: (r: FrameRectReply) => void
  ) => {
    if (sender.id !== chrome.runtime.id || sender.tab) return;
    if (isRecorderInternal(msg, 'rec/frameRect'))
      reply(frameRect(msg.url, msg.index));
    else if (isRecorderInternal(msg, 'rec/stopFrame')) stop();
  };
  const stop = () => {
    removeEventListener('pointerdown', onPointerDown, { capture: true });
    chrome.runtime.onMessage.removeListener(onMessage);
    if (scope[FLAG] === stop) delete scope[FLAG];
  };
  addEventListener('pointerdown', onPointerDown, { capture: true });
  chrome.runtime.onMessage.addListener(onMessage);
  return stop;
}

const scope = globalThis as Scope;
scope[FLAG]?.();
scope[FLAG] = start();
