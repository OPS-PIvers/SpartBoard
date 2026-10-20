import React, { useMemo } from 'react';
import { Mic, Sparkles, UserX } from 'lucide-react';
import type { FlashcardSession, SpeakLanguage } from '@/types';
import { StatTile } from '@/components/common/sessionViews/StatTile';
import { SessionRow } from '@/components/common/sessionViews/SessionRow';
import { ScorePill } from '@/components/common/sessionViews/ScorePill';
import { speakSoundName } from '@/config/pronunciationSoundNames';
import {
  aggregateSpeakRows,
  buildSpeakRows,
  mostForgivenSounds,
  mostMissedSounds,
  speakClassSounds,
  speakWordsToCheck,
  type FlashcardResultRecord,
  type FlashcardSpeakRow,
} from '@/utils/flashcardResults';
import { ResultsSection, SectionEmpty } from './resultsShared';

interface FlashcardSpeakResultsProps {
  session: FlashcardSession;
  results: FlashcardResultRecord[];
  language: SpeakLanguage;
  nameFor: (studentUid: string) => string;
}

const NEVER_RAN = '—';

const SPEAK_BARS: {
  key: 'mastered' | 'inProgress' | 'notStarted';
  label: string;
  className: string;
}[] = [
  { key: 'mastered', label: 'Said well', className: 'bg-emerald-500' },
  { key: 'inProgress', label: 'In progress', className: 'bg-amber-500' },
  { key: 'notStarted', label: 'Not started', className: 'bg-slate-300' },
];

// Results copy stays English like the rest of Study results, so sound names do too.
const soundLabel = (language: SpeakLanguage, token: string): string => {
  const { name, example } = speakSoundName(language, token, 'en');
  return example ? `${name}, as in ${example}` : name;
};

const SpeakBar: React.FC<{ row: FlashcardSpeakRow }> = ({ row }) => {
  if (row.total === 0) return null;
  return (
    <div
      className="flex w-full overflow-hidden rounded-full bg-slate-100"
      style={{ height: 'min(8px, 2cqmin)' }}
      role="img"
      aria-label={SPEAK_BARS.map((bar) => `${bar.label} ${row[bar.key]}`).join(
        ', '
      )}
    >
      {SPEAK_BARS.map((bar) =>
        row[bar.key] === 0 ? null : (
          <span
            key={bar.key}
            className={bar.className}
            style={{ width: `${(row[bar.key] / row.total) * 100}%` }}
          />
        )
      )}
    </div>
  );
};

const RowText: React.FC<{
  primary: string;
  secondary?: string;
}> = ({ primary, secondary }) => (
  <div className="min-w-0 flex-1">
    <div
      className="truncate font-bold text-slate-800"
      style={{ fontSize: 'min(13px, 3.8cqmin)' }}
    >
      {primary}
    </div>
    {secondary && (
      <div
        className="truncate text-slate-500"
        style={{ fontSize: 'min(11px, 3.2cqmin)' }}
      >
        {secondary}
      </div>
    )}
  </div>
);

const Count: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = 'text-slate-700',
}) => (
  <span
    className={`font-black tabular-nums ${className}`}
    style={{ fontSize: 'min(13px, 3.8cqmin)' }}
  >
    {children}
  </span>
);

