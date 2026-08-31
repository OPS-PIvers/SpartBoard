import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { WidgetData, PollConfig, PollQuestion } from '@/types';
import { useDialog } from '@/context/useDialog';
import { getLocalIsoDate } from '@/utils/localDate';
import { logError } from '@/utils/logError';
import {
  RotateCcw,
  Plus,
  Trash2,
  Download,
  Type,
  Users,
  RefreshCw,
  Radio,
  Square,
  Check,
  Copy,
  ListOrdered,
} from 'lucide-react';
import { Button } from '@/components/common/Button';
import { MagicInput } from '@/components/common/MagicInput';
import {
  generatePoll,
  GeneratedPoll,
  buildPromptWithFileContext,
} from '@/utils/ai';
import { SettingsLabel } from '@/components/common/SettingsLabel';
import { DriveFileAttachment } from '@/components/common/DriveFileAttachment';
import {
  ensurePollJoinCode,
  startPollSession,
  stopPollSession,
} from '@/components/poll/pollSession';
import { buildPollJoinUrl } from '@/utils/pollCode';
import {
  MAX_POLL_QUESTIONS,
  clampQuestionIndex,
  getPollQuestions,
  withPollQuestions,
  withQuestionAt,
} from '@/utils/pollQuestions';

import { OptionInput } from './components/OptionInput';

