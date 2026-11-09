import type { SettleHost } from './playbackEngine';

/** How far around the target a change still counts as near it. */
export const SETTLE_MARGIN_PX = 48;
/** Records checked one by one per batch; a bigger batch counts as a change without being read. */
export const SETTLE_MAX_RECORDS = 40;
// Frame sampling where a document has no requestAnimationFrame (a hidden tab or a test).
const FRAME_FALLBACK_MS = 16;

export interface DomSettleOptions {
  /** The element whose surroundings must rest; null watches the whole document. */
  near: () => Element | null;
  margin?: number;
  /** Changes inside these (the tour's own UI) never count. */
  ignore?: (el: Element) => boolean;
}

const elementOf = (node: Node): Element | null =>
  node instanceof Element ? node : node.parentElement;

const overlaps = (a: DOMRect, b: DOMRect) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

const sameBox = (a: DOMRect, b: DOMRect) =>
  a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

/** A settle host over a real document: its timers, mutations near `near`, and `near`'s own box moving between frames (CSS transitions, scrolling). */
export function domSettleHost(
  doc: Document,
  { near, margin = SETTLE_MARGIN_PX, ignore }: DomSettleOptions
): SettleHost {
  const view = doc.defaultView;
  const MO = view?.MutationObserver ?? globalThis.MutationObserver;
  const set = view?.setTimeout.bind(view) ?? setTimeout;
  const clear = view?.clearTimeout.bind(view) ?? clearTimeout;
  const nextFrame = (cb: () => void): (() => void) => {
    if (typeof view?.requestAnimationFrame === 'function') {
      const id = view.requestAnimationFrame(cb);
      return () => view.cancelAnimationFrame(id);
    }
    const id = set(cb, FRAME_FALLBACK_MS);
    return () => clear(id);
  };
  return {
    now: () => Date.now(),
    setTimer(ms, cb) {
      const id = set(cb, ms);
      return () => clear(id);
    },
    watch(onChange) {
      // A batch is read against one box, measured once and only when a cheap check can't decide.
      const counts = (records: MutationRecord[]) => {
        if (records.length > SETTLE_MAX_RECORDS) return true;
        const target = near();
        if (!target?.isConnected)
          return records.some((r) => {
            const el = elementOf(r.target);
            return !!el && !ignore?.(el);
          });
        let box: DOMRect | null = null;
        const seen = new Set<Element>();
        for (const r of records) {
          const el = elementOf(r.target);
          if (!el || seen.has(el)) continue;
          seen.add(el);
          if (ignore?.(el)) continue;
          // Inside the target, or an ancestor whose layout carries it.
          if (target.contains(el) || el.contains(target)) return true;
          // A removed node's parent stays connected, so its box still says where the change was.
          if (!el.isConnected) return true;
          if (!box) {
            const r0 = target.getBoundingClientRect();
            box = new DOMRect(
              r0.x - margin,
              r0.y - margin,
              r0.width + margin * 2,
              r0.height + margin * 2
            );
          }
          if (overlaps(el.getBoundingClientRect(), box)) return true;
        }
        return false;
      };
      const observer = MO
        ? new MO((records) => {
            if (counts(records)) onChange();
          })
        : null;
      observer?.observe(doc.documentElement ?? doc, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      });
      // One box read per frame on the target, so movement with no mutation (transitions, scrolling) counts too.
      let last: { el: Element | null; box: DOMRect | null } = {
        el: near(),
        box: null,
      };
      last.box = last.el?.isConnected ? last.el.getBoundingClientRect() : null;
      let stopFrame: (() => void) | null = null;
      const sample = () => {
        const el = near();
        const box = el?.isConnected ? el.getBoundingClientRect() : null;
        const moved =
          el !== last.el ||
          (box === null) !== (last.box === null) ||
          (!!box && !!last.box && !sameBox(box, last.box));
        last = { el, box };
        if (moved) onChange();
        stopFrame = nextFrame(sample);
      };
      stopFrame = nextFrame(sample);
      return () => {
        observer?.disconnect();
        stopFrame?.();
        stopFrame = null;
      };
    },
  };
}
