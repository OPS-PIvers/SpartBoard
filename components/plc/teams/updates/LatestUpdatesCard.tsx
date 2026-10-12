// `latestUpdates` landing card (T26): the newest few updates, with "All updates" opening the archive.

import React from 'react';
import { Megaphone } from 'lucide-react';
import {
  META,
  Row,
  RowList,
  SectionHead,
  StatusLabel,
  TextLink,
} from '@/components/plc/redesignMockup/ui';
import type { PlcUpdate } from '@/types';
import { LATEST_UPDATES_COUNT } from '@/utils/teamUpdates';
import { shortDate } from './updateFormat';
import { useTeamUpdatesData } from './useTeamUpdatesData';
import type { TeamCardProps } from '@/components/plc/teams/types';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';

export const LatestUpdatesView: React.FC<{
  updates: PlcUpdate[];
  isLead: boolean;
  myUid: string;
  myAcks: Record<string, number>;
  onAll?: () => void;
}> = ({ updates, isLead, myUid, myAcks, onAll }) => (
  <>
    <SectionHead title="Latest updates">
      <TextLink onClick={onAll} {...tourAttr('teams.updates.all-updates')}>
        All updates
      </TextLink>
    </SectionHead>
    {updates.length === 0 ? (
      <p className={`${META} py-2.5`}>No updates yet.</p>
    ) : (
      <RowList>
        {updates.map((u) => (
          <Row
            key={u.id}
            icon={Megaphone}
            title={
              <button
                type="button"
                {...tourFieldAttr(
                  'teams.updates.latest-item',
                  'teams-updates',
                  u.id
                )}
                onClick={onAll}
                className="max-w-full truncate rounded text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40"
              >
                {u.title}
              </button>
            }
            meta={`${u.authorName} · ${shortDate(u.createdAt)}`}
            trailing={
              u.requiresAck &&
              !isLead &&
              u.authorUid !== myUid &&
              myAcks[u.id] === undefined ? (
                <StatusLabel tone="warn">
                  Needs your acknowledgement
                </StatusLabel>
              ) : undefined
            }
          />
        ))}
      </RowList>
    )}
  </>
);

export default function LatestUpdatesCard({
  plc,
  isLead,
  onNavigate,
}: TeamCardProps) {
  const { updates, myUid, myAcks } = useTeamUpdatesData(plc, isLead, {
    withRosters: false,
    visible: LATEST_UPDATES_COUNT,
  });
  return (
    <LatestUpdatesView
      updates={updates.slice(0, LATEST_UPDATES_COUNT)}
      isLead={isLead}
      myUid={myUid}
      myAcks={myAcks}
      onAll={() => onNavigate?.('updates')}
    />
  );
}
