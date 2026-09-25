import { Info } from 'lucide-react';

interface GuidedLearningConfigurationPanelProps {
  config: Record<string, unknown>;
  onChange: (newConfig: Record<string, unknown>) => void;
}

export const GuidedLearningConfigurationPanel: React.FC<
  GuidedLearningConfigurationPanelProps
> = () => {
  return (
    <div className="space-y-6">
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
