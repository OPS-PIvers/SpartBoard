import React from 'react';
import type { WidgetData, WritingConfig } from '@/types';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { useDashboard } from '@/context/useDashboard';
import { WritingManager } from './components/WritingManager';
import { WritingResults } from './components/results/WritingResults';

const WritingResultsFace: React.FC<{
  widget: WidgetData;
  sessionId: string;
}> = ({ widget, sessionId }) => {
  const { updateWidget } = useDashboard();
  const config = widget.config as WritingConfig;
  return (
    <WritingResults
      sessionId={sessionId}
      onBack={() => {
        const { resultsSessionId: _closed, ...rest } = config;
        updateWidget(widget.id, { config: { ...rest, view: 'manager' } });
      }}
    />
  );
};

export const WritingWidget: React.FC<{ widget: WidgetData }> = ({ widget }) => {
  const config = widget.config as WritingConfig;
  const resultsId =
    config.view === 'results' ? config.resultsSessionId : undefined;
  return (
    <WidgetLayout
      padding="p-0"
      contentClassName="flex-1 min-h-0"
      content={
        resultsId ? (
          <WritingResultsFace widget={widget} sessionId={resultsId} />
        ) : (
          <WritingManager widget={widget} />
        )
      }
    />
  );
};
