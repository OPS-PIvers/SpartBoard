import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  FileCheck2,
  Layers3,
  PenLine,
  RotateCcw,
  Settings,
  X,
} from 'lucide-react';
import type {
  FlashcardAnswerLogEntry,
  FlashcardCard,
  FlashcardCheckWriteEntry,
  FlashcardFlag,
  FlashcardMode,
  FlashcardModeSettings,
  FlashcardStudyState,
  FlashcardTestType,
} from '@/types';
import {
  DEFAULT_FLASHCARD_MASTERY_THRESHOLD,
  buildFlashcardRoundQueue,
  countMasteredFlashcards,
  isFlashcardMastered,
} from '@/utils/flashcardSchedule';
import type { FlashcardProgressAdapter } from './adapters';
import { FlashcardsMode } from './FlashcardsMode';
import { WriteMode } from './WriteMode';
import { TestMode } from './TestMode';
import { CheckSubmitPanel } from './PlayerPrimitives';
import { cx } from './playerUtils';

const DEFAULT_SETTINGS: FlashcardModeSettings = {
  showFirst: 'term',
  shuffle: false,
  favoritesOnly: false,
  hideMastered: false,
  strict: false,
  testTypes: ['mc', 'fib'],
  testCount: 'all',
};

interface PlayerSession {
  study: FlashcardStudyState;
  round: number;
  roundCards: FlashcardCard[];
}

export interface FlashcardCheckSubmission {
  answerLog: FlashcardAnswerLogEntry[];
  flags: FlashcardFlag[];
}

/** Check assignments: one locked mode, then a single server-graded submission. */
export interface FlashcardPlayerCheck {
  mode: FlashcardMode;
  masteryThreshold?: number;
  initialCheckLog?: Record<string, FlashcardCheckWriteEntry>;
  submitting: boolean;
  error?: string | null;
  onCheckWrite?: (cardId: string, entry: FlashcardCheckWriteEntry) => void;
  onSubmit: (submission: FlashcardCheckSubmission) => void;
}

const checkWriteEntry = (
  current: FlashcardCheckWriteEntry | undefined,
  update: Partial<FlashcardCheckWriteEntry>
): FlashcardCheckWriteEntry => {
  const entry: FlashcardCheckWriteEntry = {
    response: update.response ?? current?.response ?? '',
    attempts: update.attempts ?? current?.attempts ?? 0,
    done: update.done ?? current?.done ?? false,
  };
  if (update.flagged ?? current?.flagged) entry.flagged = true;
  return entry;
};

export interface FlashcardPlayerProps {
  cards: FlashcardCard[];
  termLanguage: string;
  definitionLanguage: string;
  adapter: FlashcardProgressAdapter;
  initialSettings?: Partial<FlashcardModeSettings>;
  /** Teacher-locked settings; only Shuffle stays editable, in Flashcards mode. */
  lockedSettings?: FlashcardModeSettings;
  check?: FlashcardPlayerCheck;
  allowedModes?: FlashcardMode[];
  theme?: 'light' | 'present';
  seed?: string;
  onSettingsChange?: (settings: FlashcardModeSettings) => void;
  onBack?: () => void;
}

const modes: Array<{
  id: FlashcardMode;
  labelKey: string;
  icon: React.ComponentType<{ style?: React.CSSProperties }>;
}> = [
  { id: 'flashcards', labelKey: 'flashcards.modes.flashcards', icon: Layers3 },
  { id: 'write', labelKey: 'flashcards.modes.write', icon: PenLine },
  { id: 'test', labelKey: 'flashcards.modes.test', icon: FileCheck2 },
];

const testCountOptions = (deckSize: number): Array<number | 'all'> => {
  if (deckSize < 5) return ['all'];
  const values: Array<number | 'all'> = [];
  for (let count = 5; count < deckSize; count += 5) values.push(count);
  values.push('all');
  return values;
};

