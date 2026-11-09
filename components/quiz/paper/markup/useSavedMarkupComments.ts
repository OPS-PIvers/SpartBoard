import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import {
  PAPER_MARKUP_MAX_COMMENT_CHARS,
  QUIZ_MARKUP_COMMENTS_MAX,
  type QuizConfig,
} from '@/types';
import type { AuthContextType } from '@/context/AuthContextValue';
import type { SavedMarkupComments } from './types';

type PresetAuth = Pick<
  AuthContextType,
  'savedWidgetPresets' | 'saveWidgetPreset'
>;

const EMPTY: readonly string[] = [];

const tidy = (raw: unknown): string[] => {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== 'string') continue;
    const text = v.trim().slice(0, PAPER_MARKUP_MAX_COMMENT_CHARS);
    if (text && !out.includes(text)) out.push(text);
  }
  return out.slice(0, QUIZ_MARKUP_COMMENTS_MAX);
};

/** The teacher's saved comments, read and written through the profile's `savedWidgetPresets.quiz`; `undefined` while off. */
export function useSavedMarkupComments(
  auth: PresetAuth | null | undefined,
  enabled: boolean
): SavedMarkupComments | undefined {
  const presets: PresetAuth['savedWidgetPresets'] | undefined =
    auth?.savedWidgetPresets;
  const raw = (presets?.quiz as Partial<QuizConfig> | undefined)
    ?.markupComments;
  const list = useMemo(() => (raw ? tidy(raw) : EMPTY), [raw]);
  const save = auth?.saveWidgetPreset;
  // Read after each write, so two quick changes never overwrite each other.
  const listRef = useRef<readonly string[]>(list);
  const saveRef = useRef(save);
  useLayoutEffect(() => {
    listRef.current = list;
    saveRef.current = save;
  });

  const write = useCallback((next: string[]) => {
    listRef.current = next;
    saveRef.current?.('quiz', { markupComments: next });
  }, []);

  const add = useCallback(
    (text: string) => {
      const clean = text.trim().slice(0, PAPER_MARKUP_MAX_COMMENT_CHARS);
      const now = listRef.current;
      if (
        !clean ||
        now.includes(clean) ||
        now.length >= QUIZ_MARKUP_COMMENTS_MAX
      )
        return false;
      write([...now, clean]);
      return true;
    },
    [write]
  );
  const remove = useCallback(
    (text: string) => {
      const now = listRef.current;
      if (now.includes(text)) write(now.filter((s) => s !== text));
    },
    [write]
  );
  const restore = useCallback(
    (text: string, index: number) => {
      const now = listRef.current;
      if (now.includes(text) || now.length >= QUIZ_MARKUP_COMMENTS_MAX) return;
      const next = [...now];
      next.splice(Math.min(index, next.length), 0, text);
      write(next);
    },
    [write]
  );

  return useMemo(
    () =>
      enabled && save
        ? { list, max: QUIZ_MARKUP_COMMENTS_MAX, add, remove, restore }
        : undefined,
    [enabled, save, list, add, remove, restore]
  );
}
