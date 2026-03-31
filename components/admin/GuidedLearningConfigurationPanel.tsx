import { InfoIcon } from 'lucide-react';

export const GuidedLearningConfigurationPanel = () => {
  return (
    <div className="space-y-6">
      <div className="bg-blue-50/50 rounded-xl p-4 flex items-start space-x-3">
        <div className="flex-shrink-0 mt-0.5">
          <InfoIcon className="w-5 h-5 text-blue-500" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-gray-900">
            Guided Learning settings are managed directly
          </p>
          <p className="text-sm text-gray-500">
            Guided Learning uses highly customizable internal sets. To manage
            its settings and content, please interact with the widget directly
            on your board as a teacher or admin.
          </p>
        </div>
      </div>
    </div>
  );
};
