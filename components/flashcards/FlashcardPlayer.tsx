import React, { useEffect, useState } from 'react';
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
  FlashcardCard,
  FlashcardMode,
  FlashcardModeSettings,
  FlashcardStudyState,
  FlashcardTestType,
} from '@/types';
import {
  buildFlashcardRoundQueue,
  countMasteredFlashcards,
} from '@/utils/flashcardSchedule';
import type { FlashcardProgressAdapter } from './adapters';
import { FlashcardsMode } from './FlashcardsMode';
import { WriteMode } from './WriteMode';
import { TestMode } from './TestMode';
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

export interface FlashcardPlayerProps {
  cards: FlashcardCard[];
  termLanguage: string;
  definitionLanguage: string;
  adapter: FlashcardProgressAdapter;
  initialSettings?: Partial<FlashcardModeSettings>;
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
  allowedModes = ['flashcards', 'write', 'test'],
  theme = 'light',
  seed = 'flashcards',
  onSettingsChange,
  onBack,
}) => {
  const { t } = useTranslation();
  const dark = theme === 'present';
  const [settings, setSettings] = useState<FlashcardModeSettings>(() => ({
    ...DEFAULT_SETTINGS,
    ...initialSettings,
    testTypes:
      initialSettings?.testTypes && initialSettings.testTypes.length > 0
        ? initialSettings.testTypes
        : DEFAULT_SETTINGS.testTypes,
  }));
  const [mode, setMode] = useState<FlashcardMode>(
    allowedModes[0] ?? 'flashcards'
  );
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

  const restart = (): void => {
    const study = adapter.reset();
    rebuildQueue(study, settings, 1);
  };

  const mastered = countMasteredFlashcards(cards, session.study.cards);
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
        {session.roundCards.length === 0 ? (
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
            onRestart={restart}
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
            onRestart={restart}
          />
        ) : (
          <TestMode
            key={modeKey}
            cards={session.roundCards}
            round={session.round}
            showFirst={settings.showFirst}
            termLanguage={termLanguage}
            definitionLanguage={definitionLanguage}
            strict={settings.strict}
            testTypes={settings.testTypes}
            testCount={settings.testCount}
            dark={dark}
            onRecordBatch={recordBatch}
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
            <SettingsGroup label={t('flashcards.settings.cards')} dark={dark}>
              {adapter.showsMarks && (
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
              />
              <ToggleSetting
                label={t('flashcards.settings.shuffle')}
                checked={settings.shuffle}
                dark={dark}
                onChange={(checked) => updateSettings({ shuffle: checked })}
              />
              <ToggleSetting
                label={t('flashcards.settings.hideMastered')}
                checked={settings.hideMastered}
                dark={dark}
                onChange={(checked) =>
                  updateSettings({ hideMastered: checked })
                }
              />
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
                  dark={dark}
                  onChange={(checked) => updateSettings({ strict: checked })}
                />
              </SettingsGroup>
            )}

            {mode === 'test' && (
              <SettingsGroup label={t('flashcards.settings.test')} dark={dark}>
                {(['mc', 'fib'] satisfies FlashcardTestType[]).map((type) => {
                  const disabled = type === 'mc' && cards.length < 4;
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
                      disabled={disabled}
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
                  options={testCountOptions(cards.length).map((count) => ({
                    value: String(count),
                    label:
                      count === 'all'
                        ? t('flashcards.settings.allCount', {
                            count: cards.length,
                          })
                        : String(count),
                  }))}
                  dark={dark}
                  onChange={(value) =>
                    updateSettings({
                      testCount: value === 'all' ? 'all' : Number(value),
                    })
                  }
                />
              </SettingsGroup>
            )}

            {adapter.showsMarks && (
              <button
                type="button"
                onClick={restart}
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
  onChange: (value: string) => void;
}> = ({ label, value, options, dark, onChange }) => (
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
          className={cx(
            'flex-1 rounded-lg font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300',
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
