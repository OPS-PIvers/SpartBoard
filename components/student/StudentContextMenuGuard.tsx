import React, { useEffect, useSyncExternalStore } from 'react';
import { SPA_NAVIGATE_EVENT } from '@/utils/plcPath';
import { isStudentFacingPath } from '@/config/studentContextMenu';
import {
  useStudentContextMenuBlock,
  useStudentGrammarlyBlock,
} from '@/hooks/useStudentContextMenuBlock';

const GRAMMARLY_OPT_OUT: ReadonlyArray<readonly [string, string]> = [
  ['data-gramm', 'false'],
  ['data-gramm_editor', 'false'],
  ['data-enable-grammarly', 'false'],
  ['data-lt-active', 'false'],
];
const EDITABLE_SELECTOR = 'textarea, input, [contenteditable]';
export const NO_CALLOUT_CLASS = 'student-no-callout';

const preventMenu = (e: Event) => e.preventDefault();

function optOutOfGrammarly(el: Element): void {
  for (const [name, value] of GRAMMARLY_OPT_OUT) {
    if (el.getAttribute(name) !== value) el.setAttribute(name, value);
  }
}

function clearGrammarlyOptOut(el: Element): void {
  for (const [name] of GRAMMARLY_OPT_OUT) el.removeAttribute(name);
}

function forEachEditable(root: ParentNode, fn: (el: Element) => void): void {
  if (root instanceof Element && root.matches(EDITABLE_SELECTOR)) fn(root);
  root.querySelectorAll(EDITABLE_SELECTOR).forEach(fn);
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

const MenuBlock: React.FC = () => {
  const { enabled } = useStudentContextMenuBlock();

  useEffect(() => {
    if (!enabled) return;
    window.addEventListener('contextmenu', preventMenu, { capture: true });
    document.documentElement.classList.add(NO_CALLOUT_CLASS);
    return () => {
      window.removeEventListener('contextmenu', preventMenu, { capture: true });
      document.documentElement.classList.remove(NO_CALLOUT_CLASS);
    };
  }, [enabled]);

  return null;
};

const GrammarlyBlock: React.FC = () => {
  const grammarly = useStudentGrammarlyBlock();
  const menu = useStudentContextMenuBlock();
  // Until an admin saves the Grammarly switch, it follows right-click blocking as before.
  const enabled = grammarly.exists ? grammarly.enabled : menu.enabled;

  useEffect(() => {
    if (!enabled) return;
    optOutOfGrammarly(document.body);
    forEachEditable(document.body, optOutOfGrammarly);
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'attributes') {
          if (record.target instanceof Element) {
            forEachEditable(record.target, optOutOfGrammarly);
          }
          continue;
        }
        record.addedNodes.forEach((node) => {
          if (node instanceof Element) forEachEditable(node, optOutOfGrammarly);
        });
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['contenteditable'],
    });
    return () => {
      observer.disconnect();
      clearGrammarlyOptOut(document.body);
      forEachEditable(document.body, clearGrammarlyOptOut);
    };
  }, [enabled]);

  return null;
};

/** Turns off the right-click menu and Grammarly on student pages, each behind its own admin switch. */
export const StudentContextMenuGuard: React.FC = () => {
  const pathname = useSyncExternalStore(subscribePathname, getPathname);
  return isStudentFacingPath(pathname) ? (
    <>
      <MenuBlock />
      <GrammarlyBlock />
    </>
  ) : null;
};
