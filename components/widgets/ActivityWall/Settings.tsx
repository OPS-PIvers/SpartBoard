import React from 'react';
import { WidgetData } from '@/types';

export const ActivityWallSettings: React.FC<{ widget: WidgetData }> = () => {
  return (
    <div className="p-4 text-sm text-slate-600 space-y-2">
      <p className="font-semibold text-slate-700">
        Activity management moved to the front of this widget.
      </p>
      <p>
        Use the Activity Library in the widget body to create, view, edit, and
        delete activities.
      </p>
    </div>
  );
};

export const ActivityWallAppearanceSettings: React.FC<{
  widget: WidgetData;
}> = () => {
  return (
    <div className="p-4 text-sm text-slate-600">
      This widget uses the standard window appearance controls.
    </div>
  );
};
