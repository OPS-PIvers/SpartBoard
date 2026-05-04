import { useEffect, useLayoutEffect, useRef, RefObject } from 'react';

type Handler = (event: MouseEvent | TouchEvent) => void;

// Module-level constant so callers that omit `ignoreRefs` get the SAME
// empty-array reference every render — kept as a defensive default even
// though the listener now reads `ignoreRefs` via a ref rather than from
// the effect deps.
const EMPTY_REFS: ReadonlyArray<RefObject<HTMLElement | null>> = [];

export const useClickOutside = <T extends HTMLElement = HTMLElement>(
  ref: RefObject<T | null>,
  handler: Handler,
  ignoreRefs: ReadonlyArray<RefObject<HTMLElement | null>> = EMPTY_REFS
) => {
  // Track the latest ignoreRefs in a ref so the listener always sees the
  // current value WITHOUT the array being an effect dependency. Otherwise
  // consumers that pass an inline literal (e.g. `[buttonRef]` — see
  // DraggableWindow, ToolDockItem, FolderItem) would tear down and re-add
  // the document listeners on every render of the consuming component.
  // Using useLayoutEffect ensures the ref is updated before any subsequent
  // event listener invocation can read a stale value.
  const ignoreRefsRef = useRef(ignoreRefs);
  useLayoutEffect(() => {
    ignoreRefsRef.current = ignoreRefs;
  });

  useEffect(() => {
    const listener = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;

      // Do nothing if clicking ref's element or descendent elements
      if (!ref.current || ref.current.contains(target)) {
        return;
      }

      // Do nothing if clicking any of the ignored refs
      for (const ignoreRef of ignoreRefsRef.current) {
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
  }, [ref, handler]);
};
