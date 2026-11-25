import { useCallback, useEffect, useState } from 'react';
import {
  useTabAwayTracker,
  type TabAwayState,
  type UseTabAwayTrackerArgs,
} from '@/hooks/useTabAwayTracker';
import {
  getEffectiveTabAwayRule,
  type TabAwayRule,
} from '@/utils/tabAwayLimit';
import {
  getEffectiveTabWarningThreshold,
  hasReachedTabWarningThreshold,
} from '@/utils/tabWarningThreshold';
import { logError } from '@/utils/logError';

export type TabAutoSubmitReason = 'strikes' | 'post-unlock' | 'away';

export interface TabStrikeRules {
  /** Warnings before the work is submitted. */
  threshold: number | 'off';
  /** The away clock, or null when the session has none. */
  rule: TabAwayRule | null;
}

/** One resolver for every student app: per-student override > session > default; live sessions never submit. */
export function resolveTabStrikeRules(input: {
  settings:
    | {
        tabWarningThreshold?: number | 'off';
        tabAwayLimitSeconds?: number;
        tabAwayAutoSubmit?: boolean;
      }
    | null
    | undefined;
  override?: {
    tabWarningThreshold?: number | 'off';
    tabAwayLimit?: number | 'off';
  } | null;
  live?: boolean;
}): TabStrikeRules {
  const { settings, override, live = false } = input;
  if (!settings) return { threshold: 'off', rule: null };
  const threshold = live
    ? 'off'
    : getEffectiveTabWarningThreshold(
        settings.tabWarningThreshold,
        override?.tabWarningThreshold
      );
  const rule = getEffectiveTabAwayRule(settings, override?.tabAwayLimit);
  return {
    threshold,
    rule: live && rule ? { ...rule, autoSubmit: false } : rule,
  };
}

export interface UseTabStrikePolicyArgs extends Omit<
  UseTabAwayTrackerArgs,
  'onLeave' | 'limitMs' | 'autoSubmit' | 'onAwayTooLong'
> {
  rules: TabStrikeRules;
  /** False: exits are only logged, with no warning or submit (Writing). */
  warn: boolean;
  /** The count the server holds, so another tab's warnings show too. */
  serverCount: number;
  /** A change starts the count over (a teacher reset). */
  resetKey?: unknown;
  /** Records one warning on top of `current` and resolves the new total. */
  countStrike: (current: number) => Promise<number>;
  /** A teacher-unlocked attempt: the next exit submits with no warning. */
  oneExitLeft?: boolean;
  /** Submits the work; rejects when it fails, resolves false when nothing was submitted. */
  submit: (reason: TabAutoSubmitReason) => Promise<boolean | void>;
  /** After a successful auto-submit. */
  onSubmitted?: (reason: TabAutoSubmitReason) => void | Promise<void>;
}

export interface TabStrikePolicy {
  away: TabAwayState | null;
  warningOpen: boolean;
  warningCount: number;
  rules: TabStrikeRules;
  /** The warning's return button. */
  dismiss: () => void;
  handedOff: boolean;
}

/**
 * Warning counts and auto-submit rules for every student app, on top of
 * `useTabAwayTracker`: count each exit, show the warning, submit at the
 * threshold, on a teacher-unlocked attempt, or when away too long.
 */
export function useTabStrikePolicy(
  args: UseTabStrikePolicyArgs
): TabStrikePolicy {
  const {
    rules,
    warn,
    serverCount,
    resetKey,
    countStrike,
    oneExitLeft,
    submit,
    onSubmitted,
    ...trackerArgs
  } = args;
  const [warningOpen, setWarningOpen] = useState(false);
  const [localCount, setLocalCount] = useState(0);
  const [seenReset, setSeenReset] = useState(resetKey);
  if (seenReset !== resetKey) {
    setSeenReset(resetKey);
    setLocalCount(0);
    setWarningOpen(false);
  }

  const runSubmit = useCallback(
    (reason: TabAutoSubmitReason, after?: () => void) =>
      submit(reason)
        .then((submitted) => {
          if (submitted !== false) return onSubmitted?.(reason);
        })
        .catch((err: unknown) =>
          logError('useTabStrikePolicy.submit', err, { reason })
        )
        .finally(after),
    [submit, onSubmitted]
  );

  const tracker = useTabAwayTracker({
    ...trackerArgs,
    onLeave: async () => {
      if (!warn) return false;
      let total: number;
      try {
        total = await countStrike(Math.max(serverCount, localCount));
      } catch (err) {
        logError('useTabStrikePolicy.countStrike', err);
        // Still warn when the count fails to save.
        setWarningOpen(true);
        return false;
      }
      setLocalCount(total);
      if (oneExitLeft) {
        setWarningOpen(false);
        // A failed submit (offline) must not leave detection armed-off.
        void runSubmit('post-unlock', tracker.release);
        return true;
      }
      setWarningOpen(true);
      if (!hasReachedTabWarningThreshold(total, rules.threshold)) return false;
      // A short delay lets the warning paint first.
      setTimeout(() => void runSubmit('strikes'), 100);
      return true;
    },
    onExitClosed: (outcome, ms) => {
      trackerArgs.onExitClosed?.(outcome, ms);
      if (!warn) tracker.release();
    },
    limitMs: rules.rule?.limitMs ?? null,
    autoSubmit: warn && (rules.rule?.autoSubmit ?? false),
    onAwayTooLong: () => {
      // Submit first: the tab may be hidden, where a blocking dialog would wait.
      setWarningOpen(true);
      void runSubmit('away', tracker.release);
    },
  });

  const { resume, release } = tracker;
  // A reset closes the warning without its dismiss, so re-arm detection here.
  useEffect(() => {
    release();
  }, [resetKey, release]);
  const dismiss = useCallback(() => {
    setWarningOpen(false);
    resume();
  }, [resume]);

  return {
    away: tracker.away,
    warningOpen,
    warningCount: Math.max(serverCount, localCount),
    rules,
    dismiss,
    handedOff: tracker.handedOff,
  };
}
