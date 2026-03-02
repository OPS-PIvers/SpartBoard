import React, { useState, useMemo, useEffect } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  increment,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { WidgetData, PollConfig, DEFAULT_GLOBAL_STYLE } from '@/types';
import {
  RotateCcw,
  Plus,
  Trash2,
  Download,
  Type,
  Users,
  RefreshCw,
} from 'lucide-react';
import { Button } from '../common/Button';
import { MagicInput } from '../common/MagicInput';
import { generatePoll, GeneratedPoll } from '../../utils/ai';
import { SettingsLabel } from '../common/SettingsLabel';

import { WidgetLayout } from './WidgetLayout';

export const PollWidget: React.FC<{ widget: WidgetData }> = ({ widget }) => {
  const { updateWidget, activeDashboard } = useDashboard();
  const globalStyle = activeDashboard?.globalStyle ?? DEFAULT_GLOBAL_STYLE;
  const config = widget.config as PollConfig & { _announcementId?: string };
  const { question = 'Vote Now!', options = [], _announcementId } = config;

  // When rendered inside an announcement, votes are stored in Firestore
  // under /announcements/{id}/pollVotes/{optionIndex} so all users share
  // the same live tallies and the admin can collect results.
  const [announcementVotes, setAnnouncementVotes] = useState<
    Record<number, number>
  >({});
  const [userVoted, setUserVoted] = useState<number | null>(null);

  useEffect(() => {
    if (!_announcementId) return;
    const unsub = onSnapshot(
      collection(db, 'announcements', _announcementId, 'pollVotes'),
      (snap) => {
        const counts: Record<number, number> = {};
        snap.forEach((d) => {
          const data = d.data() as { count: number };
          counts[Number(d.id)] = data.count ?? 0;
        });
        setAnnouncementVotes(counts);
      }
    );
    return unsub;
  }, [_announcementId]);

  const vote = (index: number) => {
    if (_announcementId) {
      if (userVoted !== null) return; // one vote per session
      setUserVoted(index);
      void setDoc(
        doc(db, 'announcements', _announcementId, 'pollVotes', String(index)),
        { count: increment(1) },
        { merge: true }
      );
      return;
    }
    const newOptions = [...options];
    newOptions[index] = {
      ...newOptions[index],
      votes: newOptions[index].votes + 1,
    };
    updateWidget(widget.id, {
      config: { ...config, options: newOptions } as PollConfig,
    });
  };

  const handleReset = () => {
    if (!confirm('Are you sure you want to reset the poll?')) return;
    updateWidget(widget.id, {
      config: {
        ...config,
        options: options.map((o) => ({ ...o, votes: 0 })),
      } as PollConfig,
    });
  };

  // Merge Firestore live counts with config option labels
  const displayOptions = _announcementId
    ? options.map((o, i) => ({ ...o, votes: announcementVotes[i] ?? 0 }))
    : options;

  const total = displayOptions.reduce((sum, o) => sum + o.votes, 0);

  return (
    <WidgetLayout
      padding="p-0"
      header={
        <div
          style={{
            paddingLeft: 'min(16px, 3cqmin)',
            paddingRight: 'min(16px, 3cqmin)',
            paddingTop: 'min(16px, 3cqmin)',
            paddingBottom: 'min(8px, 1.5cqmin)',
          }}
        >
          <div
            className={`font-black uppercase text-slate-800 tracking-tight font-${globalStyle.fontFamily}`}
            style={{ fontSize: 'min(32px, 10cqmin)', lineHeight: 1.1 }}
          >
            {question}
          </div>
        </div>
      }
      content={
        <div
          className="w-full h-full overflow-y-auto custom-scrollbar flex flex-col"
          style={{
            padding: 'min(16px, 3cqmin)',
            gap: 'min(16px, 3cqmin)',
          }}
        >
          {_announcementId && userVoted !== null && (
            <div
              className="text-center text-emerald-600 font-semibold"
              style={{ fontSize: 'min(14px, 4cqmin)' }}
            >
              ✓ Vote recorded!
            </div>
          )}
          {displayOptions.map((o, i: number) => {
            const percent =
              total === 0 ? 0 : Math.round((o.votes / total) * 100);
            const isVoted = userVoted === i;

            const buttonCls = [
              'w-full text-left group',
              isVoted ? 'opacity-100' : '',
              _announcementId && userVoted !== null && !isVoted
                ? 'opacity-60'
                : '',
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <button
                key={i}
                onClick={() => {
                  vote(i);
                }}
                disabled={_announcementId !== undefined && userVoted !== null}
                className={buttonCls}
              >
                <div
                  className={`flex justify-between mb-1 uppercase tracking-wider text-slate-600 font-${globalStyle.fontFamily}`}
                  style={{ fontSize: 'min(16px, 5.5cqmin)' }}
                >
                  <span className="font-bold truncate pr-4">{o.label}</span>
                  <span className="font-mono whitespace-nowrap">
                    {o.votes} ({percent}%)
                  </span>
                </div>

                <div className="h-[min(5cqmin)] min-h-[16px] bg-slate-100 rounded-full overflow-hidden relative border border-slate-200/50">
                  <div
                    className={`h-full transition-all duration-500 shadow-[inset_0_2px_4px_rgba(255,255,255,0.3)] ${isVoted ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      }
      footer={
        !_announcementId ? (
          <div
            style={{
              paddingLeft: 'min(16px, 3cqmin)',
              paddingRight: 'min(16px, 3cqmin)',
              paddingBottom: 'min(8px, 1.5cqmin)',
            }}
          >
            <button
              onClick={handleReset}
              className="w-full flex items-center justify-center font-black uppercase text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
              style={{
                gap: 'min(8px, 2cqmin)',
                padding: 'min(8px, 1.5cqmin)',
                fontSize: 'min(14px, 4cqmin)',
              }}
            >
              <RotateCcw
                style={{
                  width: 'min(16px, 4cqmin)',
                  height: 'min(16px, 4cqmin)',
                }}
              />{' '}
              Reset Poll
            </button>
          </div>
        ) : null
      }
    />
  );
};

interface OptionInputProps {
  label: string;
  index: number;
  onSave: (index: number, val: string) => void;
}

const OptionInput: React.FC<OptionInputProps> = ({ label, index, onSave }) => {
  const [val, setVal] = useState(label);

  return (
    <input
      type="text"
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={() => onSave(index, val)}
      className="flex-1 p-2 text-xs font-medium bg-white border border-slate-200 rounded-lg outline-none focus:border-indigo-500"
      placeholder={`Option ${index + 1}`}
    />
  );
};

export const PollSettings: React.FC<{ widget: WidgetData }> = ({ widget }) => {
  const { updateWidget, addToast, rosters, activeRosterId } = useDashboard();
  const { canAccessFeature } = useAuth();
  const config = (widget.config || {}) as PollConfig;
  const { question = 'Vote Now!', options = [] } = config;

  const activeRoster = useMemo(
    () => rosters.find((r) => r.id === activeRosterId),
    [rosters, activeRosterId]
  );

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

  const importFromRoster = () => {
    if (!activeRoster) {
      addToast('No active class roster selected!', 'error');
      return;
    }

    if (
      options.length > 0 &&
      !confirm('This will replace current options. Continue?')
    ) {
      return;
    }

    const newOptions = activeRoster.students.map((s) => ({
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
    const newOption = { label: `Option ${options.length + 1}`, votes: 0 };
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

  const handleReset = () => {
    if (!confirm('Are you sure you want to reset the poll?')) return;
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
            disabled={!activeRoster}
            title={
              !activeRoster
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

      {/* Magic Generator */}
      {canAccessFeature('smart-poll') && (
        <div>
          <SettingsLabel>Magic Generator</SettingsLabel>
          <MagicInput<GeneratedPoll>
            onGenerate={generatePoll}
            onSuccess={(result) => {
              const newOptions = result.options.map((opt) => ({
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
              addToast('Poll generated magically!', 'success');
            }}
            placeholder="e.g. Photosynthesis, Civil War, 3rd Grade Math..."
            buttonLabel="Magic Poll"
          />
        </div>
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

      {/* Options List */}
      <div>
        <SettingsLabel>Options</SettingsLabel>
        <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
          {options.map((option, idx) => (
            <div key={idx} className="flex gap-2 items-center">
              <OptionInput
                key={`${option.label}-${idx}`} // Use label as key to reset internal state when external data changes
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
    </div>
  );
};
