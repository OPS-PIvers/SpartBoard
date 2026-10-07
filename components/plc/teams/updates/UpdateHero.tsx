// `update` hero renderer and the `newestPinnedUpdate` default (T5, T6, T27).

import React from 'react';
import { Pin } from 'lucide-react';
import { HeroHead } from '@/components/plc/redesignMockup/DepartmentHubMock';
import type { PlcUpdate } from '@/types';
import { pickHeroUpdate } from '@/utils/teamUpdates';
import { ReactionButton, UpdateBody } from './UpdateParts';
import { reactionCount, shortDate } from './updateFormat';
import { useTeamUpdatesData } from './useTeamUpdatesData';
import type { TeamHeroProps } from './teamContract';

export const UpdateHeroView: React.FC<{
  update: PlcUpdate;
  isLead: boolean;
  myUid: string;
  onChange?: () => void;
  onReact?: (updateId: string, reacted: boolean) => void;
}> = ({ update: u, isLead, myUid, onChange, onReact }) => {
  const reacted = u.reactions[myUid] === true;
  return (
    <>
      <HeroHead
        title={u.title}
        isLead={isLead}
        onChange={onChange}
        meta={
          u.pinned ? (
            <>
              {u.authorName} · {shortDate(u.createdAt)} ·
              <Pin className="h-3 w-3" aria-hidden="true" />
              Pinned update
            </>
          ) : (
            <>
              {u.authorName} · {shortDate(u.createdAt)}
            </>
          )
        }
      />
      <UpdateBody update={u} />
      <div className="mt-2">
        <ReactionButton
          count={reactionCount(u)}
          reacted={reacted}
          onToggle={() => onReact?.(u.id, !reacted)}
        />
      </div>
    </>
  );
};

/** Renders the pinned update, or with no pin the newest pinned update, else the newest update. */
export default function UpdateHero({
  plc,
  heroRef,
  isLead,
  onChangeHero,
}: TeamHeroProps) {
  const { updates, myUid, onReact } = useTeamUpdatesData(plc, isLead, false);
  const update = pickHeroUpdate(
    updates,
    heroRef?.kind === 'update' ? heroRef.updateId : undefined
  );
  if (!update) return null;
  return (
    <UpdateHeroView
      update={update}
      isLead={isLead}
      myUid={myUid}
      onChange={onChangeHero}
      onReact={onReact}
    />
  );
}
