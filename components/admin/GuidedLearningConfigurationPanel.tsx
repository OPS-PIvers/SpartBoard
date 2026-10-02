import { useId } from 'react';
import { Info } from 'lucide-react';
import type { GuidedLearningGlobalConfig, TourAutopilotPolicy } from '@/types';
import { resolveTourAutopilotPolicy } from '@/components/tours/tourSession';

interface GuidedLearningConfigurationPanelProps {
  config: Record<string, unknown>;
  onChange: (newConfig: Record<string, unknown>) => void;
}

const POLICIES: { value: TourAutopilotPolicy; label: string; help: string }[] =
  [
    {
      value: 'tour-safe',
      label: 'Tour-safe',
      help: 'Autopilot never clicks delete, assign, share, publish or settings. You click those.',
    },
    {
      value: 'destructive-only',
      label: 'Destructive only',
      help: 'Autopilot clicks everything except delete and clear.',
    },
    {
      value: 'confirm',
      label: 'Ask first',
      help: 'Autopilot clicks everything, and asks before delete, assign, share or publish.',
    },
  ];

export const GuidedLearningConfigurationPanel: React.FC<
  GuidedLearningConfigurationPanelProps
> = ({ config, onChange }) => {
  const selectId = useId();
  const policy = resolveTourAutopilotPolicy([
    { widgetType: 'guided-learning', config },
  ]);
  const help = POLICIES.find((p) => p.value === policy)?.help;
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <label
          className="block text-sm font-bold text-slate-700"
          htmlFor={selectId}
        >
          Live tour Autopilot
        </label>
        <select
          id={selectId}
          value={policy}
          onChange={(e) =>
            onChange({
              ...config,
              tourAutopilotPolicy: e.target
                .value as GuidedLearningGlobalConfig['tourAutopilotPolicy'],
            })
          }
          className="w-full px-3 py-2 border border-slate-200 bg-white rounded-xl text-sm focus:ring-2 focus:ring-brand-blue-primary focus:outline-none"
        >
          {POLICIES.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-slate-500">{help}</p>
      </div>
      <div className="bg-blue-50/50 rounded-xl p-4 flex items-start space-x-3">
        <div className="flex-shrink-0 mt-0.5">
          <Info className="w-5 h-5 text-blue-500" />
        </div>
        <p className="text-sm font-medium text-gray-900">
          Managed in the widget.
        </p>
      </div>
    </div>
  );
};
