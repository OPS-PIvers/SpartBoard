/**
 * The Video Activity widget a substitute sees.
 *
 * The teacher's library is in their own `users/` tree with the questions in
 * their Drive, and the widget's assignments and live monitor are all theirs,
 * so a sub reads none of it. What they get is the activity the widget last
 * launched or reviewed, bundled at share time into the share's `keys/`
 * collection, which only the subs the share names may read (plan §3.1 A2).
 * Launching is PR 4 (D8).
 */

import React from 'react';
import { Film, Lock } from 'lucide-react';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { useShareKey } from '@/hooks/useShareContent';
import { VideoActivityPreview } from './components/VideoActivityPreview';
import type {
  SubShareVideoActivityPayload,
  VideoActivityConfig,
  WidgetData,
} from '@/types';

export const SubShareVideoActivityWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const config = widget.config as VideoActivityConfig;
  const { status, payload } = useShareKey<SubShareVideoActivityPayload>(
    'videoActivity',
    config.selectedActivityId
  );

  if (status === 'ready' && payload) {
    return <VideoActivityPreview activity={payload.activity} />;
  }
  // The board snapshot carries the title, so name the activity even when its
  // questions did not travel.
  const title = config.selectedActivityTitle ?? 'This video activity';
  if (status === 'denied') {
    return (
      <ScaledEmptyState
        icon={Lock}
        title="Not shared with you"
        subtitle={`${title} is only for the substitutes your teacher named on the share.`}
      />
    );
  }
  if (status === 'loading') {
    return (
      <ScaledEmptyState
        icon={Film}
        title="Loading the video activity"
        subtitle="Reading the copy your teacher shared."
      />
    );
  }
  return (
    <ScaledEmptyState
      icon={Film}
      title="No video activity"
      subtitle={`${title} did not come along with the share.`}
    />
  );
};
