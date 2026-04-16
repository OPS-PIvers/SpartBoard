/**
 * QuizAssignmentSettingsModal — edit the settings for a single assignment.
 *
 * Edits apply only to the assignment record (className, PLC fields, session
 * toggles). The quiz content is sourced from the teacher's library and cannot
 * be modified here. `sessionMode` is locked while the assignment is still
 * active or paused (mid-session mode changes are incoherent); it becomes
 * editable once the assignment is `inactive`.
 */

import React, { useState } from 'react';
import {
  X,
  ArrowLeft,
  User,
  Zap,
  Clock,
  Share2,
  AlertTriangle,
  Lock,
  Save,
  Settings as SettingsIcon,
} from 'lucide-react';
import type {
  QuizAssignment,
  QuizAssignmentSettings,
  QuizSessionMode,
  QuizSessionOptions,
  ClassRoster,
} from '@/types';
import { Toggle } from '@/components/common/Toggle';

interface QuizAssignmentSettingsModalProps {
  assignment: QuizAssignment;
  rosters: ClassRoster[];
  onClose: () => void;
  onSave: (patch: Partial<QuizAssignmentSettings>) => Promise<void> | void;
}

export const QuizAssignmentSettingsModal: React.FC<
  QuizAssignmentSettingsModalProps
