import React, { useState, useMemo } from 'react';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { WidgetData, PollConfig } from '@/types';
import { useDialog } from '@/context/useDialog';
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
  startPollSession,
  stopPollSession,
} from '@/components/poll/pollSession';

import { OptionInput } from './components/OptionInput';

export const PollSettings: React.FC<{ widget: WidgetData }> = ({ widget }) => {
  const { updateWidget, addToast, rosters, activeRosterId } = useDashboard();
  const { showConfirm } = useDialog();
  const { canAccessFeature, user } = useAuth();
  const config = (widget.config || {}) as PollConfig;
  const [showResumePopover, setShowResumePopover] = useState(false);

  const activePollSessionId = config.activePollSessionId ?? null;
  const isLive = !!activePollSessionId;

  const beginSession = async (mode: 'fresh' | 'resume') => {
    if (!user) return;
    setShowResumePopover(false);
    try {
      const next = await startPollSession(config, user.uid, mode);
      updateWidget(widget.id, { config: next });
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
      updateWidget(widget.id, { config: next });
    } catch (err) {
      console.error('[PollSettings] stopPollSession failed:', err);
      addToast('Could not stop voting. Check your connection.', 'error');
    }
  };
  const { question = 'Vote Now!' } = config;
  const options = Array.isArray(config.options) ? config.options : [];

  const activeRoster = useMemo(
    () => rosters.find((r) => r.id === activeRosterId),
    [rosters, activeRosterId]
  );

  // AI file context state
  const [fileContext, setFileContext] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  // Question local state
  // Using key={question} on input allows removing the useEffect sync
  const [localQuestion, setLocalQuestion] = useState(question);

  const saveQuestion = () => {
    if (localQuestion !== question) {
      updateWidget(widget.id, {
        config: { ...config, question: localQuestion } as PollConfig,
      });
    }
  };

  const importFromRoster = async () => {
    if (!activeRoster) {
      addToast('No active class roster selected!', 'error');
      return;
    }

    if (options.length > 0) {
      const confirmed = await showConfirm(
        'This will replace current options. Continue?',
        { title: 'Replace Options', confirmLabel: 'Replace' }
      );
      if (!confirmed) return;
    }

    const newOptions = activeRoster.students.map((s) => ({
      id: crypto.randomUUID(),
      label: `${s.firstName} ${s.lastName}`.trim(),
      votes: 0,
    }));

    updateWidget(widget.id, {
      config: { ...config, options: newOptions } as PollConfig,
    });
    addToast(`Imported ${newOptions.length} students!`, 'success');
  };

  const handleExport = () => {
    // CSV Export Logic
    // Wrap fields in quotes to handle commas/newlines
    const csvHeader = 'Option,Votes\n';
    const csvRows = options
      .map((o) => `"${o.label.replace(/"/g, '""')}",${o.votes}`)
      .join('\n');
    const csvContent = csvHeader + csvRows;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `Poll_Results_${new Date().toISOString().split('T')[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    addToast('Results exported to CSV', 'success');
  };

  const addOption = () => {
    const newOption = {
      id: crypto.randomUUID(),
      label: `Option ${options.length + 1}`,
      votes: 0,
    };
    updateWidget(widget.id, {
      config: { ...config, options: [...options, newOption] } as PollConfig,
    });
  };

  const removeOption = (index: number) => {
    const newOptions = options.filter((_, i) => i !== index);
    updateWidget(widget.id, {
      config: { ...config, options: newOptions } as PollConfig,
    });
  };

  const updateOptionLabel = (index: number, label: string) => {
    const newOptions = [...options];
    newOptions[index] = { ...newOptions[index], label };
    updateWidget(widget.id, {
      config: { ...config, options: newOptions } as PollConfig,
    });
  };

  const handleReset = async () => {
    const confirmed = await showConfirm(
      'Are you sure you want to reset the poll?',
      { title: 'Reset Poll', variant: 'warning', confirmLabel: 'Reset' }
    );
    if (!confirmed) return;
    updateWidget(widget.id, {
      config: {
        ...config,
        options: options.map((o) => ({ ...o, votes: 0 })),
      } as PollConfig,
    });
  };

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
      </div>

      {/* AI poll generator — disabled while a session is live (replacing the
          options mid-vote would desync the rules' optionCount + remap votes). */}
      {canAccessFeature('smart-poll') && (
        <fieldset
          disabled={isLive}
          className="min-w-0 m-0 border-0 p-0 disabled:opacity-50"
        >
          <SettingsLabel>Draft with AI</SettingsLabel>
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
              const newOptions = result.options.map((opt) => ({
                id: crypto.randomUUID(),
                label: opt,
                votes: 0,
              }));
              updateWidget(widget.id, {
                config: {
                  ...config,
                  question: result.question,
                  options: newOptions,
                } as PollConfig,
              });
              setLocalQuestion(result.question);
              addToast('Poll generated.', 'success');
            }}
            placeholder="e.g. Photosynthesis, Civil War, 3rd Grade Math..."
            buttonLabel="Draft with AI"
          />
        </fieldset>
      )}

      {/* Question Edit */}
      <div>
        <SettingsLabel icon={Type}>Question</SettingsLabel>
        <input
          key={question} // Force reset when prop changes
          type="text"
          value={localQuestion}
          onChange={(e) => setLocalQuestion(e.target.value)}
          onBlur={saveQuestion}
          className="w-full p-2 text-xs font-bold text-slate-700 bg-slate-100 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="Enter your question..."
        />
      </div>

      {/* Options List — locked while a session is live, because the rules pin
          optionCount at start and votes are keyed by index: editing options
          mid-vote would reject new-option votes and remap existing ones. */}
      <fieldset
        disabled={isLive}
        className="min-w-0 m-0 border-0 p-0 disabled:opacity-50"
      >
        <SettingsLabel>Options</SettingsLabel>
        {isLive && (
          <p className="text-xxs text-amber-600 font-semibold mb-2">
            Stop voting to add, remove, or rename options.
          </p>
        )}
        <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
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
      </fieldset>

      {/* Actions */}
      <div className="pt-4 border-t border-slate-100">
        <SettingsLabel>Actions</SettingsLabel>
        <div className="grid grid-cols-2 gap-3">
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
      {canAccessFeature('anonymous-join') && (
        <div className="pt-4 border-t border-slate-100">
          <SettingsLabel icon={Radio}>Live Device Voting</SettingsLabel>
          <p className="text-xxs text-slate-400 font-medium mb-3">
            Let students vote from their own devices. The board shows live
            results and a join QR while voting is open.
          </p>

          {isLive ? (
            <Button
              variant="secondary"
              onClick={handleStopClick}
              icon={<Square className="w-3.5 h-3.5" />}
            >
              Stop voting
            </Button>
          ) : showResumePopover ? (
            <div className="flex flex-col gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200">
              <p className="text-xs font-bold text-slate-600">
                A previous session exists. Resume it, or start fresh?
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
