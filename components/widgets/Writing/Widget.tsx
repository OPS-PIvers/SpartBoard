import React from 'react';
import type { WidgetData, WritingConfig } from '@/types';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useWritingAssignmentSessions } from '@/hooks/useWritingAssignmentSessions';
import { WritingManager } from './components/WritingManager';
import { WritingMonitor } from './components/monitor/WritingMonitor';
import { WritingResults } from './components/results/WritingResults';

const WritingMonitorView: React.FC<{
  widget: WidgetData;
  sessionId: string;
}> = ({ widget, sessionId }) => {
  const { user } = useAuth();
  const { updateWidget } = useDashboard();
  const { records } = useWritingAssignmentSessions(user?.uid);
  const { monitorSessionId: _closed, ...config } =
    widget.config as WritingConfig;
  return (
    <WritingMonitor
      sessionId={sessionId}
      record={records.find((r) => r.id === sessionId)}
      showWordCounts={config.monitorShowWordCounts ?? false}
      onShowWordCounts={(on) =>
        updateWidget(widget.id, {
          config: { ...widget.config, monitorShowWordCounts: on },
        })
      }
      onBack={() =>
        updateWidget(widget.id, {
          config: { ...config, view: 'manager' },
        })
      }
    />
  );
};

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
  const monitorId =
    config.view === 'monitor' ? config.monitorSessionId : undefined;
  const resultsId =
    config.view === 'results' ? config.resultsSessionId : undefined;
  return (
    <WidgetLayout
      padding="p-0"
      contentClassName="flex-1 min-h-0"
      content={
        monitorId ? (
          <WritingMonitorView widget={widget} sessionId={monitorId} />
        ) : resultsId ? (
          <WritingResultsFace widget={widget} sessionId={resultsId} />
        ) : (
          <WritingManager widget={widget} />
        )
      }
    />
  );
};