> = ({ assignment, rosters, onClose, onSave }) => {
  // Mode is only editable when the assignment is inactive — changing it
  // mid-session would leave the live session in an incoherent state.
  const modeLocked = assignment.status !== 'inactive';

  const opts = assignment.sessionOptions ?? {};

  const [className, setClassName] = useState(assignment.className ?? '');
  const [sessionMode, setSessionMode] = useState<QuizSessionMode>(
    assignment.sessionMode
  );

  // Session toggles
  const [tabWarningsEnabled, setTabWarningsEnabled] = useState(
    opts.tabWarningsEnabled ?? true
  );
  const [showResultToStudent, setShowResultToStudent] = useState(
    opts.showResultToStudent ?? false
  );
  const [showCorrectAnswerToStudent, setShowCorrectAnswerToStudent] = useState(
    opts.showCorrectAnswerToStudent ?? false
  );
  const [showCorrectOnBoard, setShowCorrectOnBoard] = useState(
    opts.showCorrectOnBoard ?? false
  );
  const [speedBonusEnabled, setSpeedBonusEnabled] = useState(
    opts.speedBonusEnabled ?? false
  );
  const [streakBonusEnabled, setStreakBonusEnabled] = useState(
    opts.streakBonusEnabled ?? false
  );
  const [showPodiumBetweenQuestions, setShowPodiumBetweenQuestions] = useState(
    opts.showPodiumBetweenQuestions ?? true
  );
  const [soundEffectsEnabled, setSoundEffectsEnabled] = useState(
    opts.soundEffectsEnabled ?? false
  );

  // PLC
  const [plcMode, setPlcMode] = useState(assignment.plcMode ?? false);
  const [teacherName, setTeacherName] = useState(assignment.teacherName ?? '');
  const [selectedPeriodNames, setSelectedPeriodNames] = useState<string[]>(
    assignment.periodNames ??
      (assignment.periodName ? [assignment.periodName] : [])
  );
  const [plcSheetUrl, setPlcSheetUrl] = useState(assignment.plcSheetUrl ?? '');

  const [saving, setSaving] = useState(false);

  const plcSheetUrlInvalid =
    !!plcSheetUrl &&
    !plcSheetUrl.startsWith('https://docs.google.com/spreadsheets/');

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const sessionOptions: QuizSessionOptions = {
        tabWarningsEnabled,
        showResultToStudent,
        showCorrectAnswerToStudent,
        showCorrectOnBoard,
        speedBonusEnabled,
        streakBonusEnabled,
        showPodiumBetweenQuestions,
        soundEffectsEnabled,
      };
      // Intentionally pass empty strings (not undefined) so that clearing a
      // field actually writes '' to Firestore. Using `|| undefined` would
      // cause updateDoc to skip the field and leave the previous value in
      // place, making these settings unclearable after they've been set.
      const patch: Partial<QuizAssignmentSettings> = {
        className: className.trim(),
        sessionMode: modeLocked ? assignment.sessionMode : sessionMode,
        sessionOptions,
        plcMode,
        teacherName: teacherName.trim(),
        periodName: selectedPeriodNames[0] ?? '',
        periodNames: selectedPeriodNames,
        plcSheetUrl: plcSheetUrl.trim(),
      };
      await onSave(patch);
      onClose();
    } catch (err) {
      if (import.meta.env.DEV)
        console.error('[QuizAssignmentSettingsModal] save failed:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="absolute inset-0 z-overlay bg-brand-blue-dark/60 backdrop-blur-sm flex items-center justify-center p-4"
      data-no-drag="true"
      style={{ touchAction: 'auto' }}
    >
      <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-full">
        {/* Header */}
        <div className="bg-brand-blue-primary p-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-white">
            <SettingsIcon className="w-5 h-5" />
            <span className="font-black uppercase tracking-tight">
              Assignment Settings
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Quiz title (read-only) */}
          <div className="text-center">
            <p className="font-bold text-brand-blue-dark text-base truncate px-2">
              {assignment.quizTitle}
            </p>
            <p
              className="text-brand-blue-primary/60 font-black uppercase tracking-widest mt-1"
              style={{ fontSize: 'min(10px, 3cqmin)' }}
            >
              Edit assignment settings
            </p>
          </div>

          {/* Class label */}
          <div>
            <label className="block text-xxs font-bold text-slate-400 uppercase tracking-widest mb-1">
              Class Label
            </label>
            <input
              type="text"
              value={className}
              onChange={(e) => setClassName(e.target.value)}
              placeholder="e.g. Period 2"
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="text-xxs text-slate-400 mt-0.5">
              Shown in the archive to distinguish assignments.
            </p>
          </div>

          {/* Session mode */}
          <div className="border-t border-slate-100 pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <p
                className="text-brand-blue-primary/60 font-black uppercase tracking-widest"
                style={{ fontSize: 'min(10px, 3cqmin)' }}
              >
                Session Mode
              </p>
              {modeLocked && (
                <span className="flex items-center gap-1 text-xxs font-bold text-slate-400 uppercase tracking-widest">
                  <Lock className="w-3 h-3" />
                  Locked
                </span>
              )}
            </div>
            {modeLocked && (
              <p className="text-xxs text-slate-500 -mt-1">
                Make this assignment inactive to change its session mode.
              </p>
            )}
            <div className="grid gap-3">
              <ModeButton
                icon={<User className="w-5 h-5" />}
                title="Teacher-paced"
                desc="You control when to move to the next question."
                selected={sessionMode === 'teacher'}
                disabled={modeLocked}
                onClick={() => setSessionMode('teacher')}
              />
              <ModeButton
                icon={<Zap className="w-5 h-5" />}
                title="Auto-progress"
                desc="Moves automatically once everyone has answered."
                selected={sessionMode === 'auto'}
                disabled={modeLocked}
                onClick={() => setSessionMode('auto')}
              />
              <ModeButton
                icon={<Clock className="w-5 h-5" />}
                title="Self-paced"
                desc="Students move through questions at their own speed."
                selected={sessionMode === 'student'}
                disabled={modeLocked}
                onClick={() => setSessionMode('student')}
              />
            </div>
          </div>

          {/* Quiz Integrity */}
          <div className="border-t border-slate-100 pt-4 space-y-3">
            <p
              className="text-brand-blue-primary/60 font-black uppercase tracking-widest"
              style={{ fontSize: 'min(10px, 3cqmin)' }}
            >
              Quiz Integrity
            </p>
            <ToggleRow
              label="Tab Switch Detection"
              checked={tabWarningsEnabled}
              onChange={setTabWarningsEnabled}
              hint="Warn students who leave the quiz tab"
            />
          </div>

          {/* Answer Feedback */}
          <div className="border-t border-slate-100 pt-4 space-y-3">
            <p
              className="text-brand-blue-primary/60 font-black uppercase tracking-widest"
              style={{ fontSize: 'min(10px, 3cqmin)' }}
            >
              Answer Feedback
            </p>
            <ToggleRow
              label="Show right/wrong to students"
              checked={showResultToStudent}
              onChange={setShowResultToStudent}
              hint="Students see ✓ or ✗ after submitting"
            />
            <ToggleRow
              label="Reveal correct answer to students"
              checked={showCorrectAnswerToStudent}
              onChange={setShowCorrectAnswerToStudent}
              disabled={!showResultToStudent}
              hint="Also show what the correct answer was"
            />
            <ToggleRow
              label="Show correct answer on board"
              checked={showCorrectOnBoard}
              onChange={setShowCorrectOnBoard}
              hint="Display correct answer on the projected screen"
            />
          </div>

          {/* Gamification */}
          <div className="border-t border-slate-100 pt-4 space-y-3">
            <p
              className="text-brand-blue-primary/60 font-black uppercase tracking-widest"
              style={{ fontSize: 'min(10px, 3cqmin)' }}
            >
              Gamification
            </p>
            <ToggleRow
              label="Speed Bonus Points"
              checked={speedBonusEnabled}
              onChange={setSpeedBonusEnabled}
              hint="Up to 50% bonus for fast answers"
            />
            <ToggleRow
              label="Streak Bonuses"
              checked={streakBonusEnabled}
              onChange={setStreakBonusEnabled}
              hint="Multiplier for consecutive correct answers"
            />
            <ToggleRow
              label="Podium Between Questions"
              checked={showPodiumBetweenQuestions}
              onChange={setShowPodiumBetweenQuestions}
              hint="Show top 3 leaderboard after each question"
            />
            <ToggleRow
              label="Sound Effects"
              checked={soundEffectsEnabled}
              onChange={setSoundEffectsEnabled}
              hint="Chimes, ticks, and fanfares during the quiz"
            />
          </div>

          {/* PLC / Share with PLC */}
          <div className="border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Share2 className="w-4 h-4 text-brand-blue-primary" />
                <span className="text-sm font-bold text-brand-blue-dark">
                  Share with PLC
                </span>
              </div>
              <Toggle
                checked={plcMode}
                onChange={setPlcMode}
                size="sm"
                showLabels={true}
              />
            </div>
            <p className="text-xxs text-slate-500 mt-1">
              Export results to a shared Google Sheet for your PLC team.
            </p>

            {/* Class Periods (multi-select) — always visible */}
            <div className="mt-3">
              <label className="block text-xxs font-bold text-slate-400 uppercase tracking-widest mb-1">
                Class Periods
              </label>
              {rosters.length > 0 ? (
                <div className="space-y-1.5 max-h-36 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2">
                  {rosters.map((r) => {
                    const checked = selectedPeriodNames.includes(r.name);
                    return (
                      <label
                        key={r.id}
                        className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 rounded px-1.5 py-1"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setSelectedPeriodNames((prev) =>
                              checked
                                ? prev.filter((n) => n !== r.name)
                                : [...prev, r.name]
                            );
                          }}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-sm text-slate-800">{r.name}</span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <input
                  type="text"
                  value={selectedPeriodNames.join(', ')}
                  onChange={(e) => {
                    const names = e.target.value
                      .split(',')
                      .map((n) => n.trim())
                      .filter(Boolean);
                    setSelectedPeriodNames([...new Set(names)]);
                  }}
                  placeholder="e.g. Period 1, Period 2"
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              )}
              <p className="text-xxs text-slate-400 mt-0.5">
                Select class periods for this assignment. Students will choose
                their class when joining.
              </p>
            </div>

            {plcMode && (
              <div className="mt-3 space-y-3 bg-slate-50 rounded-xl p-3 border border-slate-100">
                <div>
                  <label className="block text-xxs font-bold text-slate-400 uppercase tracking-widest mb-1">
                    Your Name
                  </label>
                  <input
                    type="text"
                    value={teacherName}
                    onChange={(e) => setTeacherName(e.target.value)}
                    placeholder="e.g. Ms. Smith"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <p className="text-xxs text-slate-400 mt-0.5">
                    Appears in the &quot;Teacher&quot; column of the shared
                    sheet
                  </p>
                </div>

                <div>
                  <label className="block text-xxs font-bold text-slate-400 uppercase tracking-widest mb-1">
                    Shared Google Sheet URL
                  </label>
                  <input
                    type="text"
                    value={plcSheetUrl}
                    onChange={(e) => setPlcSheetUrl(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  {plcSheetUrlInvalid && (
                    <div className="flex items-center gap-1 mt-1 text-amber-600">
                      <AlertTriangle className="w-3 h-3" />
                      <span className="text-xxs">
                        This doesn&apos;t look like a Google Sheets URL
                      </span>
                    </div>
                  )}
                  <p className="text-xxs text-slate-400 mt-0.5">
                    Paste the URL of the Google Sheet shared by your PLC lead
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 p-4 shrink-0">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-4 py-2 text-brand-blue-primary hover:bg-brand-blue-lighter/40 font-bold rounded-xl transition-colors text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Cancel
          </button>
          <button
            disabled={saving}
            onClick={() => {
              void handleSave();
            }}
            className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-brand-gray-lighter disabled:cursor-not-allowed text-white font-black rounded-xl transition-all shadow-md active:scale-95 text-sm"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};

const ModeButton: React.FC<{
  icon: React.ReactNode;
  title: string;
  desc: string;
  selected?: boolean;
  disabled?: boolean;
  onClick: () => void;
}> = ({ icon, title, desc, selected, disabled, onClick }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`w-full text-left p-3 rounded-2xl border-2 transition-all flex items-start gap-3 group ${
      selected
        ? 'border-brand-blue-primary bg-brand-blue-lighter/30'
        : 'border-brand-blue-primary/10 hover:border-brand-blue-primary hover:bg-brand-blue-lighter/30'
    } ${disabled ? 'opacity-50 cursor-not-allowed hover:border-brand-blue-primary/10 hover:bg-transparent' : ''}`}
  >
    <div
      className={`p-2 rounded-xl transition-colors ${
        selected
          ? 'bg-brand-blue-primary text-white'
          : 'bg-brand-blue-lighter text-brand-blue-primary group-hover:bg-brand-blue-primary group-hover:text-white'
      }`}
    >
      {icon}
    </div>
    <div>
      <p className="font-black text-brand-blue-dark text-sm leading-tight">
        {title}
      </p>
      <p
        className="text-brand-gray-primary font-medium leading-tight mt-0.5"
        style={{ fontSize: 'min(11px, 3.25cqmin)' }}
      >
        {desc}
      </p>
    </div>
  </button>
);

const ToggleRow: React.FC<{
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
  disabled?: boolean;
}> = ({ label, checked, onChange, hint, disabled }) => (
  <div className={disabled ? 'opacity-40 pointer-events-none' : ''}>
    <div className="flex items-center justify-between">
      <span
        className="font-bold text-brand-blue-dark"
        style={{ fontSize: 'min(14px, 4cqmin)' }}
      >
        {label}
      </span>
      <Toggle checked={checked} onChange={onChange} size="sm" showLabels />
    </div>
    {hint && (
      <p
        className="text-slate-500 mt-0.5"
        style={{ fontSize: 'min(10px, 3cqmin)' }}
      >
        {hint}
      </p>
    )}
  </div>
);
