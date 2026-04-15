import React from 'react';
import { Medal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { QuizLeaderboardEntry } from '@/types';

interface StudentLeaderboardProps {
  entries: QuizLeaderboardEntry[];
  myPin: string;
  scoreSuffix: string;
}

const medalByRank: Record<number, string> = {
  1: 'text-amber-400',
  2: 'text-slate-300',
  3: 'text-orange-500',
};

export const StudentLeaderboard: React.FC<StudentLeaderboardProps> = ({
  entries,
  myPin,
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

  const myEntry = entries.find((entry) => entry.pin === myPin);
  const topFive = entries.slice(0, 5);
  const isMyPinInTopFive = topFive.some((entry) => entry.pin === myPin);
  const rows = isMyPinInTopFive
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
          const isMine = entry.pin === myPin;
          const showDivider = !isMyPinInTopFive && index === 4;

          return (
            <React.Fragment key={entry.pin}>
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
                  {entry.name ?? `PIN ${entry.pin}`}
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
