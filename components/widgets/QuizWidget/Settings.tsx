import React, { useState } from 'react';
import { WidgetData, QuizConfig } from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { useQuizSessionTeacher } from '@/hooks/useQuizSession';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Plus,
  X,
} from 'lucide-react';

// Settings panel (back of the widget) — minimal since all management is front-facing
export const QuizWidgetSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget, addToast, rosters } = useDashboard();
  const { user } = useAuth();
  const { session, endQuizSession } = useQuizSessionTeacher(user?.uid);
  const config = widget.config as QuizConfig;
  const hasActiveSession = !!(session && session.status !== 'ended');
  const [showMembers, setShowMembers] = useState(false);

  const updateConfig = (updates: Partial<QuizConfig>) => {
    updateWidget(widget.id, { config: { ...config, ...updates } });
  };

  const plcSheetUrlInvalid =
    !!config.plcSheetUrl &&
    !config.plcSheetUrl.startsWith('https://docs.google.com/spreadsheets/');

  return (
    <div className="p-4 space-y-4 overflow-y-auto custom-scrollbar max-h-full">
      <p className="text-sm font-semibold text-white">Quiz Widget Settings</p>
      <div className="p-3 bg-blue-500/15 border border-blue-500/30 rounded-xl text-xs text-blue-300">
        All quiz management (import, edit, preview, live sessions) is available
        on the front of this widget. Flip back to access it.
      </div>
      <div>
        <label className="block text-xs text-slate-400 mb-1">
          Widget Label
        </label>
        <input
          type="text"
          value={widget.customTitle ?? ''}
          onChange={(e) =>
            updateWidget(widget.id, { customTitle: e.target.value || null })
          }
          placeholder="Quiz"
          className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
        />
      </div>

      {/* PLC / Shared Data Section */}
      <div className="border border-slate-600 rounded-xl overflow-hidden">
        <div className="px-3 py-2 bg-slate-700/50">
          <p className="text-xs font-bold text-white uppercase tracking-wider">
            PLC / Shared Data
          </p>
        </div>
        <div className="p-3 space-y-3">
          {/* PLC Mode Toggle */}
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <span className="text-xs font-semibold text-white">
                PLC Quiz Mode
              </span>
              <p className="text-xxs text-slate-400 mt-0.5">
                Share results with your PLC by exporting to a common Google
                Sheet.
              </p>
            </div>
            <input
              type="checkbox"
              checked={config.plcMode ?? false}
              onChange={(e) => updateConfig({ plcMode: e.target.checked })}
              className="w-4 h-4 rounded accent-violet-500 shrink-0 ml-2"
            />
          </label>

          {/* PLC fields — shown when PLC mode is on */}
          {config.plcMode && (
            <div className="space-y-3 pt-1">
              {/* Teacher Name */}
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Your Name
                </label>
                <input
                  type="text"
                  value={config.teacherName ?? ''}
                  onChange={(e) =>
                    updateConfig({ teacherName: e.target.value })
                  }
                  placeholder="e.g. Ms. Smith"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
                <p className="text-xxs text-slate-500 mt-0.5">
                  Appears in the &quot;Teacher&quot; column of the shared sheet
                </p>
              </div>

              {/* Period / Roster */}
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Class Period
                </label>
                {rosters.length > 0 ? (
                  <select
                    value={config.periodName ?? ''}
                    onChange={(e) =>
                      updateConfig({ periodName: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option value="">Select a class...</option>
                    {rosters.map((r) => (
                      <option key={r.id} value={r.name}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={config.periodName ?? ''}
                    onChange={(e) =>
                      updateConfig({ periodName: e.target.value })
                    }
                    placeholder="e.g. Period 3"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                )}
                <p className="text-xxs text-slate-500 mt-0.5">
                  Must match your Class widget roster name for student name
                  lookup to work
                </p>
              </div>

              {/* Shared Sheet URL */}
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Shared Google Sheet URL
                </label>
                <input
                  type="text"
                  value={config.plcSheetUrl ?? ''}
                  onChange={(e) =>
                    updateConfig({ plcSheetUrl: e.target.value })
                  }
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
                {plcSheetUrlInvalid && (
                  <div className="flex items-center gap-1 mt-1 text-yellow-400">
                    <AlertTriangle size={10} />
                    <span className="text-xxs">
                      This doesn&apos;t look like a Google Sheets URL
                    </span>
                  </div>
                )}
                <p className="text-xxs text-slate-500 mt-0.5">
                  Paste the URL of the Google Sheet shared by your PLC lead
                </p>
              </div>

              {/* PLC Members (collapsible) */}
              <div>
                <button
                  onClick={() => setShowMembers(!showMembers)}
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors"
                >
                  {showMembers ? (
                    <ChevronDown size={12} />
                  ) : (
                    <ChevronRight size={12} />
                  )}
                  <span className="font-semibold">PLC Members (optional)</span>
                </button>
                {showMembers && (
                  <div className="mt-2 space-y-2">
                    <p className="text-xxs text-slate-500">
                      For your reference only — enter the email addresses of
                      your PLC members.
                    </p>
                    {(config.plcMemberEmails ?? []).map((email, i) => (
                      <div key={i} className="flex gap-1">
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => {
                            const emails = [...(config.plcMemberEmails ?? [])];
                            emails[i] = e.target.value;
                            updateConfig({ plcMemberEmails: emails });
                          }}
                          placeholder="colleague@school.edu"
                          className="flex-1 px-2 py-1.5 bg-slate-800 border border-slate-600 rounded-lg text-white text-xs focus:outline-none focus:ring-2 focus:ring-violet-500"
                        />
                        <button
                          onClick={() => {
                            const emails = (
                              config.plcMemberEmails ?? []
                            ).filter((_, idx) => idx !== i);
                            updateConfig({ plcMemberEmails: emails });
                          }}
                          className="p-1.5 text-slate-400 hover:text-red-400 transition-colors"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() =>
                        updateConfig({
                          plcMemberEmails: [
                            ...(config.plcMemberEmails ?? []),
                            '',
                          ],
                        })
                      }
                      className="flex items-center gap-1 text-xxs text-violet-400 hover:text-violet-300 font-bold transition-colors"
                    >
                      <Plus size={10} /> Add Member
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {hasActiveSession && (
        <button
          onClick={async () => {
            await endQuizSession();
            addToast('Active session ended.', 'success');
          }}
          className="w-full py-2 bg-brand-red-primary hover:bg-brand-red-dark text-white text-sm rounded-xl transition-colors font-bold"
        >
          Force End Active Session
        </button>
      )}

      <button
        onClick={() =>
          updateWidget(widget.id, {
            config: {
              ...config,
              view: 'manager',
              selectedQuizId: null,
              selectedQuizTitle: null,
              activeLiveSessionCode: null,
              resultsSessionId: null,
            } as QuizConfig,
          })
        }
        className="w-full py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-xl transition-colors"
      >
        Reset to Manager View
      </button>
    </div>
  );
};
