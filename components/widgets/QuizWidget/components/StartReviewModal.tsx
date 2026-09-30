import React, { useState } from 'react';
import { Presentation, Timer } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type {
  ClassRoster,
  QuizSessionOptions,
  ReviewBoardRankLimit,
  ReviewLaunchSettings,
} from '@/types';
import { AssignModal } from '@/components/common/library/AssignModal';
import { AssignClassPicker } from '@/components/common/AssignClassPicker';
import type { AssignClassPickerValue } from '@/components/common/AssignClassPicker.helpers';
import {
  AssignmentSettingsToggleGroup,
  ToggleRow,
} from '@/components/common/library/AssignmentSettingsToggleGroup';
import { CollapsibleSection } from '@/components/common/library/CollapsibleSection';
import { TabWarningThresholdRow } from '@/components/common/library/TabWarningRows';
import type { AssignModeOption } from '@/components/common/library/types';
import type { QuizHandRaiseMode } from '@/utils/quizHandRaise';
import {
  clampGameMinutes,
  DEFAULT_GAME_MINUTES,
  GAME_MINUTE_CHOICES,
  MAX_GAME_MINUTES,
} from '@/utils/reviewLaunch';

const RANK_LIMITS: { value: ReviewBoardRankLimit; label: string }[] = [
  { value: 5, label: 'Top 5' },
  { value: 10, label: 'Top 10' },
  { value: 'all', label: 'Everyone' },
];

export interface StartReviewModalProps {
  quizTitle: string;
  rosters: ClassRoster[];
  initialRosterIds: string[];
  initialSettings: ReviewLaunchSettings;
  /** Questions that need a teacher grade and are left out of the game. */
  skippedCount: number;
  /** Every question needs a teacher grade, so there is nothing to play. */
  nothingToPlay: boolean;
  handRaiseMode: QuizHandRaiseMode;
  readAloudAvailable: boolean;
  onClose: () => void;
  onStart: (
    settings: ReviewLaunchSettings,
    rosterIds: string[]
  ) => Promise<void>;
}

