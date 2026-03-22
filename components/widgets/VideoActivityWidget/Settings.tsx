/**
 * VideoActivityWidgetSettings — back-face settings panel.
 * Kept minimal in V1; no widget-level config knobs beyond what the
 * views themselves handle.
 */

import React from 'react';
import { PlayCircle } from 'lucide-react';
import { WidgetData } from '@/types';

export const VideoActivityWidgetSettings: React.FC<{ widget: WidgetData }> = (
  _props
) => {
  return (
    <div className="p-5 h-full flex flex-col gap-4 font-sans">
      <div className="flex items-center gap-2 text-brand-blue-dark">
        <PlayCircle className="w-5 h-5 text-brand-red-primary" />
        <span className="font-bold text-base">Video Activity Settings</span>
      </div>

      <div className="text-sm text-slate-500 leading-relaxed">
        <p>
          All activity settings (questions, timestamps, session management) are
          configured directly inside the widget.
        </p>
        <p className="mt-2">
          Flip the widget back to manage your activities, create new ones, and
          share session links with students.
        </p>
      </div>

      <div className="mt-auto bg-brand-blue-lighter/30 rounded-xl p-3 text-xs text-brand-blue-primary/70 font-medium">
        Student experience: share the session link at{' '}
        <code className="bg-brand-blue-lighter/50 px-1 rounded font-mono">
          /activity/:sessionId
        </code>
      </div>
    </div>
  );
};
