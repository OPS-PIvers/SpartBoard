/**
 * QuizLibraryTile — Phase 2 bento tile for the PLC Quiz Library.
 *
 * Mirrors the visual rhythm of `NotesTile`: small heading, scrollable
 * preview list, single-tap link into the full tab. Renders the most
 * recent N PLC-shared quizzes (newest-edit first) with an attribution
 * line and question count. Empty state nudges teammates to share their
 * first quiz from the QuizWidget kebab.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen, ChevronRight, Loader2 } from 'lucide-react';
import { Plc } from '@/types';
import { usePlcQuizzes } from '@/hooks/usePlcQuizzes';
import type { PlcDashboardTabId } from '../../PlcDashboard';

interface QuizLibraryTileProps {
  plc: Plc;
  onNavigateTab: (tabId: PlcDashboardTabId) => void;
}

const PREVIEW_LIMIT = 4;

export const QuizLibraryTile: React.FC<QuizLibraryTileProps> = ({
  plc,
  onNavigateTab,
}) => {
  const { t } = useTranslation();
  const { quizzes, loading } = usePlcQuizzes(plc.id);
  const preview = quizzes.slice(0, PREVIEW_LIMIT);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-4 pt-4 pb-2">
        <div className="w-7 h-7 rounded-lg bg-brand-blue-lighter flex items-center justify-center">
          <BookOpen className="w-3.5 h-3.5 text-brand-blue-primary" />
        </div>
        <h4 className="text-xxs font-bold uppercase tracking-widest text-slate-500">
          {t('plcDashboard.overview.tiles.quizLibrary.heading', {
            defaultValue: 'Quiz Library',
          })}
        </h4>
        {quizzes.length > 0 && (
          <span className="ml-auto text-xs font-bold text-slate-700">
            {quizzes.length}
          </span>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 pb-2">
        {loading ? (
          <div className="flex items-center justify-center h-full text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin" />
          </div>
        ) : preview.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-xs text-slate-500 py-2">
            <BookOpen className="w-6 h-6 text-slate-300 mb-2" />
            <p className="font-semibold text-slate-600">
              {t('plcDashboard.overview.tiles.quizLibrary.empty', {
                defaultValue: 'No shared quizzes',
              })}
            </p>
            <p className="text-xxs text-slate-400 mt-1">
              {t('plcDashboard.overview.tiles.quizLibrary.emptySubtitle', {
                defaultValue:
                  'Share a quiz from the kebab on its library card.',
              })}
            </p>
          </div>
        ) : (
          <ul className="space-y-2 py-1">
            {preview.map((quiz) => (
              <li key={quiz.id}>
                <button
                  type="button"
                  onClick={() => onNavigateTab('quizzes')}
                  className="w-full text-left px-2 py-2 rounded-lg hover:bg-brand-blue-lighter/40 focus-visible:bg-brand-blue-lighter/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40 transition-colors"
                  title={t(
                    'plcDashboard.overview.tiles.quizLibrary.rowTooltip',
                    { defaultValue: 'Open in PLC Quiz Library tab' }
                  )}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="text-xs font-bold text-slate-800 truncate">
                      {quiz.title}
                    </div>
                    <span className="shrink-0 text-xxs text-slate-400">
                      {t(
                        'plcDashboard.overview.tiles.quizLibrary.questionCount',
                        {
                          count: quiz.questionCount,
                          defaultValue: '{{count}} q',
                        }
                      )}
                    </span>
                  </div>
                  <p className="text-xxs text-slate-500 truncate mt-0.5">
                    {t('plcDashboard.overview.tiles.quizLibrary.bySharer', {
                      name: quiz.sharedByName || quiz.sharedByEmail || '—',
                      defaultValue: 'shared by {{name}}',
                    })}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        type="button"
        onClick={() => onNavigateTab('quizzes')}
        className="flex items-center justify-center gap-1.5 px-4 py-2.5 border-t border-slate-100 text-xxs font-bold uppercase tracking-wider text-brand-blue-primary hover:bg-brand-blue-lighter/40 transition-colors"
      >
        {t('plcDashboard.overview.tiles.quizLibrary.openAll', {
          defaultValue: 'Open library',
        })}
        <ChevronRight className="w-3 h-3" />
      </button>
    </div>
  );
};
