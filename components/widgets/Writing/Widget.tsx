import React from 'react';
import type { WidgetData } from '@/types';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { WritingManager } from './components/WritingManager';

// Later PRs add the monitor and grader views beside the manager.
export const WritingWidget: React.FC<{ widget: WidgetData }> = ({ widget }) => (
  <WidgetLayout
    padding="p-0"
    contentClassName="flex-1 min-h-0"
    content={<WritingManager widget={widget} />}
  />
);
