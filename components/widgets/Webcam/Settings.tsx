import React from 'react';
import { WidgetData } from '@/types';

export const WebcamSettings: React.FC<{ widget: WidgetData }> = ({
  widget: _widget,
}) => {
  return (
    <div className="text-slate-500 italic text-sm">
      Camera settings are managed automatically.
    </div>
  );
};
