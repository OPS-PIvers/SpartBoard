import { useEffect, RefObject } from 'react';

type Handler = (event: MouseEvent | TouchEvent) => void;

// Module-level constant so callers that omit `ignoreRefs` get the SAME
// empty-array reference every render. A `[]` literal default would create
// a fresh array each call, which — combined with `ignoreRefs` being in the
// effect dep list — tears down and re-adds the document listeners on every
// render of the consuming component.
const EMPTY_REFS: ReadonlyArray<RefObject<HTMLElement | null>> = [];

export const useClickOutside = <T extends HTMLElement = HTMLElement>(
  ref: RefObject<T | null>,
  handler: Handler,
  ignoreRefs: ReadonlyArray<RefObject<HTMLElement | null>> = EMPTY_REFS
) => {
  useEffect(() => {
    const listener = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;

      // Do nothing if clicking ref's element or descendent elements
      if (!ref.current || ref.current.contains(target)) {
        return;
      }

      // Do nothing if clicking any of the ignored refs
      for (const ignoreRef of ignoreRefs) {
        if (ignoreRef.current && ignoreRef.current.contains(target)) {
          return;
        }
      }

      // Do nothing if clicking inside a portal with data-click-outside-ignore
      let node: Node | null = target;
      while (node && node !== document) {
        if (
          node instanceof HTMLElement &&
          node.dataset.clickOutsideIgnore === 'true'
        ) {
          return;
        }
        node = node.parentNode;
      }

      handler(event);
    };

    document.addEventListener('mousedown', listener);
    document.addEventListener('touchstart', listener);

    return () => {
      document.removeEventListener('mousedown', listener);
      document.removeEventListener('touchstart', listener);
    };
  }, [ref, handler, ignoreRefs]);
};
