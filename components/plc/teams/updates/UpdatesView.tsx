// The Updates page (T27): compose for leads, the archive, reactions and acknowledgements (mock: BuildingUpdatesMock).

import React, { useState } from 'react';
import { MoreHorizontal, Pin } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { IconButton } from '@/components/common/IconButton';
import {
  EYEBROW,
  MENU_ITEM,
  MENU_PANEL,
  MenuSelect,
  META,
  Section,
  StatusLabel,
  TextLink,
} from '@/components/plc/redesignMockup/ui';
import type { PlcUpdate } from '@/types';
import type { PlcUpdateDraft } from '@/hooks/usePlcUpdates';
import {
  filterUpdates,
  type AckRoster,
  type UpdatesFilter,
} from '@/utils/teamUpdates';
import { ReactionButton, UpdateBody } from './UpdateParts';
import { reactionCount, shortDate } from './updateFormat';
import { UpdateComposer, type AttachPicker } from './UpdateComposer';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';

export interface UpdatesViewProps {
  updates: PlcUpdate[];
  isLead: boolean;
  myUid: string;
  /** updateId → when the viewer acknowledged it. */
  myAcks: Record<string, number>;
  /** Lead and co-lead: who has acknowledged each ack-required update. */
  rosters: Record<string, AckRoster>;
  loading?: boolean;
  onPost?: (draft: PlcUpdateDraft) => Promise<void>;
  onEdit?: (updateId: string, draft: PlcUpdateDraft) => Promise<void>;
  onDelete?: (update: PlcUpdate) => void;
  onPin?: (updateId: string, pinned: boolean) => void;
  onReact?: (updateId: string, reacted: boolean) => void;
  onAck?: (updateId: string) => void;
  onAttach?: AttachPicker;
}

const ROSTER_PREVIEW = 6;

const FILTERS: { value: UpdatesFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'ack', label: 'Needs acknowledgement' },
  { value: 'pinned', label: 'Pinned' },
];

const RosterColumn: React.FC<{
  heading: string;
  rows: { uid: string; name: string; ackedAt?: number }[];
  anchorKey: string;
}> = ({ heading, rows, anchorKey }) => {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, ROSTER_PREVIEW);
  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-slate-600">{heading}</p>
      <ul className="divide-y divide-slate-100 text-sm text-slate-700">
        {shown.map((r) => (
          <li key={r.uid} className="flex py-1.5">
            <span className="min-w-0 flex-1 truncate">{r.name}</span>
            {r.ackedAt !== undefined && (
              <span className={META}>{shortDate(r.ackedAt)}</span>
            )}
          </li>
        ))}
      </ul>
      {rows.length > ROSTER_PREVIEW && (
        <TextLink
          className="mt-1"
          {...tourFieldAttr(
            'teams.update.roster-show-all',
            'teams-updates',
            anchorKey
          )}
          onClick={() => setAll((v) => !v)}
        >
          {all ? 'Hide' : `Show all ${rows.length}`}
        </TextLink>
      )}
    </div>
  );
};

