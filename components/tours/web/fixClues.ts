// Which clues a suggested fix may carry (C14, C15); shared by the extension, the hub and the editor.
import {
  WEB_TOUR_ATTR_KEYS,
  type WebTourLocator,
  type WebTourStableAttrs,
} from '@/types';
import type { NameMatcher } from '@/components/widgets/GuidedLearning/components/recorder/redaction';
import { findStudentData } from './studentData';

/** The clues a fix is compared by; position and page title change with the window, so they stay out. */
export const FIX_CLUES = ['role', 'name', 'text', 'css', 'heading'] as const;

// Must match fixKey in functions/src/mcp/webTourFixes.ts.
const fnv = (s: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
};

/** Fingerprint of a locator's identifying clues. */
export function fixKey(locator: WebTourLocator | undefined): string {
  const parts: string[] = FIX_CLUES.map((k) => locator?.[k] ?? '');
  for (const k of WEB_TOUR_ATTR_KEYS) parts.push(locator?.attrs?.[k] ?? '');
  return fnv(JSON.stringify(parts));
}

/** Clues that hold words from the page, so they can hold a student's name. */
const WORDS = ['name', 'text', 'heading'] as const;
const WORD_ATTRS = ['ariaLabel', 'name'] as const;
/** Clues a site's code sets, kept from a candidate unless they look like student data. */
const CODE_ATTRS = ['testId', 'href'] as const;

const ROLE = /^[a-z][a-z-]{0,39}$/;

const clean = (v: string | undefined, matcher: NameMatcher | null) =>
  !!v && findStudentData(v, matcher).length === 0;

/** A run's fix as it may be stored: page words come only from the step's own reviewed clues, never from a teacher's page (C15). */
export function runFixClues(
  fix: WebTourLocator,
  recorded: WebTourLocator,
  matcher: NameMatcher | null = null
): WebTourLocator {
  const out: WebTourLocator = {};
  if (fix.role && ROLE.test(fix.role)) out.role = fix.role;
  for (const k of WORDS) if (recorded[k]) out[k] = recorded[k];
  if (clean(fix.css, matcher)) out.css = fix.css;
  const attrs: WebTourStableAttrs = {};
  for (const k of WORD_ATTRS) {
    const v = recorded.attrs?.[k];
    if (v) attrs[k] = v;
  }
  for (const k of CODE_ATTRS) {
    const v = fix.attrs?.[k];
    if (clean(v, matcher)) attrs[k] = v;
  }
  if (Object.keys(attrs).length) out.attrs = attrs;
  if (fix.box) out.box = fix.box;
  return out;
}

/** A check run's fix: the admin's own run, so new page words stay unless they look like student data; the page title never does. */
export function checkFixClues(
  fix: WebTourLocator,
  recorded: WebTourLocator,
  matcher: NameMatcher | null = null
): WebTourLocator {
  const out = runFixClues(fix, recorded, matcher);
  // A word that looks like student data falls back to the step's own; one the candidate lacks goes.
  for (const k of WORDS) {
    const v = fix[k];
    const keep = clean(v, matcher) ? v : v ? recorded[k] : undefined;
    if (keep) out[k] = keep;
    else delete out[k];
  }
  const attrs: WebTourStableAttrs = { ...out.attrs };
  for (const k of WORD_ATTRS) {
    const v = fix.attrs?.[k];
    const keep = clean(v, matcher) ? v : v ? recorded.attrs?.[k] : undefined;
    if (keep) attrs[k] = keep;
    else delete attrs[k];
  }
  if (Object.keys(attrs).length) out.attrs = attrs;
  else delete out.attrs;
  return out;
}
