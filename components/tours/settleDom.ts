import type { SettleHost } from './playbackEngine';

/** How far around the target a change still counts as near it. */
export const SETTLE_MARGIN_PX = 48;
// Records checked per batch, so a page rewriting thousands of nodes can't make the check itself slow.
const MAX_RECORDS = 40;

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

/** A settle host over a real document: its timers and a mutation feed limited to the area around `near`. */
export function domSettleHost(
  doc: Document,
  { near, margin = SETTLE_MARGIN_PX, ignore }: DomSettleOptions
): SettleHost {
  const view = doc.defaultView;
  const MO = view?.MutationObserver ?? globalThis.MutationObserver;
  return {
    now: () => Date.now(),
    setTimer(ms, cb) {
      const set = view?.setTimeout.bind(view) ?? setTimeout;
      const clear = view?.clearTimeout.bind(view) ?? clearTimeout;
      const id = set(cb, ms);
      return () => clear(id);
    },
    watch(onChange) {
      if (!MO) return () => undefined;
      const area = (): DOMRect | null => {
        const el = near();
        if (!el?.isConnected) return null;
        const r = el.getBoundingClientRect();
        return new DOMRect(
          r.x - margin,
          r.y - margin,
          r.width + margin * 2,
          r.height + margin * 2
        );
      };
      const counts = (records: MutationRecord[]) => {
        const box = area();
        for (const r of records.slice(0, MAX_RECORDS)) {
          const el = elementOf(r.target);
          if (!el || ignore?.(el)) continue;
          if (!box) return true;
          // A removed node's parent stays connected, so its box still says where the change was.
          if (!el.isConnected || overlaps(el.getBoundingClientRect(), box))
            return true;
        }
        return false;
      };
      const observer = new MO((records) => {
        if (counts(records)) onChange();
      });
      observer.observe(doc.documentElement ?? doc, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      });
      return () => observer.disconnect();
    },
  };
}