const OptionsMenu: React.FC<{
  update: PlcUpdate;
  onEdit: () => void;
  onDelete?: (update: PlcUpdate) => void;
  onPin?: (updateId: string, pinned: boolean) => void;
}> = ({ update, onEdit, onDelete, onPin }) => {
  const [open, setOpen] = useState(false);
  const pick = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  return (
    <div
      className="relative"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setOpen(false);
        }
      }}
    >
      <IconButton
        icon={<MoreHorizontal className="h-4 w-4" />}
        label="Update options"
        size="sm"
        aria-haspopup="menu"
        aria-expanded={open}
        {...tourFieldAttr('teams.update.options', 'teams-updates', update.id)}
        onClick={() => setOpen((v) => !v)}
      />
      {open && (
        <div
          role="menu"
          className={`${MENU_PANEL} absolute right-0 top-full z-20 mt-1 w-40`}
        >
          <button
            type="button"
            role="menuitem"
            className={MENU_ITEM}
            {...tourFieldAttr('teams.update.pin', 'teams-updates', update.id)}
            onClick={pick(() => onPin?.(update.id, !update.pinned))}
          >
            {update.pinned ? 'Unpin' : 'Pin'}
          </button>
          <button
            type="button"
            role="menuitem"
            className={MENU_ITEM}
            {...tourFieldAttr('teams.update.edit', 'teams-updates', update.id)}
            onClick={pick(onEdit)}
          >
            Edit
          </button>
          <button
            type="button"
            role="menuitem"
            className={`${MENU_ITEM} text-brand-red-primary`}
            {...tourFieldAttr(
              'teams.update.delete',
              'teams-updates',
              update.id
            )}
            onClick={pick(() => onDelete?.(update))}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
};

const UpdateArticle: React.FC<
  Omit<UpdatesViewProps, 'updates' | 'onPost' | 'loading'> & {
    update: PlcUpdate;
    defaultOpen: boolean;
  }
> = ({
  update: u,
  isLead,
  myUid,
  myAcks,
  rosters,
  onEdit,
  onDelete,
  onPin,
  onReact,
  onAck,
  onAttach,
  defaultOpen,
}) => {
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(defaultOpen);
  const reacted = u.reactions[myUid] === true;
  const ackedAt = myAcks[u.id];
  const roster = rosters[u.id];
  // The author never acknowledges their own post.
  const needsMyAck = u.requiresAck && !isLead && u.authorUid !== myUid;

  if (editing && onEdit) {
    return (
      <article className="border-b border-slate-200 py-5 last:border-b-0">
        <UpdateComposer
          initial={u}
          onAttach={onAttach}
          onCancel={() => setEditing(false)}
          onSubmit={async (draft) => {
            await onEdit(u.id, draft);
            setEditing(false);
          }}
        />
      </article>
    );
  }

  return (
    <article
      id={`team-update-${u.id}`}
      className="border-b border-slate-200 py-5 last:border-b-0"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h4 className="text-base font-bold text-slate-800">{u.title}</h4>
          <p className={`${META} mt-0.5 flex items-center gap-1`}>
            {u.authorName} · {shortDate(u.createdAt)}
            {u.pinned && (
              <>
                {' '}
                · <Pin className="h-3 w-3" aria-hidden="true" /> Pinned
              </>
            )}
          </p>
        </div>
        {isLead && (
          <OptionsMenu
            update={u}
            onEdit={() => setEditing(true)}
            onDelete={onDelete}
            onPin={onPin}
          />
        )}
      </div>
      <UpdateBody update={u} />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <ReactionButton
          count={reactionCount(u)}
          reacted={reacted}
          anchorKey={u.id}
          onToggle={() => onReact?.(u.id, !reacted)}
        />
        {needsMyAck &&
          (ackedAt !== undefined ? (
            <StatusLabel tone="done">
              Acknowledged {shortDate(ackedAt)}
            </StatusLabel>
          ) : (
            <>
              <StatusLabel tone="warn">Acknowledgement required</StatusLabel>
              <Button
                size="sm"
                {...tourFieldAttr(
                  'teams.update.acknowledge',
                  'teams-updates',
                  u.id
                )}
                onClick={() => onAck?.(u.id)}
              >
                Acknowledge
              </Button>
            </>
          ))}
        {u.requiresAck && isLead && roster && (
          <>
            <span className="text-xs text-slate-600">
              Acknowledged by{' '}
              <span className="font-bold tabular-nums text-slate-800">
                {roster.acknowledged.length} of {roster.total}
              </span>
            </span>
            <TextLink
              {...tourFieldAttr('teams.update.see-who', 'teams-updates', u.id)}
              onClick={() => setOpen((v) => !v)}
            >
              {open ? 'Hide' : 'See who'}
            </TextLink>
          </>
        )}
      </div>
      {u.requiresAck && isLead && roster && open && (
        <div className="mt-3 grid grid-cols-1 gap-8 sm:grid-cols-2">
          <RosterColumn
            heading={`Not yet · ${roster.notYet.length}`}
            rows={roster.notYet}
            anchorKey={`${u.id}:not-yet`}
          />
          <RosterColumn
            heading={`Acknowledged · ${roster.acknowledged.length}`}
            rows={roster.acknowledged}
            anchorKey={`${u.id}:acknowledged`}
          />
        </div>
      )}
    </article>
  );
};

export const UpdatesView: React.FC<UpdatesViewProps> = (props) => {
  const { updates, isLead, onPost, onAttach, loading = false } = props;
  const [filter, setFilter] = useState<UpdatesFilter>('all');
  const shown = filterUpdates(updates, filter);
  const firstAckId = updates.find((u) => u.requiresAck)?.id;
  return (
    <div className="mx-auto w-full max-w-3xl px-6 pb-16">
      {isLead && onPost && (
        <Section first label="Post an update">
          <UpdateComposer onSubmit={onPost} onAttach={onAttach} />
        </Section>
      )}
      <div className={`flex items-center gap-2 ${isLead ? '' : 'pt-6'}`}>
        <h3 className={EYEBROW}>Updates</h3>
        <MenuSelect
          label="Filter updates"
          anchor={tourAttr('teams.updates.filter')}
          value={filter}
          options={FILTERS}
          onChange={(v) => setFilter(v as UpdatesFilter)}
        />
      </div>
      {!loading && shown.length === 0 && (
        <p className="py-8 text-sm text-slate-500">No updates yet.</p>
      )}
      {shown.map((u) => (
        <UpdateArticle
          key={u.id}
          {...props}
          update={u}
          defaultOpen={u.id === firstAckId}
        />
      ))}
    </div>
  );
};
