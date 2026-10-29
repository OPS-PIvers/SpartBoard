import type { BaseSessionOptions, FocusLevel, StudentOverride } from '@/types';

/** Global feature that gates copy, paste and print blocking and fullscreen (CHROME_EXTENSION.md F14). */
export const PAGE_PROTECTIONS_FEATURE = 'focus-sessions' as const;

export const FOCUS_LEVELS: readonly FocusLevel[] = [
  'monitor',
  'redirect',
  'lock',
];

export const isFocusLevel = (v: unknown): v is FocusLevel =>
  typeof v === 'string' && (FOCUS_LEVELS as readonly string[]).includes(v);

type ProtectionOptions = Pick<
  BaseSessionOptions,
  'blockCopyPaste' | 'blockPrint' | 'focusLevel'
>;

/** Session fields stamped at assign time; with the flag print follows copy and paste, without it neither key is written. */
export function pageProtectionSessionFields(
  flagOn: boolean,
  options: ProtectionOptions
): Pick<BaseSessionOptions, 'blockPrint' | 'focusLevel'> {
  if (!flagOn) return {};
  return {
    blockPrint: options.blockCopyPaste === true,
    ...(isFocusLevel(options.focusLevel)
      ? { focusLevel: options.focusLevel }
      : {}),
  };
}

/** Video Activity options bag: drops the protection keys without the flag; with it print follows copy and paste. */
export function withPageProtectionGate<T extends ProtectionOptions>(
  flagOn: boolean,
  options: T
): T {
  if (flagOn)
    return { ...options, blockPrint: options.blockCopyPaste === true };
  const rest = { ...options };
  delete rest.blockCopyPaste;
  delete rest.blockPrint;
  delete rest.focusLevel;
  return rest;
}

/** Whether a session asks for fullscreen; only with Focus mode on. */
export const sessionRequiresFullscreen = (
  o: Pick<BaseSessionOptions, 'focusLevel' | 'tabWarningsEnabled'>
): boolean => o.focusLevel === 'lock' && o.tabWarningsEnabled !== false;

export interface PageProtections {
  blockClipboard: boolean;
  blockPrint: boolean;
  fullscreen: boolean;
}

/** What the student page enforces: the per-student override wins over the session for copy, paste and print. */
export function effectivePageProtections(
  session: Pick<
    BaseSessionOptions,
    'blockCopyPaste' | 'blockPrint' | 'focusLevel' | 'tabWarningsEnabled'
  >,
  override?: Pick<StudentOverride, 'blockCopyPaste'>
): PageProtections {
  const forced = override?.blockCopyPaste;
  return {
    blockClipboard:
      typeof forced === 'boolean' ? forced : session.blockCopyPaste === true,
    blockPrint:
      typeof forced === 'boolean' ? forced : session.blockPrint === true,
    fullscreen: sessionRequiresFullscreen(session),
  };
}