export const StartReviewModal: React.FC<StartReviewModalProps> = ({
  quizTitle,
  rosters,
  initialRosterIds,
  initialSettings,
  skippedCount,
  nothingToPlay,
  handRaiseMode,
  readAloudAvailable,
  onClose,
  onStart,
}) => {
  const { t } = useTranslation();
  const [picker, setPicker] = useState<AssignClassPickerValue>({
    rosterIds: initialRosterIds,
  });
  const [settings, setSettings] =
    useState<ReviewLaunchSettings>(initialSettings);
  const opts = settings.sessionOptions;
  const setOpts = (next: Partial<QuizSessionOptions>) =>
    setSettings((prev) => ({
      ...prev,
      sessionOptions: { ...prev.sessionOptions, ...next },
    }));
  const rankLimit = opts.boardRankLimit ?? 5;
  const isGame = settings.sessionMode === 'game';
  const gameMinutes = settings.gameMinutes ?? DEFAULT_GAME_MINUTES;
  const [customMinutes, setCustomMinutes] = useState(
    !(GAME_MINUTE_CHOICES as readonly number[]).includes(gameMinutes)
  );
  const setGameMinutes = (value: number) =>
    setSettings((prev) => ({ ...prev, gameMinutes: value }));

  const modes: AssignModeOption[] = [
    {
      id: 'paced',
      label: t('reviewStart.paced.label', 'Teacher-paced'),
      description: t(
        'reviewStart.paced.description',
        'Show one question at a time on the board. Everyone answers together and sees the results before the next one.'
      ),
      icon: Presentation,
    },
    {
      id: 'game',
      label: t('reviewStart.game.label', 'Self-paced game'),
      description: t(
        'reviewStart.game.description',
        'Students race through the questions on their own devices for a set time. Missed questions come back until time runs out.'
      ),
      icon: Timer,
    },
  ];

  return (
    <AssignModal<ReviewLaunchSettings>
      isOpen
      onClose={onClose}
      eyebrow={t('reviewStart.eyebrow', 'Start review')}
      itemTitle={quizTitle}
      modes={modes}
      selectedMode={isGame ? 'game' : 'paced'}
      onModeChange={(id) =>
        setSettings((prev) => ({
          ...prev,
          sessionMode: id === 'game' ? 'game' : 'teacher',
        }))
      }
      options={settings}
      onOptionsChange={setSettings}
      confirmLabel={t('reviewStart.confirm', 'Start')}
      confirmDisabled={nothingToPlay}
      confirmDisabledReason={t(
        'reviewStart.nothingToPlay',
        'Every question needs a teacher grade.'
      )}
      onAssign={() => onStart(settings, picker.rosterIds)}
      extraSlot={
        <div data-testid="start-review-options" className="space-y-3">
          {isGame ? (
            <div
              data-testid="review-game-length"
              className="flex flex-wrap items-center justify-between gap-2"
            >
              <span className="text-sm font-bold text-brand-blue-dark">
                {t('reviewStart.gameLength', 'Game length')}
              </span>
              <div className="flex items-center gap-2">
                <select
                  aria-label={t('reviewStart.gameLength', 'Game length')}
                  value={customMinutes ? 'custom' : String(gameMinutes)}
                  onChange={(e) => {
                    if (e.target.value === 'custom') {
                      setCustomMinutes(true);
                      return;
                    }
                    setCustomMinutes(false);
                    setGameMinutes(Number(e.target.value));
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-bold text-slate-700"
                >
                  {GAME_MINUTE_CHOICES.map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {t('reviewStart.minutes', {
                        count: minutes,
                        defaultValue: '{{count}} min',
                      })}
                    </option>
                  ))}
                  <option value="custom">
                    {t('reviewStart.customLength', 'Custom')}
                  </option>
                </select>
                {customMinutes && (
                  <input
                    type="number"
                    min={1}
                    max={MAX_GAME_MINUTES}
                    value={gameMinutes}
                    aria-label={t('reviewStart.customMinutes', 'Minutes')}
                    onChange={(e) =>
                      setGameMinutes(clampGameMinutes(Number(e.target.value)))
                    }
                    className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-sm font-bold tabular-nums text-slate-700"
                  />
                )}
              </div>
            </div>
          ) : (
            <ToggleRow
              label={t(
                'reviewStart.autoAdvance',
                'Advance automatically when everyone has answered'
              )}
              checked={settings.sessionMode === 'auto'}
              onChange={(v) =>
                setSettings((prev) => ({
                  ...prev,
                  sessionMode: v ? 'auto' : 'teacher',
                }))
              }
            />
          )}
          {skippedCount > 0 && (
            <p
              role="status"
              data-testid="review-skip-notice"
              className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800"
            >
              {skippedCount === 1
                ? t(
                    'reviewStart.skippedOne',
                    "1 question can't be auto-scored and will be skipped."
                  )
                : t('reviewStart.skippedMany', {
                    count: skippedCount,
                    defaultValue:
                      "{{count}} questions can't be auto-scored and will be skipped.",
                  })}
            </p>
          )}
          <AssignClassPicker
            collapsible
            rosters={rosters}
            value={picker}
            onChange={setPicker}
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-bold text-brand-blue-dark">
              {t('reviewStart.rankLimit', 'Leaderboard on board')}
            </span>
            <div
              role="group"
              aria-label={t('reviewStart.rankLimit', 'Leaderboard on board')}
              className="inline-flex rounded-lg border border-slate-200 bg-white overflow-hidden"
            >
              {RANK_LIMITS.map((opt) => {
                const active = rankLimit === opt.value;
                return (
                  <button
                    key={String(opt.value)}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setOpts({ boardRankLimit: opt.value })}
                    className={
                      'px-3 py-1.5 text-xs font-bold transition ' +
                      (active
                        ? 'bg-brand-blue-primary text-white'
                        : 'text-slate-600 hover:bg-slate-50')
                    }
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
          <AssignmentSettingsToggleGroup
            integritySectionLabel={t('reviewStart.integrity', 'Integrity')}
            showCopyPasteToggle
            hideShuffleQuestions={!isGame}
            options={opts}
            onOptionsChange={(next) => setOpts(next)}
            afterTabWarningsSlot={
              (opts.tabWarningsEnabled ?? true) && (
                <TabWarningThresholdRow
                  value={opts.tabWarningThreshold}
                  onChange={(next) => setOpts({ tabWarningThreshold: next })}
                />
              )
            }
            trailingSlot={
              <>
                {handRaiseMode === 'teacher-choice' && (
                  <ToggleRow
                    label={t(
                      'quizHandRaise.label',
                      'Allow students to raise a hand'
                    )}
                    checked={opts.handRaiseEnabled ?? false}
                    onChange={(v) => setOpts({ handRaiseEnabled: v })}
                  />
                )}
                {readAloudAvailable && (
                  <ToggleRow
                    label={t('quizReadAloud.label', 'Read aloud')}
                    checked={opts.readAloudAll ?? false}
                    onChange={(v) => setOpts({ readAloudAll: v })}
                  />
                )}
                <CollapsibleSection label="Gamification">
                  <ToggleRow
                    compact
                    label="Speed Bonus Points"
                    checked={opts.speedBonusEnabled ?? false}
                    onChange={(v) => setOpts({ speedBonusEnabled: v })}
                  />
                  <ToggleRow
                    compact
                    label="Streak Bonuses"
                    checked={opts.streakBonusEnabled ?? false}
                    onChange={(v) => setOpts({ streakBonusEnabled: v })}
                  />
                  {!isGame && (
                    <ToggleRow
                      compact
                      label="Podium Between Questions"
                      checked={opts.showPodiumBetweenQuestions ?? false}
                      onChange={(v) =>
                        setOpts({ showPodiumBetweenQuestions: v })
                      }
                    />
                  )}
                  <ToggleRow
                    compact
                    label="Sound Effects"
                    checked={opts.soundEffectsEnabled ?? false}
                    onChange={(v) => setOpts({ soundEffectsEnabled: v })}
                  />
                </CollapsibleSection>
              </>
            }
          />
        </div>
      }
    />
  );
};
