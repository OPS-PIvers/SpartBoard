/**
 * VideoActivityWidgetSettings — back-face settings panel.
 * Kept minimal in V1; no widget-level config knobs beyond what the
 * views themselves handle.
 */

import React from 'react';
import { PlayCircle, Settings2 } from 'lucide-react';
import { WidgetData, VideoActivityConfig } from '@/types';
import { Toggle } from '@/components/common/Toggle';
import { useDashboard } from '@/context/useDashboard';

export const VideoActivityWidgetSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget } = useDashboard();
  const config = widget.config as VideoActivityConfig;

  const updateConfig = (updates: Partial<VideoActivityConfig>) => {
    updateWidget(widget.id, {
      config: { ...config, ...updates } as VideoActivityConfig,
    });
  };

  return (
    <div className="p-5 h-full flex flex-col font-sans relative">
      <div className="flex items-center gap-2 text-brand-blue-dark mb-4 shrink-0">
        <PlayCircle className="w-5 h-5 text-brand-red-primary" />
        <span className="font-bold text-base">Video Activity Settings</span>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 pr-2 pb-4 -mr-2 space-y-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
          <div className="flex items-center gap-2 text-slate-700 mb-2">
            <Settings2 className="w-4 h-4 text-brand-blue-primary" />
            <h3 className="font-bold text-sm">Session Defaults</h3>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-bold text-slate-700 block">
                  Auto-Play Video
                </span>
                <span className="text-xs text-slate-500">
                  Video starts playing automatically when a student joins
                </span>
              </div>
              <Toggle
                checked={config.autoPlay ?? false}
                onChange={(checked) => updateConfig({ autoPlay: checked })}
                size="sm"
                showLabels={false}
              />
            </div>

            <div className="w-full h-px bg-slate-100" />

            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-bold text-slate-700 block">
                  Require Correct Answers
                </span>
                <span className="text-xs text-slate-500">
                  Students must answer correctly to resume the video
                </span>
              </div>
              <Toggle
                checked={config.requireCorrectAnswer ?? true}
                onChange={(checked) =>
                  updateConfig({ requireCorrectAnswer: checked })
                }
                size="sm"
                showLabels={false}
              />
            </div>

            <div className="w-full h-px bg-slate-100" />

            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-bold text-slate-700 block">
                  Allow Skipping
                </span>
                <span className="text-xs text-slate-500">
                  Students can skip questions without answering
                </span>
              </div>
              <Toggle
                checked={config.allowSkipping ?? false}
                onChange={(checked) => updateConfig({ allowSkipping: checked })}
                size="sm"
                showLabels={false}
              />
            </div>
          </div>
        </div>

        <div className="text-sm text-slate-500 leading-relaxed px-1">
          <p>
            Flip the widget back to manage your activities, create new ones, and
            share session links with students.
          </p>
        </div>
      </div>

      <div className="mt-2 shrink-0 bg-brand-blue-lighter/30 rounded-xl p-3 text-xs text-brand-blue-primary/70 font-medium">
        Student experience: share the session link at{' '}
        <code className="bg-brand-blue-lighter/50 px-1 rounded font-mono">
          /activity/:sessionId
        </code>
      </div>
    </div>
  );
};