export const PollSettings: React.FC<{ widget: WidgetData }> = ({ widget }) => {
  const { updateWidget, addToast, rosters, activeRosterId } = useDashboard();
  const { showConfirm } = useDialog();
  const { canAccessFeature, user } = useAuth();
  const config = useMemo(
    () => (widget.config || {}) as PollConfig,
    [widget.config]
  );
  const [showResumePopover, setShowResumePopover] = useState(false);
  const [copied, setCopied] = useState(false);

  const activePollSessionId = config.activePollSessionId ?? null;
  const isLive = !!activePollSessionId;
  const canOfferAnonymousJoin = canAccessFeature('anonymous-join');

  const questions = useMemo(() => getPollQuestions(config), [config]);

  // Editing cursor — deliberately separate from `currentQuestionIndex`, which
  // is what every joined phone is showing. Clicking a chip to fix a typo must
  // not yank the class to a different question.
  const [rawEditIndex, setRawEditIndex] = useState(
    () => config.currentQuestionIndex ?? 0
  );
  const editIndex = clampQuestionIndex(rawEditIndex, questions.length);
  const editing: PollQuestion = questions[editIndex];
  const projectedIndex = clampQuestionIndex(
    config.currentQuestionIndex,
    questions.length
  );

  const applyConfig = useCallback(
    (next: PollConfig) => updateWidget(widget.id, { config: next }),
    [updateWidget, widget.id]
  );

  const beginSession = async (mode: 'fresh' | 'resume') => {
    if (!user) return;
    setShowResumePopover(false);
    try {
      const next = await startPollSession(config, user.uid, mode);
      applyConfig(next);
    } catch (err) {
      // Surface the failure rather than leaving the teacher with a
      // half-started session and a button that silently returned to idle.
      console.error('[PollSettings] startPollSession failed:', err);
      addToast('Could not start voting. Check your connection.', 'error');
    }
  };

  const handleStartClick = () => {
    if (config.lastPollSessionId) {
      setShowResumePopover(true);
    } else {
      void beginSession('fresh');
    }
  };

  const handleStopClick = async () => {
    if (!user) return;
    try {
      const next = await stopPollSession(config, user.uid);
      applyConfig(next);
    } catch (err) {
      console.error('[PollSettings] stopPollSession failed:', err);
      addToast('Could not stop voting. Check your connection.', 'error');
    }
  };

  // Reserve the sticky join code (and its inert session doc) the first time
  // this panel renders, so the link is copyable before voting ever opens.
  const mintingRef = useRef(false);
  useEffect(() => {
    if (!canOfferAnonymousJoin || !user || config.joinCode) return;
    if (mintingRef.current) return;
    mintingRef.current = true;
    void (async () => {
      try {
        applyConfig(await ensurePollJoinCode(config, user.uid));
      } catch (err) {
        logError('PollSettings.ensureJoinCode', err);
        mintingRef.current = false;
      }
    })();
  }, [canOfferAnonymousJoin, user, config, applyConfig]);

  const joinUrl = config.joinCode ? buildPollJoinUrl(config.joinCode) : '';

  const handleCopy = () => {
    if (!joinUrl) return;
    void navigator.clipboard.writeText(joinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const options = editing.options;

  const activeRoster = useMemo(
    () => rosters.find((r) => r.id === activeRosterId),
    [rosters, activeRosterId]
  );

  // AI file context state
  const [fileContext, setFileContext] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  // Question local state, re-seeded when the editing cursor or the saved text
  // changes (adjusting state while rendering — no effect needed).
  const editKey = `${editIndex}:${editing.question}`;
  const [lastEditKey, setLastEditKey] = useState(editKey);
  const [localQuestion, setLocalQuestion] = useState(editing.question);
  if (editKey !== lastEditKey) {
    setLastEditKey(editKey);
    setLocalQuestion(editing.question);
  }

  const saveEditing = (next: Partial<PollQuestion>) => {
    applyConfig(withQuestionAt(config, editIndex, { ...editing, ...next }));
  };

  const saveQuestion = () => {
    if (localQuestion !== editing.question) {
      saveEditing({ question: localQuestion });
    }
  };

  const addQuestion = () => {
    const next = [
      ...questions,
      {
        id: crypto.randomUUID(),
        question: '',
        options: [
          { id: crypto.randomUUID(), label: 'Option A', votes: 0 },
          { id: crypto.randomUUID(), label: 'Option B', votes: 0 },
        ],
      },
    ];
    applyConfig(withPollQuestions(config, next));
    setRawEditIndex(next.length - 1);
  };

  const removeQuestion = async () => {
    if (questions.length <= 1) return;
    const confirmed = await showConfirm(
      `Delete question ${editIndex + 1} and its votes?`,
      { title: 'Delete Question', variant: 'warning', confirmLabel: 'Delete' }
    );
    if (!confirmed) return;
    applyConfig(
      withPollQuestions(
        config,
        questions.filter((_, i) => i !== editIndex)
      )
    );
    setRawEditIndex(Math.max(0, editIndex - 1));
  };

  const importFromRoster = async () => {
    if (!activeRoster) {
      addToast('No active class roster selected!', 'error');
      return;
    }

    if (options.length > 0) {
      const confirmed = await showConfirm(
        `This will replace the options on question ${editIndex + 1}. Continue?`,
        { title: 'Replace Options', confirmLabel: 'Replace' }
      );
      if (!confirmed) return;
    }

    const newOptions = activeRoster.students.map((s) => ({
      id: crypto.randomUUID(),
      label: `${s.firstName} ${s.lastName}`.trim(),
      votes: 0,
    }));

    saveEditing({ options: newOptions });
    addToast(`Imported ${newOptions.length} students!`, 'success');
  };

  const handleExport = () => {
    // CSV Export Logic
    // Wrap fields in quotes to handle commas/newlines
    const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const csvHeader = 'Question,Option,Votes\n';
    const csvRows = questions
      .flatMap((q) =>
        q.options.map(
          (o) => `${escape(q.question)},${escape(o.label)},${o.votes}`
        )
      )
      .join('\n');
    const csvContent = csvHeader + csvRows;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Poll_Results_${getLocalIsoDate()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    addToast('Results exported to CSV', 'success');
  };

  const addOption = () => {
    saveEditing({
      options: [
        ...options,
        {
          id: crypto.randomUUID(),
          label: `Option ${options.length + 1}`,
          votes: 0,
        },
      ],
    });
  };

  const removeOption = (index: number) => {
    saveEditing({ options: options.filter((_, i) => i !== index) });
  };

  const updateOptionLabel = (index: number, label: string) => {
    saveEditing({
      options: options.map((o, i) => (i === index ? { ...o, label } : o)),
    });
  };

  const handleReset = async () => {
    const confirmed = await showConfirm(
      questions.length > 1
        ? `Reset votes on all ${questions.length} questions?`
        : 'Are you sure you want to reset the poll?',
      { title: 'Reset Poll', variant: 'warning', confirmLabel: 'Reset' }
    );
    if (!confirmed) return;
    applyConfig(
      withPollQuestions(
        config,
        questions.map((q) => ({
          ...q,
          options: q.options.map((o) => ({ ...o, votes: 0 })),
        }))
      )
    );
  };

  const atQuestionLimit = questions.length >= MAX_POLL_QUESTIONS;

  return (
    <div className="space-y-6">
      {/* Import Section */}
      <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl flex flex-col gap-3">
        <div className="flex justify-between items-center">
          <SettingsLabel icon={Users} className="text-indigo-900 mb-0">
            Import from Class
          </SettingsLabel>
          <Button
            size="sm"
            variant="secondary"
            onClick={importFromRoster}
            disabled={!activeRoster || isLive}
            title={
              isLive
                ? 'Stop voting to change options'
                : !activeRoster
                  ? 'Select a class in the Classes widget'
                  : `Import ${activeRoster.name}`
            }
            icon={<RefreshCw className="w-3 h-3" />}
          >
            Import Class
          </Button>
        </div>
        {!activeRoster && (
          <div className="text-xxs text-indigo-400 font-medium">
            Tip: Select a class in the Classes widget to import student names.
          </div>
        )}
        <div className="text-xxs text-indigo-400 font-medium">
          Imported student names are visible to anyone holding the join code
          while voting is open.
        </div>
      </div>

      {/* AI poll generator — disabled while a session is live (replacing the
          options mid-vote would desync the rules' optionCounts + remap votes). */}
      {canAccessFeature('smart-poll') && (
        <fieldset
          disabled={isLive || atQuestionLimit}
          aria-labelledby={`pollwidget-ai-draft-label-${widget.id}`}
          className="min-w-0 m-0 border-0 p-0 disabled:opacity-50"
        >
          <SettingsLabel
            as="span"
            id={`pollwidget-ai-draft-label-${widget.id}`}
          >
            Draft with AI
          </SettingsLabel>
          {canAccessFeature('ai-file-context') && (
            <DriveFileAttachment
              onFileContent={(content, name) => {
                setFileContext(content);
                setFileName(name);
              }}
              className="mb-2"
            />
          )}
          <MagicInput<GeneratedPoll>
            onGenerate={(topic) => {
              return generatePoll(
                buildPromptWithFileContext(topic, fileContext, fileName)
              );
            }}
            onSuccess={(result) => {
              const drafted: PollQuestion = {
                id: crypto.randomUUID(),
                question: result.question,
                options: result.options.map((opt) => ({
                  id: crypto.randomUUID(),
                  label: opt,
                  votes: 0,
                })),
              };
              const next = [...questions, drafted];
              applyConfig(withPollQuestions(config, next));
              setRawEditIndex(next.length - 1);
              addToast('Question added.', 'success');
            }}
            placeholder="e.g. Photosynthesis, Civil War, 3rd Grade Math..."
            buttonLabel="Draft with AI"
          />
          <p className="text-xxs text-slate-400 font-medium mt-1">
            Adds one new question to the end of this poll.
          </p>
        </fieldset>
      )}

      {/* Question set — locked while a session is live, because the rules pin
          optionCounts at start and votes are keyed by question + option index:
          editing mid-vote would reject new-option votes and remap existing ones. */}
      <fieldset
        disabled={isLive}
        aria-labelledby={`pollwidget-questions-label-${widget.id}`}
        className="min-w-0 m-0 border-0 p-0 disabled:opacity-50"
      >
        <div className="flex items-center justify-between">
          <SettingsLabel
            as="span"
            icon={ListOrdered}
            id={`pollwidget-questions-label-${widget.id}`}
          >
            Questions
          </SettingsLabel>
          {questions.length > 1 && (
            <button
              onClick={() => void removeQuestion()}
              className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              title={`Delete question ${editIndex + 1}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {isLive && (
          <p className="text-xxs text-amber-600 font-semibold mb-2">
            Stop voting to add, remove, or edit questions.
          </p>
        )}
        <div className="flex flex-wrap gap-1.5">
          {questions.map((q, idx) => (
            <button
              key={q.id}
              onClick={() => setRawEditIndex(idx)}
              aria-pressed={idx === editIndex}
              aria-label={`Edit question ${idx + 1}${idx === projectedIndex ? ' (showing on the board)' : ''}`}
              title={q.question || `Question ${idx + 1}`}
              className={`relative w-8 h-8 rounded-lg text-xs font-bold transition-colors ${
                idx === editIndex
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >
              {idx + 1}
              {idx === projectedIndex && (
                <span
                  aria-hidden="true"
                  className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white"
                />
              )}
            </button>
          ))}
          <button
            onClick={addQuestion}
            disabled={atQuestionLimit}
            aria-label="Add question"
            title={
              atQuestionLimit
                ? `A poll can hold up to ${MAX_POLL_QUESTIONS} questions`
                : 'Add a question'
            }
            className="w-8 h-8 rounded-lg border border-dashed border-slate-300 text-slate-400 hover:border-indigo-500 hover:text-indigo-600 disabled:opacity-40 disabled:hover:border-slate-300 disabled:hover:text-slate-400 transition-colors flex items-center justify-center"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        <p className="text-xxs text-slate-400 font-medium mt-1.5">
          The green dot marks the question showing on the board.
        </p>

        {/* Question Edit */}
        <div className="mt-4">
          <SettingsLabel icon={Type} htmlFor={`poll-question-${widget.id}`}>
            Question {editIndex + 1}
          </SettingsLabel>
          <input
            id={`poll-question-${widget.id}`}
            type="text"
            value={localQuestion}
            onChange={(e) => setLocalQuestion(e.target.value)}
            onBlur={saveQuestion}
            className="w-full p-2 text-xs font-bold text-slate-700 bg-slate-100 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Enter your question..."
          />
        </div>

        {/* Options List */}
        <div className="mt-4">
          <SettingsLabel as="span" id={`pollwidget-options-label-${widget.id}`}>
            Options
          </SettingsLabel>
          <div
            className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-1"
            aria-labelledby={`pollwidget-options-label-${widget.id}`}
          >
            {options.map((option, idx) => (
              <div key={option.id} className="flex gap-2 items-center">
                <OptionInput
                  key={`${option.label}-${option.id}`} // Use label + id as key to reset internal state when external data changes
                  index={idx}
                  label={option.label}
                  onSave={updateOptionLabel}
                />
                <button
                  onClick={() => removeOption(idx)}
                  className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  title="Remove Option"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={addOption}
            className="mt-3 w-full py-2 flex items-center justify-center gap-2 text-xs font-bold text-slate-500 border border-dashed border-slate-300 rounded-lg hover:border-indigo-500 hover:text-indigo-600 transition-all"
          >
            <Plus className="w-3.5 h-3.5" /> Add Option
          </button>
        </div>
      </fieldset>

      {/* Actions */}
      <div className="pt-4 border-t border-slate-100">
        <SettingsLabel as="span" id={`pollwidget-actions-label-${widget.id}`}>
          Actions
        </SettingsLabel>
        <div
          className="grid grid-cols-2 gap-3"
          role="group"
          aria-labelledby={`pollwidget-actions-label-${widget.id}`}
        >
          <Button
            variant="secondary"
            onClick={handleReset}
            icon={<RotateCcw className="w-3.5 h-3.5" />}
          >
            Reset
          </Button>
          <Button
            onClick={handleExport}
            icon={<Download className="w-3.5 h-3.5" />}
          >
            Export CSV
          </Button>
        </div>
      </div>

      {/* Live Device Voting — gated by anonymous-join */}
      {canOfferAnonymousJoin && (
        <div className="pt-4 border-t border-slate-100">
          <SettingsLabel icon={Radio}>Live Device Voting</SettingsLabel>
          <p className="text-xxs text-slate-400 font-medium mb-3">
            Let students vote from their own devices. The board shows live
            results and a join code while voting is open.
          </p>

          {config.joinCode && (
            <div className="mb-3 p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-2">
                <span
                  data-testid="poll-settings-join-code"
                  className="font-mono font-black text-lg text-brand-blue-primary tracking-[0.15em]"
                >
                  {config.joinCode}
                </span>
                <span className="text-xxs font-bold uppercase tracking-wider text-slate-500">
                  {isLive ? 'Voting open' : 'Not started'}
                </span>
              </div>
              <code className="text-xxs text-slate-500 break-all">
                {joinUrl}
              </code>
              <Button
                size="sm"
                variant="secondary"
                onClick={handleCopy}
                icon={
                  copied ? (
                    <Check className="w-3 h-3" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )
                }
              >
                {copied ? 'Copied' : 'Copy link'}
              </Button>
            </div>
          )}

          {isLive ? (
            <Button
              variant="secondary"
              onClick={() => void handleStopClick()}
              icon={<Square className="w-3.5 h-3.5" />}
            >
              Stop voting
            </Button>
          ) : showResumePopover ? (
            <div className="flex flex-col gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200">
              <p className="text-xs font-bold text-slate-600">
                A previous session exists. Resume it, or start fresh?
              </p>
              <p className="text-xxs text-slate-500 font-medium">
                Starting fresh clears the tallies and issues a new join code.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="secondary"
                  onClick={() => void beginSession('resume')}
                >
                  Resume previous
                </Button>
                <Button onClick={() => void beginSession('fresh')}>
                  Start fresh
                </Button>
              </div>
              <button
                onClick={() => setShowResumePopover(false)}
                className="text-xxs text-slate-400 hover:text-slate-600 font-semibold"
              >
                Cancel
              </button>
            </div>
          ) : (
            <Button
              onClick={handleStartClick}
              icon={<Radio className="w-3.5 h-3.5" />}
            >
              Start device voting
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
