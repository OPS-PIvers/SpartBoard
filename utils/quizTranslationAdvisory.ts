/**
 * Assign-time translation coverage (§10). Pure and read-free: the roster and
 * `QuizMetadata` are already in memory, so this costs nothing extra.
 */

import type { QuizTranslationIndexEntry } from '@/types';

export interface TranslationCoverageContext {
  /** `QuizMetadata.translations`. */
  index?: Record<string, QuizTranslationIndexEntry>;
  /** D29: bank-slot quizzes are treated as untranslated regardless of the index. */
  hasBankSlots?: boolean;
}

export interface UncoveredLocale {
  locale: string;
  /** Names of the targeted students who asked for this language. */
  names: string[];
}

/** A locale is covered when every question is both reviewed and fresh. */
export function isLocaleCovered(
  locale: string,
  context: TranslationCoverageContext
): boolean {
  if (context.hasBankSlots) return false;
  const entry = context.index?.[locale];
  if (!entry || entry.questionCount <= 0) return false;
  return entry.reviewedCount - entry.staleCount >= entry.questionCount;
}

/** Targeted students whose language the quiz can't serve, grouped by locale. */
export function uncoveredLocalesForTargets(
  targets: readonly { name: string; language?: string }[],
  context: TranslationCoverageContext
): UncoveredLocale[] {
  const byLocale = new Map<string, string[]>();
  for (const target of targets) {
    const locale = target.language;
    if (!locale) continue;
    if (isLocaleCovered(locale, context)) continue;
    const names = byLocale.get(locale) ?? [];
    names.push(target.name);
    byLocale.set(locale, names);
  }
  return [...byLocale.entries()]
    .map(([locale, names]) => ({ locale, names }))
    .sort((a, b) => a.locale.localeCompare(b.locale));
}

/** D17 at assign time, answered from `QuizMetadata.language` with zero reads. */
export function isNonEnglishQuizSource(language: string | undefined): boolean {
  const code = language?.trim().toLowerCase();
  return !!code && !code.startsWith('en');
}

/**
 * Locales this edit introduces that the live session was never published with
 * (§10 last paragraph). Re-projection on edit is v2, so the student sees
 * English until the teacher re-publishes.
 */
export function newlyRequestedLocales(
  previousOverrides: Record<string, { language?: string }>,
  nextOverrides: Record<string, { language?: string }>,
  nameByKey?: Record<string, string>
): UncoveredLocale[] {
  const published = new Set(
    Object.values(previousOverrides)
      .map((o) => o.language)
      .filter((code): code is string => !!code)
  );
  const byLocale = new Map<string, string[]>();
  for (const [key, override] of Object.entries(nextOverrides)) {
    const locale = override.language;
    if (!locale || published.has(locale)) continue;
    const names = byLocale.get(locale) ?? [];
    names.push(nameByKey?.[key] ?? key);
    byLocale.set(locale, names);
  }
  return [...byLocale.entries()]
    .map(([locale, names]) => ({ locale, names }))
    .sort((a, b) => a.locale.localeCompare(b.locale));
}
