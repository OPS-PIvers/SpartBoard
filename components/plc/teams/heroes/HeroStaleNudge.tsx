// The quiet "Newer results" line a lead sees under a stale pinned hero (T6).

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock } from 'lucide-react';
import type { Plc } from '@/types';
import type { ResolvedTeamLayout } from '@/utils/teamLayout';
import { useAuth } from '@/context/useAuth';
import { logError } from '@/utils/logError';
import { TextLink } from '@/components/plc/redesignMockup/ui';
import { heroPinner } from './heroPin';
import {
  readNudgeDismissed,
  showLatestHero,
  writeNudgeDismissed,
  type NewerHeroData,
} from './heroStaleness';
import { useNewerHeroData } from './useHeroStaleness';

const fmt = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});

export const HeroStaleNudgeView: React.FC<{
  newer: NewerHeroData;
  onShowLatest?: () => void;
  onKeepPinned?: () => void;
  /** Layout editor variant: one "Follow latest" link. */
  editor?: boolean;
  className?: string;
}> = ({ newer, onShowLatest, onKeepPinned, editor = false, className }) => {
  const { t } = useTranslation();
  return (
    <p
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 ${className ?? ''}`}
    >
      <span className="inline-flex items-center gap-1.5">
        <Clock className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
        {t('teams.hero.newerResults', {
          title: newer.title,
          date: fmt.format(newer.date),
          defaultValue: 'Newer results: {{title}}, {{date}}.',
        })}
      </span>
      {editor ? (
        <TextLink onClick={onShowLatest}>
          {t('teams.layout.followLatest', { defaultValue: 'Follow latest' })}
        </TextLink>
      ) : (
        <>
          <TextLink onClick={onShowLatest}>
            {t('teams.hero.showLatest', { defaultValue: 'Show latest' })}
          </TextLink>
          <TextLink quiet onClick={onKeepPinned}>
            {t('teams.hero.keepPinned', { defaultValue: 'Keep pinned' })}
          </TextLink>
        </>
      )}
    </p>
  );
};

/** Lead-only nudge for heroes that don't render their own. */
export const HeroStaleNudge: React.FC<{
  plc: Plc;
  layout: ResolvedTeamLayout;
  isLead: boolean;
  className?: string;
}> = ({ plc, layout, isLead, className }) => {
  const { user } = useAuth();
  const newer = useNewerHeroData(layout);
  const [dismissed, setDismissed] = useState(() => readNudgeDismissed(plc.id));
  if (!isLead || !newer || dismissed === newer.assessmentId) return null;
  return (
    <HeroStaleNudgeView
      newer={newer}
      className={className}
      onShowLatest={() => {
        showLatestHero(plc.id, layout, newer, heroPinner(user)).catch(
          (err: unknown) =>
            logError('HeroStaleNudge.showLatest', err, { plcId: plc.id })
        );
      }}
      onKeepPinned={() => {
        writeNudgeDismissed(plc.id, newer.assessmentId);
        setDismissed(newer.assessmentId);
      }}
    />
  );
};