export const FlashcardPlayer: React.FC<FlashcardPlayerProps> = ({
  cards,
  termLanguage,
  definitionLanguage,
  adapter,
  initialSettings,
  lockedSettings,
  check,
  allowedModes: requestedModes = ['flashcards', 'write', 'test'],
  theme = 'light',
  seed = 'flashcards',
  onSettingsChange,
  onBack,
}) => {
  const { t } = useTranslation();
  const dark = theme === 'present';
  const locked = Boolean(lockedSettings);
  const allowedModes = check ? [check.mode] : requestedModes;
  const masteryThreshold =
    check?.masteryThreshold ?? DEFAULT_FLASHCARD_MASTERY_THRESHOLD;
  const [settings, setSettings] = useState<FlashcardModeSettings>(() => {
    const base = { ...DEFAULT_SETTINGS, ...initialSettings, ...lockedSettings };
    return {
      ...base,
      testTypes:
        base.testTypes.length > 0 ? base.testTypes : DEFAULT_SETTINGS.testTypes,
      ...(check ? { favoritesOnly: false } : {}),
      ...(check?.mode === 'flashcards' ? { hideMastered: true } : {}),
    };
  });
  const [mode, setMode] = useState<FlashcardMode>(
    allowedModes[0] ?? 'flashcards'
  );
  const [checkLog, setCheckLog] = useState<
    Record<string, FlashcardCheckWriteEntry>
  >(() => check?.initialCheckLog ?? {});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deckSignature, setDeckSignature] = useState(() =>
    cards
      .map((card) => `${card.id}:${card.term}:${card.definition}`)
      .join('\u0000')
  );
  const [session, setSession] = useState<PlayerSession>(() => {
    const study = adapter.load();
    const queue = buildFlashcardRoundQueue({
      cards,
      progress: study.cards,
      round: study.round,
      starred: study.starred,
      favoritesOnly: settings.favoritesOnly,
      hideMastered: settings.hideMastered,
      masteryThreshold,
      shuffle: settings.shuffle,
      seed,
    });
    return { study, round: queue.round, roundCards: queue.cards };
  });

  const currentDeckSignature = cards
    .map((card) => `${card.id}:${card.term}:${card.definition}`)
    .join('\u0000');
  if (deckSignature !== currentDeckSignature) {
    setDeckSignature(currentDeckSignature);
    const queue = buildFlashcardRoundQueue({
      cards,
      progress: session.study.cards,
      round: session.round,
      starred: session.study.starred,
      favoritesOnly: settings.favoritesOnly,
      hideMastered: settings.hideMastered,
      masteryThreshold,
      shuffle: settings.shuffle,
      seed,
    });
    setSession({ ...session, round: queue.round, roundCards: queue.cards });
  }

  useEffect(() => {
    const flush = (): void => {
      void adapter.flush();
    };
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', flush);
      window.removeEventListener('pagehide', flush);
      void adapter.flush();
    };
  }, [adapter]);

  useEffect(() => {
    adapter.noteMode?.(mode);
  }, [adapter, mode]);

  const rebuildQueue = (
    study: FlashcardStudyState,
    nextSettings: FlashcardModeSettings,
    fromRound: number
  ): void => {
    const queue = buildFlashcardRoundQueue({
      cards,
      progress: study.cards,
      round: fromRound,
      starred: study.starred,
      favoritesOnly: nextSettings.favoritesOnly,
      hideMastered: nextSettings.hideMastered,
      masteryThreshold,
      shuffle: nextSettings.shuffle,
      seed,
    });
    const nextStudy = { ...study, round: queue.round };
    void adapter.flush(nextStudy);
    setSession({
      study: nextStudy,
      round: queue.round,
      roundCards: queue.cards,
    });
  };

  const updateSettings = (updates: Partial<FlashcardModeSettings>): void => {
    const next = { ...settings, ...updates };
    setSettings(next);
    onSettingsChange?.(next);
    rebuildQueue(session.study, next, session.round);
  };

  const selectMode = (nextMode: FlashcardMode): void => {
    if (mode === nextMode) return;
    void adapter.flush(session.study);
    setMode(nextMode);
    rebuildQueue(session.study, settings, session.round);
  };

  const record = (cardId: string, correct: boolean): void => {
    const study = adapter.record(cardId, correct, session.round);
    setSession((current) => ({ ...current, study }));
  };

  const recordBatch = (
    answers: Array<{ cardId: string; correct: boolean }>
  ): void => {
    let study = session.study;
    for (const answer of answers) {
      study = adapter.record(answer.cardId, answer.correct, session.round);
    }
    setSession((current) => ({ ...current, study }));
  };

  const star = (cardId: string): void => {
    const study = adapter.star(cardId);
    setSession((current) => ({ ...current, study }));
  };

  const nextRound = (): void => {
    rebuildQueue(session.study, settings, session.round + 1);
  };

  const recordTest = (test: {
    types: FlashcardTestType[];
    count: number;
    score: number;
  }): void => {
    adapter.recordTest?.(test);
  };

  const answerCheckWrite = (
    cardId: string,
    response: string,
    correct: boolean
  ): void => {
    const current = checkLog[cardId];
    const firstTry = !current || current.attempts === 0;
    const entry = checkWriteEntry(current, {
      response: firstTry ? response : current.response,
      attempts: (current?.attempts ?? 0) + 1,
      done: correct,
    });
    setCheckLog((log) => ({ ...log, [cardId]: entry }));
    check?.onCheckWrite?.(cardId, entry);
  };

  const flagCheckWrite = (cardId: string, response: string): void => {
    const current = checkLog[cardId];
    const entry = checkWriteEntry(current, {
      response: current && current.attempts > 0 ? current.response : response,
      flagged: true,
    });
    setCheckLog((log) => ({ ...log, [cardId]: entry }));
    check?.onCheckWrite?.(cardId, entry);
  };

  const submitCheck = (answerLog: FlashcardAnswerLogEntry[]): void => {
    if (!check || check.submitting) return;
    const flags = cards.flatMap((card) => {
      const entry = checkLog[card.id];
      return entry?.flagged
        ? [{ cardId: card.id, response: entry.response }]
        : [];
    });
    check.onSubmit({ answerLog, flags });
  };

  const restart = (): void => {
    const study = adapter.reset({ keepStarred: true });
    rebuildQueue(study, settings, 1);
  };

  const resetProgress = (): void => {
    const study = adapter.reset();
    rebuildQueue(study, settings, 1);
  };

  const testPool = useMemo(() => {
    const favorites = new Set(session.study.starred);
    return cards.filter(
      (card) =>
        (!settings.favoritesOnly || favorites.has(card.id)) &&
        (!settings.hideMastered ||
          !isFlashcardMastered(session.study.cards[card.id], masteryThreshold))
    );
  }, [
    cards,
    masteryThreshold,
    session.study,
    settings.favoritesOnly,
    settings.hideMastered,
  ]);

  const mastered = countMasteredFlashcards(
    cards,
    session.study.cards,
    masteryThreshold
  );
  const onRestart = adapter.canReset ? restart : undefined;
  const checkWriteDone =
    check?.mode === 'write' &&
    cards.length > 0 &&
    cards.every((card) => checkLog[card.id]?.done);
  const masteryPercent = cards.length > 0 ? (mastered / cards.length) * 100 : 0;
  const visibleModes = modes.filter((candidate) =>
    allowedModes.includes(candidate.id)
  );
  const iconSize = {
    width: 'min(17px, 4cqmin)',
    height: 'min(17px, 4cqmin)',
  };
  const modeKey = `${mode}:${session.round}:${session.roundCards.map((card) => card.id).join(',')}:${settings.showFirst}:${settings.strict}:${settings.testTypes.join(',')}:${settings.testCount}`;

  return (
    <div
      className={cx(
        'relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-transparent',
        dark ? 'text-white' : 'text-slate-900'
      )}
      style={{ containerType: 'size' }}
    >
      <header
        className={cx(
          'flex shrink-0 flex-wrap items-center border-b',
          dark
            ? 'border-white/10 bg-slate-950/35'
            : 'border-slate-200/80 bg-white/75'
        )}
        style={{
          gap: 'min(8px, 1.8cqmin)',
          padding: 'min(10px, 2.3cqmin) min(12px, 3cqmin)',
        }}
      >
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label={t('flashcards.player.back')}
            className={cx(
              'rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300',
              dark
                ? 'bg-white/10 text-white hover:bg-white/20'
                : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
            )}
            style={{ padding: 'min(8px, 1.8cqmin)' }}
          >
            <ArrowLeft aria-hidden="true" style={iconSize} />
          </button>
        )}

        <div
          className={cx(
            'flex items-center rounded-full',
            dark ? 'bg-white/10' : 'bg-slate-100'
          )}
          style={{ padding: 'min(3px, .7cqmin)', gap: 'min(2px, .5cqmin)' }}
          role="group"
          aria-label={t('flashcards.modes.label')}
        >
          {visibleModes.map((candidate) => {
            const Icon = candidate.icon;
            const selected = mode === candidate.id;
            return (
              <button
                key={candidate.id}
                type="button"
                onClick={() => selectMode(candidate.id)}
                aria-pressed={selected}
                className={cx(
                  'inline-flex items-center rounded-full font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300',
                  selected
                    ? 'bg-rose-600 text-white shadow-sm'
                    : dark
                      ? 'text-white hover:bg-white/10'
                      : 'text-slate-700 hover:bg-white'
                )}
                style={{
                  gap: 'min(5px, 1.1cqmin)',
                  padding: 'min(7px, 1.6cqmin) min(11px, 2.5cqmin)',
                  fontSize: 'min(11px, 2.9cqmin)',
                }}
              >
                <Icon
                  style={{
                    width: 'min(15px, 3.5cqmin)',
                    height: 'min(15px, 3.5cqmin)',
                  }}
                />
                {t(candidate.labelKey)}
              </button>
            );
          })}
        </div>

        <div
          className="ml-auto flex min-w-0 items-center"
          style={{ gap: 'min(9px, 2cqmin)' }}
        >
          {adapter.showsMarks && (
            <div className="min-w-[min(130px,28cqmin)]">
              <div
                className={cx(
                  'flex justify-between font-bold',
                  dark ? 'text-white/75' : 'text-slate-600'
                )}
                style={{ fontSize: 'min(10px, 2.7cqmin)' }}
              >
                <span>
                  {t('flashcards.player.round', { round: session.round })}
                </span>
                <span>
                  {t('flashcards.player.mastered', {
                    mastered,
                    total: cards.length,
                  })}
                </span>
              </div>
              <div
                className={cx(
                  'overflow-hidden rounded-full',
                  dark ? 'bg-white/15' : 'bg-slate-200'
                )}
                style={{
                  height: 'min(5px, 1.1cqmin)',
                  marginTop: 'min(4px, .8cqmin)',
                }}
                aria-label={t('flashcards.player.masteryLabel', {
                  mastered,
                  total: cards.length,
                })}
              >
                <div
                  className="h-full rounded-full bg-emerald-500 transition-[width] duration-200 motion-reduce:transition-none"
                  style={{ width: `${masteryPercent}%` }}
                />
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => setSettingsOpen((open) => !open)}
            aria-label={t('flashcards.player.settings')}
            aria-expanded={settingsOpen}
            className={cx(
              'rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300',
              settingsOpen
                ? 'bg-rose-600 text-white'
                : dark
                  ? 'bg-white/10 text-white hover:bg-white/20'
                  : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
            )}
            style={{ padding: 'min(8px, 1.8cqmin)' }}
          >
            <Settings aria-hidden="true" style={iconSize} />
          </button>
        </div>
      </header>

      <main
        className="min-h-0 flex-1 bg-transparent"
        style={{ padding: 'min(14px, 3cqmin)' }}
      >
        {check?.mode === 'write' ? (
          checkWriteDone ? (
            <CheckSubmitPanel
              mode="write"
              dark={dark}
              submitting={check.submitting}
              error={check.error}
              flaggedCount={
                cards.filter((card) => checkLog[card.id]?.flagged).length
              }
              onSubmit={() =>
                submitCheck(
                  cards.map((card) => ({
                    cardId: card.id,
                    response: checkLog[card.id]?.response ?? '',
                    attempts: Math.max(1, checkLog[card.id]?.attempts ?? 1),
                  }))
                )
              }
            />
          ) : (
            <WriteMode
              key="check-write"
              cards={[
                ...cards.filter((card) => !checkLog[card.id]?.attempts),
                ...cards.filter(
                  (card) =>
                    (checkLog[card.id]?.attempts ?? 0) > 0 &&
                    !checkLog[card.id]?.done
                ),
              ]}
              round={session.round}
              showFirst={settings.showFirst}
              termLanguage={termLanguage}
              definitionLanguage={definitionLanguage}
              strict={settings.strict}
              starred={session.study.starred}
              showMarks={adapter.showsMarks}
              dark={dark}
              onRecord={record}
              onStar={star}
              onNextRound={nextRound}
              check={{
                flaggedIds: cards
                  .filter((card) => checkLog[card.id]?.flagged)
                  .map((card) => card.id),
                onAnswer: answerCheckWrite,
                onFlag: flagCheckWrite,
              }}
            />
          )
        ) : check?.mode === 'test' ? (
          <TestMode
            key="check-test"
            cards={cards}
            round={session.round}
            showFirst={settings.showFirst}
            termLanguage={termLanguage}
            definitionLanguage={definitionLanguage}
            strict={settings.strict}
            testTypes={settings.testTypes}
            testCount={settings.testCount}
            dark={dark}
            seed={seed}
            onRecordBatch={recordBatch}
            check={{
              submitting: check.submitting,
              error: check.error,
              onSubmit: submitCheck,
            }}
          />
        ) : check?.mode === 'flashcards' && session.roundCards.length === 0 ? (
          <CheckSubmitPanel
            mode="flashcards"
            dark={dark}
            submitting={check.submitting}
            error={check.error}
            flaggedCount={0}
            onSubmit={() => submitCheck([])}
          />
        ) : session.roundCards.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center">
            <section
              className={cx(
                'max-w-lg rounded-[min(24px,5cqmin)] border',
                dark
                  ? 'border-white/15 bg-slate-950/55 text-white'
                  : 'border-slate-200 bg-white text-slate-900'
              )}
              style={{ padding: 'min(28px, 6cqmin)' }}
            >
              <h2
                className="font-black"
                style={{ fontSize: 'min(24px, 6cqmin)' }}
              >
                {t('flashcards.player.emptyTitle')}
              </h2>
              <p
                className={dark ? 'text-white/75' : 'text-slate-600'}
                style={{
                  marginTop: 'min(8px, 2cqmin)',
                  fontSize: 'min(13px, 3.4cqmin)',
                }}
              >
                {t('flashcards.player.emptyBody')}
              </p>
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="rounded-full bg-rose-600 font-black text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-300"
                style={{
                  marginTop: 'min(14px, 3cqmin)',
                  padding: 'min(10px, 2.4cqmin) min(18px, 4cqmin)',
                  fontSize: 'min(12px, 3.2cqmin)',
                }}
              >
                {t('flashcards.player.openSettings')}
              </button>
            </section>
          </div>
        ) : mode === 'flashcards' ? (
          <FlashcardsMode
            key={modeKey}
            cards={session.roundCards}
            round={session.round}
            showFirst={settings.showFirst}
            starred={session.study.starred}
            showMarks={adapter.showsMarks}
            dark={dark}
            onRecord={record}
            onStar={star}
            onNextRound={nextRound}
            onRestart={onRestart}
          />
        ) : mode === 'write' ? (
          <WriteMode
            key={modeKey}
            cards={session.roundCards}
            round={session.round}
            showFirst={settings.showFirst}
            termLanguage={termLanguage}
            definitionLanguage={definitionLanguage}
            strict={settings.strict}
            starred={session.study.starred}
            showMarks={adapter.showsMarks}
            dark={dark}
            onRecord={record}
            onStar={star}
            onNextRound={nextRound}
            onRestart={onRestart}
          />
        ) : (
          <TestMode
            key={modeKey}
            cards={testPool}
            round={session.round}
            showFirst={settings.showFirst}
            termLanguage={termLanguage}
            definitionLanguage={definitionLanguage}
            strict={settings.strict}
            testTypes={settings.testTypes}
            testCount={settings.testCount}
            dark={dark}
            seed={seed}
            onRecordBatch={recordBatch}
            onComplete={recordTest}
          />
        )}
      </main>

      {settingsOpen && (
        <aside
          className={cx(
            'absolute inset-y-0 right-0 flex w-[min(360px,88%)] flex-col border-l shadow-2xl',
            dark
              ? 'border-white/15 bg-slate-950 text-white'
              : 'border-slate-200 bg-white text-slate-900'
          )}
          style={{ zIndex: 2 }}
          aria-label={t('flashcards.settings.title')}
        >
          <div
            className="flex items-center border-b border-current/10"
            style={{ padding: 'min(14px, 3.5cqmin)' }}
          >
            <h2
              className="font-black"
              style={{ fontSize: 'min(17px, 4cqmin)' }}
            >
              {t('flashcards.settings.title')}
            </h2>
            <button
              type="button"
              onClick={() => setSettingsOpen(false)}
              aria-label={t('flashcards.settings.close')}
              className={cx(
                'ml-auto rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300',
                dark ? 'hover:bg-white/10' : 'hover:bg-slate-100'
              )}
              style={{ padding: 'min(7px, 1.5cqmin)' }}
            >
              <X aria-hidden="true" style={iconSize} />
            </button>
          </div>
          <div
            className="min-h-0 flex-1 overflow-y-auto"
            style={{ padding: 'min(14px, 3.5cqmin)' }}
          >
            {locked && (
              <p
                className={cx(
                  'rounded-xl font-bold',
                  dark
                    ? 'bg-white/10 text-white/80'
                    : 'bg-slate-100 text-slate-700'
                )}
                style={{
                  marginBottom: 'min(14px, 3cqmin)',
                  padding: 'min(10px, 2.3cqmin)',
                  fontSize: 'min(11px, 3cqmin)',
                }}
              >
                {t('flashcards.settings.lockedNote')}
              </p>
            )}
            <SettingsGroup label={t('flashcards.settings.cards')} dark={dark}>
              {adapter.showsMarks && !check && (
                <SegmentedSetting
                  label={t('flashcards.settings.study')}
                  value={settings.favoritesOnly ? 'favorites' : 'all'}
                  options={[
                    { value: 'all', label: t('flashcards.settings.all') },
                    {
                      value: 'favorites',
                      label: t('flashcards.settings.favoritesOnly'),
                    },
                  ]}
                  dark={dark}
                  onChange={(value) =>
                    updateSettings({ favoritesOnly: value === 'favorites' })
                  }
                />
              )}
              <SegmentedSetting
                label={t('flashcards.settings.showFirst')}
                value={settings.showFirst}
                options={[
                  { value: 'term', label: t('flashcards.settings.term') },
                  {
                    value: 'definition',
                    label: t('flashcards.settings.definition'),
                  },
                ]}
                dark={dark}
                onChange={(value) =>
                  updateSettings({
                    showFirst: value === 'definition' ? 'definition' : 'term',
                  })
                }
                disabled={locked}
              />
              <ToggleSetting
                label={t('flashcards.settings.shuffle')}
                checked={settings.shuffle}
                disabled={locked && mode !== 'flashcards'}
                dark={dark}
                onChange={(checked) => updateSettings({ shuffle: checked })}
              />
              {adapter.showsMarks && (
                <ToggleSetting
                  label={t('flashcards.settings.hideMastered')}
                  checked={settings.hideMastered}
                  disabled={locked}
                  dark={dark}
                  onChange={(checked) =>
                    updateSettings({ hideMastered: checked })
                  }
                />
              )}
            </SettingsGroup>

            {(mode === 'write' || mode === 'test') && (
              <SettingsGroup
                label={t('flashcards.settings.answers')}
                dark={dark}
              >
                <ToggleSetting
                  label={t('flashcards.settings.strict')}
                  description={t('flashcards.settings.strictHelp')}
                  checked={settings.strict}
                  disabled={locked}
                  dark={dark}
                  onChange={(checked) => updateSettings({ strict: checked })}
                />
              </SettingsGroup>
            )}

            {mode === 'test' && (
              <SettingsGroup label={t('flashcards.settings.test')} dark={dark}>
                {(['mc', 'fib'] satisfies FlashcardTestType[]).map((type) => {
                  const disabled = type === 'mc' && testPool.length < 4;
                  const checked = settings.testTypes.includes(type);
                  return (
                    <ToggleSetting
                      key={type}
                      label={t(
                        type === 'mc'
                          ? 'flashcards.settings.multipleChoice'
                          : 'flashcards.settings.fillBlank'
                      )}
                      description={
                        disabled
                          ? t('flashcards.settings.mcNeedsFour')
                          : undefined
                      }
                      checked={checked && !disabled}
                      disabled={disabled || locked}
                      dark={dark}
                      onChange={(nextChecked) => {
                        const nextTypes = nextChecked
                          ? [...settings.testTypes, type]
                          : settings.testTypes.filter(
                              (current) => current !== type
                            );
                        if (nextTypes.length > 0) {
                          updateSettings({
                            testTypes: [...new Set(nextTypes)],
                          });
                        }
                      }}
                    />
                  );
                })}
                <SegmentedSetting
                  label={t('flashcards.settings.questions')}
                  value={String(settings.testCount)}
                  options={testCountOptions(testPool.length).map((count) => ({
                    value: String(count),
                    label:
                      count === 'all'
                        ? t('flashcards.settings.allCount', {
                            count: testPool.length,
                          })
                        : String(count),
                  }))}
                  dark={dark}
                  disabled={locked}
                  onChange={(value) =>
                    updateSettings({
                      testCount: value === 'all' ? 'all' : Number(value),
                    })
                  }
                />
              </SettingsGroup>
            )}

            {adapter.showsMarks && adapter.canReset && (
              <button
                type="button"
                onClick={resetProgress}
                className={cx(
                  'flex w-full items-center justify-center rounded-xl border font-black transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-300',
                  dark
                    ? 'border-rose-300/30 bg-rose-400/10 text-rose-100 hover:bg-rose-400/20'
                    : 'border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100'
                )}
                style={{
                  gap: 'min(7px, 1.5cqmin)',
                  marginTop: 'min(18px, 4cqmin)',
                  padding: 'min(11px, 2.5cqmin)',
                  fontSize: 'min(12px, 3.2cqmin)',
                }}
              >
                <RotateCcw aria-hidden="true" style={iconSize} />
                {t('flashcards.settings.reset')}
              </button>
            )}
          </div>
        </aside>
      )}
    </div>
  );
};

