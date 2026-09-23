/**
 * The Quiz widget a substitute sees.
 *
 * The quiz lives in the teacher's own `users/` tree and the widget's library,
 * assignments and live sessions are all the teacher's, so a sub reads none of
 * them. What they get is the quiz the widget had open, bundled at share time
 * into the share's `keys/` collection, which only the subs the share names may
 * read (plan §3.1 A2). Launching is PR 4 (D8).
 */

import React from 'react';
import { BookOpen, Lock } from 'lucide-react';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { useShareKey } from '@/hooks/useShareContent';
import { QuizPreview } from './components/QuizPreview';
import type { QuizConfig, SubShareQuizPayload, WidgetData } from '@/types';

export const SubShareQuizWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const config = widget.config as QuizConfig;
  const { status, payload } = useShareKey<SubShareQuizPayload>(
    'quiz',
    config.selectedQuizId
  );

  if (status === 'ready' && payload) {
    return <QuizPreview quiz={payload.quiz} />;
  }
  // The board snapshot carries the title, so name the quiz even when its
  // questions did not travel.
  const title = config.selectedQuizTitle ?? 'This quiz';
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
        icon={BookOpen}
        title="Loading the quiz"
        subtitle="Reading the copy your teacher shared."
      />
    );
  }
  return (
    <ScaledEmptyState
      icon={BookOpen}
      title="No quiz"
      subtitle={`${title} did not come along with the share.`}
    />
  );
};
