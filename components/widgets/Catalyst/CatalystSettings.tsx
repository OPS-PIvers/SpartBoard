import React from 'react';
import { WidgetData } from '@/types';
import { Settings2 } from 'lucide-react';

interface CatalystSettingsProps {
  widget: WidgetData;
}

export const CatalystSettings: React.FC<CatalystSettingsProps> = () => {
  return (
    <div className="flex flex-col items-center justify-center h-full p-6 text-center text-slate-500">
      <Settings2 className="w-12 h-12 mb-4 text-slate-300" />
      <h3 className="font-bold text-lg text-slate-700 mb-2">Admin Managed</h3>
      <p className="text-sm">
        Catalyst routines and categories are managed globally by administrators
        in the Feature Permissions menu.
      </p>
    </div>
  );
};
