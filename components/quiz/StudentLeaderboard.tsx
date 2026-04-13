/**
 * StudentLeaderboard — reusable top-N-plus-self leaderboard view used on
 * student-facing quiz screens (review phase, submitted wait screen,
 * results screen). Reads from session.liveLeaderboard which the teacher
 * broadcasts from QuizLiveMonitor.
 *
 * Highlights the current student's row. When the student is outside the top
 * `topN`, renders top (topN - 1) + a divider + the student's own entry.
 */

import React from 'react';
import { Medal } from 'lucide-react';
import { QuizLeaderboardEntry } from '@/types';

interface StudentLeaderboardProps {
  entries: QuizLeaderboardEntry[];
  myPin: string;
  scoreSuffix: string;
  topN?: number;
}

const RANK_COLORS = [
  'text-amber-400', // 1st - gold
  'text-slate-300', // 2nd - silver
  'text-orange-400', // 3rd - bronze
];

export const StudentLeaderboard: React.FC<StudentLeaderboardProps> = ({
  entries,
  myPin,
  scoreSuffix,
  topN = 5,
}) => {
  if (!entries || entries.length === 0) {
    return (
      <div className="w-full max-w-sm p-4 bg-slate-800/60 border border-slate-700 rounded-2xl text-center">
        <p className="text-slate-400 text-xs">
          Answer a question to appear on the leaderboard.
        </p>
      </div>
    );
  }

  const myEntry = entries.find((e) => e.pin === myPin);
  const topEntries = entries.slice(0, topN);
  const isMyInTop = myEntry ? topEntries.some((e) => e.pin === myPin) : false;

  // When the student is outside the top N, reserve the last slot for their row.
  const displayEntries = isMyInTop
    ? topEntries
    : entries.slice(0, Math.max(0, topN - 1));
  const showSelfBelow = !isMyInTop && myEntry;

  return (
    <div className="w-full max-w-sm p-4 bg-slate-800/60 border border-slate-700 rounded-2xl">
      <p className="text-slate-400 text-xs uppercase tracking-widest font-semibold mb-3 text-center">
        Leaderboard
      </p>

      <div className="flex flex-col gap-2">
        {displayEntries.map((entry) => (
          <LeaderboardRow
            key={`top-${entry.pin}`}
            entry={entry}
            scoreSuffix={scoreSuffix}
            isMe={entry.pin === myPin}
          />
        ))}

        {showSelfBelow && myEntry && (
          <>
            <div className="flex items-center justify-center py-1 text-slate-600 text-xs tracking-widest">
              • • •
            </div>
            <LeaderboardRow entry={myEntry} scoreSuffix={scoreSuffix} isMe />
          </>
        )}
      </div>
    </div>
  );
};

const LeaderboardRow: React.FC<{
  entry: QuizLeaderboardEntry;
  scoreSuffix: string;
  isMe: boolean;
}> = ({ entry, scoreSuffix, isMe }) => {
  const medalColor = RANK_COLORS[entry.rank - 1];
  const showMedal = entry.rank <= 3;

  return (
    <div
      className={`flex items-center gap-3 px-3 py-2 rounded-xl border transition ${
        isMe
          ? 'bg-violet-500/20 border-violet-500/50'
          : 'bg-slate-900/40 border-slate-700/50'
      }`}
    >
      <div className="w-6 flex items-center justify-center">
        {showMedal ? (
          <Medal className={`w-5 h-5 ${medalColor}`} />
        ) : (
          <span className="text-slate-500 text-xs font-bold">{entry.rank}</span>
        )}
      </div>
      <span
        className={`flex-1 text-sm font-semibold truncate ${
          isMe ? 'text-white' : 'text-slate-200'
        }`}
      >
        {entry.name ?? `PIN ${entry.pin}`}
        {isMe && (
          <span className="ml-2 text-xs text-violet-300 font-normal">
            (you)
          </span>
        )}
      </span>
      <span
        className={`font-mono font-bold text-sm ${
          isMe ? 'text-violet-200' : 'text-slate-300'
        }`}
      >
        {entry.score}
        <span className="text-xs ml-0.5">{scoreSuffix.trim()}</span>
      </span>
    </div>
  );
};
