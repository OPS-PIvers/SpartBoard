import React from 'react';
import { Medal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { QuizLeaderboardEntry } from '@/types';

interface StudentLeaderboardProps {
  entries: QuizLeaderboardEntry[];
  /** Roster PIN for anonymous joiners. Empty for SSO joiners. */
  myPin: string;
  /**
   * Auth uid for SSO `studentRole` joiners. Used as a fallback identity
   * when `myPin` is empty so SSO students still see "(you)" on their row.
   */
  myStudentUid?: string;
  scoreSuffix: string;
}

const medalByRank: Record<number, string> = {
  1: 'text-amber-400',
  2: 'text-slate-300',
  3: 'text-orange-500',
};

const matchesMe = (
  entry: QuizLeaderboardEntry,
  myPin: string,
  myStudentUid: string | undefined
): boolean => {
  if (myPin && entry.pin === myPin) return true;
  if (myStudentUid && entry.studentUid === myStudentUid) return true;
  return false;
};

export const StudentLeaderboard: React.FC<StudentLeaderboardProps> = ({
  entries,
  myPin,
  myStudentUid,
  scoreSuffix,
}) => {
  const { t } = useTranslation();

  if (entries.length === 0) {
    return (
      <div className="w-full max-w-sm p-4 bg-slate-800/70 border border-slate-700 rounded-2xl text-slate-400 text-sm">
        {t('widgets.quiz.leaderboard.emptyState')}
      </div>
    );
  }

  const myEntry = entries.find((entry) =>
    matchesMe(entry, myPin, myStudentUid)
  );
  const topFive = entries.slice(0, 5);
  const isMeInTopFive = topFive.some((entry) =>
    matchesMe(entry, myPin, myStudentUid)
  );
  const rows = isMeInTopFive
    ? topFive
    : myEntry
      ? [...entries.slice(0, 4), myEntry]
      : topFive;

  return (
    <div className="w-full max-w-sm p-4 bg-slate-800/70 border border-slate-700 rounded-2xl text-left">
      <p className="text-xs text-slate-400 uppercase tracking-widest mb-3">
        {t('widgets.quiz.leaderboard.title')}
      </p>
      <div className="space-y-2">
        {rows.map((entry, index) => {
          const isMine = matchesMe(entry, myPin, myStudentUid);
          const showDivider = !isMeInTopFive && index === 4;
          // Stable per-entry key: pin for anonymous joiners, studentUid for
          // SSO joiners. Combined with rank to disambiguate in the rare case
          // of duplicate identifiers (e.g. legacy data).
          const entryKey = `${entry.pin ?? entry.studentUid ?? 'anon'}-${entry.rank}`;

          return (
            <React.Fragment key={entryKey}>
              {showDivider && (
                <div className="text-center text-slate-500 text-xs py-1">…</div>
              )}
              <div
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${
                  isMine
                    ? 'bg-violet-500/15 border-violet-400/60'
                    : 'bg-slate-900/70 border-slate-700'
                }`}
              >
                {entry.rank <= 3 ? (
                  <Medal className={`w-4 h-4 ${medalByRank[entry.rank]}`} />
                ) : (
                  <span className="w-4 text-slate-500 text-xs font-bold text-center">
                    {entry.rank}
                  </span>
                )}
                <span className="flex-1 text-sm font-semibold text-white truncate">
                  {entry.name ?? (entry.pin ? `PIN ${entry.pin}` : 'Student')}
                  {isMine ? ` ${t('widgets.quiz.leaderboard.youSuffix')}` : ''}
                </span>
                <span className="text-amber-300 text-sm font-black">
                  {entry.score}
                  {scoreSuffix}
                </span>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
