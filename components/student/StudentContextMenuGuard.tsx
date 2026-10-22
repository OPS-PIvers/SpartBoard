import React, { useEffect, useSyncExternalStore } from 'react';
import { SPA_NAVIGATE_EVENT } from '@/utils/plcPath';
import { isStudentFacingPath } from '@/config/studentContextMenu';
import { useStudentContextMenuBlock } from '@/hooks/useStudentContextMenuBlock';

const GRAMMARLY_OPT_OUT: ReadonlyArray<readonly [string, string]> = [
  ['data-gramm', 'false'],
  ['data-gramm_editor', 'false'],
  ['data-enable-grammarly', 'false'],
];
const EDITABLE_SELECTOR = 'textarea, input, [contenteditable]';
export const NO_CALLOUT_CLASS = 'student-no-callout';

const preventMenu = (e: Event) => e.preventDefault();

function optOutOfGrammarly(el: Element): void {
  for (const [name, value] of GRAMMARLY_OPT_OUT) {
    if (el.getAttribute(name) !== value) el.setAttribute(name, value);
  }
}

function optOutTree(root: ParentNode): void {
  if (root instanceof Element && root.matches(EDITABLE_SELECTOR)) {
    optOutOfGrammarly(root);
  }
  root.querySelectorAll(EDITABLE_SELECTOR).forEach(optOutOfGrammarly);
}

function subscribePathname(onChange: () => void): () => void {
  window.addEventListener('popstate', onChange);
  window.addEventListener(SPA_NAVIGATE_EVENT, onChange);
  return () => {
    window.removeEventListener('popstate', onChange);
    window.removeEventListener(SPA_NAVIGATE_EVENT, onChange);
  };
}
const getPathname = () => window.location.pathname;

const ActiveGuard: React.FC = () => {
  const { enabled } = useStudentContextMenuBlock();

  useEffect(() => {
    if (!enabled) return;
    window.addEventListener('contextmenu', preventMenu, { capture: true });
    document.documentElement.classList.add(NO_CALLOUT_CLASS);
    optOutOfGrammarly(document.body);
    optOutTree(document.body);
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        record.addedNodes.forEach((node) => {
          if (node instanceof Element) optOutTree(node);
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      window.removeEventListener('contextmenu', preventMenu, { capture: true });
      document.documentElement.classList.remove(NO_CALLOUT_CLASS);
      observer.disconnect();
    };
  }, [enabled]);

  return null;
};

/** Turns off the right-click menu and Grammarly on student pages while the admin switch is on. */
export const StudentContextMenuGuard: React.FC = () => {
  const pathname = useSyncExternalStore(subscribePathname, getPathname);
  return isStudentFacingPath(pathname) ? <ActiveGuard /> : null;
};