const SettingsGroup: React.FC<{
  label: string;
  dark: boolean;
  children: React.ReactNode;
}> = ({ label, dark, children }) => (
  <section style={{ marginBottom: 'min(20px, 4.5cqmin)' }}>
    <h3
      className={cx(
        'font-black uppercase tracking-widest',
        dark ? 'text-cyan-200' : 'text-rose-700'
      )}
      style={{
        marginBottom: 'min(9px, 2cqmin)',
        fontSize: 'min(10px, 2.7cqmin)',
      }}
    >
      {label}
    </h3>
    <div className="grid" style={{ gap: 'min(10px, 2.3cqmin)' }}>
      {children}
    </div>
  </section>
);

const SegmentedSetting: React.FC<{
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  dark: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
}> = ({ label, value, options, dark, disabled = false, onChange }) => (
  <div>
    <div
      className="font-bold"
      style={{
        marginBottom: 'min(5px, 1cqmin)',
        fontSize: 'min(11px, 3cqmin)',
      }}
    >
      {label}
    </div>
    <div
      className={cx(
        'flex flex-wrap rounded-xl',
        dark ? 'bg-white/10' : 'bg-slate-100'
      )}
      style={{ gap: 'min(3px, .7cqmin)', padding: 'min(3px, .7cqmin)' }}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          disabled={disabled}
          className={cx(
            'flex-1 rounded-lg font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 disabled:cursor-not-allowed disabled:opacity-60',
            value === option.value
              ? 'bg-rose-600 text-white shadow-sm'
              : dark
                ? 'text-white hover:bg-white/10'
                : 'text-slate-700 hover:bg-white'
          )}
          style={{
            padding: 'min(7px, 1.7cqmin)',
            fontSize: 'min(10px, 2.8cqmin)',
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  </div>
);

const ToggleSetting: React.FC<{
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  dark: boolean;
  onChange: (checked: boolean) => void;
}> = ({ label, description, checked, disabled = false, dark, onChange }) => (
  <label
    className={cx(
      'flex items-center rounded-xl border',
      disabled && 'opacity-50',
      dark ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-slate-50'
    )}
    style={{ gap: 'min(10px, 2.2cqmin)', padding: 'min(10px, 2.3cqmin)' }}
  >
    <span className="min-w-0 flex-1">
      <span
        className="block font-bold"
        style={{ fontSize: 'min(11px, 3cqmin)' }}
      >
        {label}
      </span>
      {description && (
        <span
          className={cx('block', dark ? 'text-white/65' : 'text-slate-600')}
          style={{
            marginTop: 'min(2px, .5cqmin)',
            fontSize: 'min(9px, 2.5cqmin)',
          }}
        >
          {description}
        </span>
      )}
    </span>
    <input
      type="checkbox"
      className="sr-only"
      checked={checked}
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
    />
    <span
      aria-hidden="true"
      className={cx(
        'relative shrink-0 rounded-full transition-colors',
        checked ? 'bg-rose-600' : dark ? 'bg-white/20' : 'bg-slate-300'
      )}
      style={{ width: 'min(38px, 9cqmin)', height: 'min(22px, 5cqmin)' }}
    >
      <span
        className="absolute rounded-full bg-white shadow-sm transition-transform"
        style={{
          width: 'min(16px, 3.8cqmin)',
          height: 'min(16px, 3.8cqmin)',
          left: 'min(3px, .7cqmin)',
          top: 'min(3px, .7cqmin)',
          transform: checked ? 'translateX(min(16px, 3.8cqmin))' : undefined,
        }}
      />
    </span>
  </label>
);