export const FlashcardSpeakResults: React.FC<FlashcardSpeakResultsProps> = ({
  session,
  results,
  language,
  nameFor,
}) => {
  const rows = useMemo(
    () => buildSpeakRows(session, results, language),
    [language, results, session]
  );
  const sortedRows = useMemo(
    () =>
      [...rows].sort(
        (a, b) =>
          Number(b.ran) - Number(a.ran) ||
          b.masteredPercent - a.masteredPercent ||
          nameFor(a.studentUid).localeCompare(nameFor(b.studentUid))
      ),
    [nameFor, rows]
  );
  const aggregate = useMemo(() => aggregateSpeakRows(rows), [rows]);
  const classSounds = useMemo(
    () => speakClassSounds(results, language),
    [language, results]
  );
  const missed = useMemo(() => mostMissedSounds(classSounds), [classSounds]);
  const forgiven = useMemo(
    () => mostForgivenSounds(classSounds),
    [classSounds]
  );
  const wordsToCheck = useMemo(
    () => speakWordsToCheck(session, results),
    [results, session]
  );
  const anyoneRan = aggregate.ran > 0;

  return (
    <div
      className="flex flex-col"
      style={{ gap: 'min(16px, 3.5cqmin)' }}
      data-testid="flashcard-speak-results"
    >
      <div className="grid grid-cols-3" style={{ gap: 'min(10px, 2.2cqmin)' }}>
        <StatTile
          icon={<Mic aria-hidden="true" />}
          tone="green"
          value={
            anyoneRan
              ? `${Math.round(aggregate.averageMasteredPercent)}%`
              : NEVER_RAN
          }
          label="Said well"
        />
        <StatTile
          icon={<Sparkles aria-hidden="true" />}
          value={aggregate.ran}
          label="Started"
        />
        <StatTile
          icon={<UserX aria-hidden="true" />}
          tone="amber"
          value={aggregate.notRan}
          label="Not started"
        />
      </div>

      {wordsToCheck.length > 0 && (
        <ResultsSection title="Words to check" count={wordsToCheck.length}>
          <SectionEmpty message="Most students who tried these missed them. Check the card's pronunciation." />
          {wordsToCheck.map((word) => (
            <SessionRow
              key={word.card.id}
              dot={{ tone: 'danger' }}
              trailing={
                <Count className="text-rose-600">
                  {word.failed}/{word.tried}
                </Count>
              }
            >
              <RowText
                primary={word.card.term}
                secondary={word.card.definition}
              />
            </SessionRow>
          ))}
        </ResultsSection>
      )}

      <ResultsSection title="Students" count={sortedRows.length}>
        {sortedRows.length === 0 ? (
          <SectionEmpty message="No student has opened this assignment yet." />
        ) : (
          sortedRows.map((row) => (
            <SessionRow
              key={row.studentUid}
              dot={{ tone: row.ran ? 'success' : 'neutral' }}
              trailing={
                row.ran ? (
                  <ScorePill score={row.masteredPercent} display="percent" />
                ) : (
                  <Count className="text-slate-400">{NEVER_RAN}</Count>
                )
              }
            >
              <div className="min-w-0 flex-1">
                <div
                  className="truncate font-bold text-slate-800"
                  style={{ fontSize: 'min(13px, 3.8cqmin)' }}
                >
                  {nameFor(row.studentUid)}
                </div>
                {row.ran && (
                  <div className="mt-1">
                    <SpeakBar row={row} />
                  </div>
                )}
                {row.ran && (
                  <div
                    className="mt-1 truncate text-slate-500"
                    style={{ fontSize: 'min(11px, 3.2cqmin)' }}
                  >
                    {SPEAK_BARS.map(
                      (bar) => `${bar.label} ${row[bar.key]}`
                    ).join(' · ')}
                  </div>
                )}
                {row.missedSounds.length > 0 && (
                  <div
                    className="truncate text-slate-600"
                    style={{ fontSize: 'min(11px, 3.2cqmin)' }}
                  >
                    <span className="font-bold">Sounds to practice:</span>{' '}
                    {row.missedSounds
                      .map(
                        (token) => speakSoundName(language, token, 'en').name
                      )
                      .join(', ')}
                  </div>
                )}
              </div>
            </SessionRow>
          ))
        )}
      </ResultsSection>

      <ResultsSection title="Sounds missed most" count={missed.length}>
        {!anyoneRan ? (
          <SectionEmpty message="No one has practiced aloud yet." />
        ) : missed.length === 0 ? (
          <SectionEmpty message="No misses recorded yet." />
        ) : (
          missed.map((sound) => (
            <SessionRow
              key={sound.token}
              trailing={
                <Count className="text-rose-600">
                  {sound.m} miss{sound.m === 1 ? '' : 'es'}
                </Count>
              }
            >
              <RowText primary={soundLabel(language, sound.token)} />
            </SessionRow>
          ))
        )}
      </ResultsSection>

      {forgiven.length > 0 && (
        <ResultsSection title="Sounds let go most" count={forgiven.length}>
          {forgiven.map((sound) => (
            <SessionRow
              key={sound.token}
              trailing={
                <Count>
                  {sound.f}/{sound.n}
                </Count>
              }
            >
              <RowText primary={soundLabel(language, sound.token)} />
            </SessionRow>
          ))}
        </ResultsSection>
      )}
    </div>
  );
};
