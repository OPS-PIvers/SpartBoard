import React, { useState } from 'react';
import { BUILDINGS } from '@/config/buildings';
import { BuildingSelector } from './BuildingSelector';
import {
  PollGlobalConfig,
  BuildingPollDefaults,
  PollOption,
  PollConfig,
} from '@/types';
import { Plus, Trash2, GripVertical, Type } from 'lucide-react';
import { WIDGET_DEFAULTS } from '@/config/widgetDefaults';

interface PollConfigurationPanelProps {
  config: PollGlobalConfig;
  onChange: (newConfig: PollGlobalConfig) => void;
}

const pollDefaults = WIDGET_DEFAULTS.poll.config as PollConfig | undefined;
const DEFAULT_QUESTION = pollDefaults?.question ?? 'Vote now!';
const DEFAULT_OPTIONS = pollDefaults?.options ?? [
  { id: 'opt-1', label: 'Option A', votes: 0 },
  { id: 'opt-2', label: 'Option B', votes: 0 },
];

export const PollConfigurationPanel: React.FC<PollConfigurationPanelProps> = ({
  config,
  onChange,
}) => {
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>(
    BUILDINGS[0].id
  );

  const buildingDefaults = config.buildingDefaults ?? {};
  const currentBuildingConfig: BuildingPollDefaults = buildingDefaults[
    selectedBuildingId
  ] ?? {
    buildingId: selectedBuildingId,
    question: DEFAULT_QUESTION,
    options: DEFAULT_OPTIONS,
  };

  const question: string = currentBuildingConfig.question ?? DEFAULT_QUESTION;
  const options: PollOption[] =
    currentBuildingConfig.options ?? DEFAULT_OPTIONS;

  const handleUpdateBuilding = (updates: Partial<BuildingPollDefaults>) => {
    onChange({
      ...config,
      buildingDefaults: {
        ...buildingDefaults,
        [selectedBuildingId]: {
          ...currentBuildingConfig,
          ...updates,
        },
      },
    });
  };

  const handleUpdateQuestion = (newQuestion: string) => {
    handleUpdateBuilding({ question: newQuestion });
  };

  const handleAddOption = () => {
    handleUpdateBuilding({
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

  const handleUpdateOption = (index: number, updates: Partial<PollOption>) => {
    const next = options.map((opt, i) =>
      i === index ? { ...opt, ...updates } : opt
    );
    handleUpdateBuilding({ options: next });
  };

  const handleRemoveOption = (index: number) => {
    handleUpdateBuilding({ options: options.filter((_, i) => i !== index) });
  };

  const handleResetToDefault = () => {
    handleUpdateBuilding({
      question: DEFAULT_QUESTION,
      options: DEFAULT_OPTIONS,
    });
  };

  return (
    <div className="space-y-6">
      {/* Building Selector */}
      <div>
        <label className="text-xxs font-bold text-slate-500 uppercase mb-2 block">
          Configure Building Poll Defaults
        </label>
        <BuildingSelector
          selectedId={selectedBuildingId}
          onSelect={setSelectedBuildingId}
        />
      </div>

      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-4">
        <p className="text-xxs text-slate-500 leading-tight">
          These defaults will pre-populate the Poll widget when a teacher in{' '}
          <b>{BUILDINGS.find((b) => b.id === selectedBuildingId)?.name}</b> adds
          it to their dashboard.
        </p>

        {/* Default Question */}
        <div>
          <label className="text-xxs font-bold text-slate-500 uppercase block mb-1">
            Default Question
          </label>
          <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 flex items-center gap-2 shadow-sm focus-within:ring-2 focus-within:ring-brand-blue-primary focus-within:border-brand-blue-primary transition-all">
            <Type className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              type="text"
              value={question}
              onChange={(e) => handleUpdateQuestion(e.target.value)}
              className="flex-1 text-sm border-none outline-none bg-transparent font-medium text-slate-700"
              placeholder="Enter default question..."
            />
          </div>
        </div>

        {/* Options List */}
        <div>
          <div className="flex items-center justify-between mb-2 mt-4">
            <label className="text-xxs font-bold text-slate-500 uppercase block">
              Default Options ({options.length})
            </label>
            <button
              onClick={handleResetToDefault}
              className="text-xxs text-slate-400 hover:text-slate-600 font-medium transition-colors"
            >
              Reset to defaults
            </button>
          </div>

          <div className="space-y-1.5 mb-3">
            {options.map((option, index) => (
              <div
                key={option.id}
                className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 flex items-center gap-2 shadow-sm"
              >
                <GripVertical className="w-3.5 h-3.5 text-slate-300 shrink-0" />

                <input
                  type="text"
                  value={option.label}
                  onChange={(e) =>
                    handleUpdateOption(index, { label: e.target.value })
                  }
                  className="flex-1 text-xs border-none outline-none bg-transparent font-medium"
                  placeholder="Option text..."
                />

                <button
                  onClick={() => handleRemoveOption(index)}
                  disabled={options.length <= 2}
                  className="text-red-400 hover:text-red-600 p-0.5 shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
                  title={
                    options.length <= 2
                      ? 'Minimum 2 options required'
                      : 'Remove option'
                  }
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          {/* Add option button */}
          <button
            onClick={handleAddOption}
            className="flex items-center gap-1 px-3 py-1.5 text-xxs font-bold bg-brand-blue-primary text-white rounded hover:bg-brand-blue-dark transition-colors w-full justify-center"
          >
            <Plus className="w-3 h-3" /> Add Option
          </button>
        </div>
      </div>
    </div>
  );
};
