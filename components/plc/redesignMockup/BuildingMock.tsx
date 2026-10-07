// Screens 5a and 5b: Building Hub and Updates (T25 to T28).

import React, { useState } from 'react';
import {
  CalendarDays,
  ClipboardList,
  Clock,
  ExternalLink,
  FileText,
  FolderOpen,
  LifeBuoy,
  Link2,
  Megaphone,
  MoreHorizontal,
  Paperclip,
  Pin,
  Send,
  ThumbsUp,
  Users2,
} from 'lucide-react';
import { Button } from '@/components/common/Button';
import { IconButton } from '@/components/common/IconButton';
import { Toggle } from '@/components/common/Toggle';
import { DocEmbed, HeroHead } from './DepartmentHubMock';
import { STAFF } from './fixtures';
import {
  EYEBROW,
  INPUT,
  MenuSelect,
  META,
  PAGE,
  Row,
  RowList,
  Section,
  SectionHead,
  StatusLabel,
  TextLink,
} from './ui';

interface Update {
  title: string;
  who: string;
  date: string;
  body: string;
  file?: string;
  reactions: number;
  pinned?: boolean;
  ack?: boolean;
}

const UPDATES: Update[] = [
  {
    title: 'Conference week schedule',
    who: 'Erin Walsh',
    date: 'Oct 6',
    body: 'Conferences run Oct 20 to 23. Sign-up opens to families Monday. Block your unavailable times by Friday.',
    file: 'Conference schedule.pdf',
    reactions: 18,
    pinned: true,
  },
  {
    title: 'October supervision schedule',
    who: 'Mark Johnson',
    date: 'Oct 3',
    body: 'Lunch and hallway duty changed for weeks 2 and 3. Check your new times before Monday.',
    file: 'Supervision Oct.pdf',
    reactions: 9,
    ack: true,
  },
  {
    title: 'Fire drill Thursday at 10:15',
    who: 'Mark Johnson',
    date: 'Oct 2',
    body: 'Use the north stairwell route. Sweep cards are in your sub folder.',
    reactions: 4,
  },
  {
    title: 'Picture retake day Oct 21',
    who: 'Erin Walsh',
    date: 'Sep 29',
    body: 'Send students with a retake slip to the gym during advisory.',
    reactions: 2,
  },
];

const UpdateBody: React.FC<{ u: Update }> = ({ u }) => (
  <>
    <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-700">
      {u.body}
    </p>
    {u.file && (
      <p className="mt-2 flex items-center gap-1.5 text-sm">
        <Paperclip className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
        <TextLink className="text-sm">{u.file}</TextLink>
      </p>
    )}
  </>
);

const Reactions: React.FC<{ n: number }> = ({ n }) => (
  <Button
    variant="ghost"
    size="sm"
    icon={<ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" />}
    aria-label={`${n} reactions`}
  >
    {n}
  </Button>
);

export const CalendarEmbed: React.FC<{
  name: string;
  events: [string, string][];
}> = ({ name, events }) => (
  <DocEmbed>
    <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600">
      <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
      {name} · Agenda
    </div>
    <ul className="divide-y divide-slate-100">
      {events.map(([when, what]) => (
        <li key={when + what} className="flex gap-4 px-4 py-2 text-sm">
          <span className="w-20 shrink-0 font-semibold tabular-nums text-slate-800">
            {when}
          </span>
          <span className="min-w-0 text-slate-700">{what}</span>
        </li>
      ))}
    </ul>
  </DocEmbed>
);

const LINKS = [
  [FileText, 'Staff handbook'],
  [ClipboardList, 'Sub request'],
  [LifeBuoy, 'Tech help ticket'],
  [Clock, 'Bell schedule'],
  [FolderOpen, 'Copy center request'],
  [Users2, 'Staff directory'],
] as const;

const RESOURCES: Record<string, string[]> = {
  Schedules: [
    'Bell schedule 2026-27',
    'Advisory calendar',
    'Supervision rotation',
  ],
  Forms: ['Field trip request', 'Purchase request', 'Leave request'],
  Safety: ['Emergency procedures', 'Reunification map', 'Medical alerts list'],
};

export const BuildingHubMock: React.FC<{
  isLead: boolean;
  onLayout: () => void;
  onUpdates: () => void;
}> = ({ isLead, onLayout, onUpdates }) => {
  const u = UPDATES[0];
  return (
    <div className={PAGE}>
      <Section first label="Pinned update">
        <HeroHead
          title={u.title}
          isLead={isLead}
          onChange={onLayout}
          meta={
            <>
              {u.who} · {u.date} ·
              <Pin className="h-3 w-3" aria-hidden="true" />
              Pinned update
            </>
          }
        />
        <UpdateBody u={u} />
        <div className="mt-2">
          <Reactions n={u.reactions} />
        </div>
      </Section>

      <Section label="Quick links" className="!py-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {LINKS.map(([Icon, label]) => (
            <TextLink key={label} icon={Icon} className="text-sm">
              {label}
            </TextLink>
          ))}
          {isLead && <TextLink quiet>Edit links</TextLink>}
        </div>
      </Section>

      <Section label="Updates, resources and calendar">
        <div className="grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="min-w-0">
            <SectionHead title="Latest updates">
              <TextLink onClick={onUpdates}>All updates</TextLink>
            </SectionHead>
            <RowList>
              {UPDATES.slice(1).map((x) => (
                <Row
                  key={x.title}
                  icon={Megaphone}
                  title={x.title}
                  meta={`${x.who} · ${x.date}`}
                  trailing={
                    x.ack && !isLead ? (
                      <StatusLabel tone="warn">
                        Needs your acknowledgement
                      </StatusLabel>
                    ) : undefined
                  }
                />
              ))}
            </RowList>
            <div className="mt-8">
              <SectionHead title="Resources">
                <TextLink>All resources</TextLink>
              </SectionHead>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                {Object.entries(RESOURCES).map(([cat, items]) => (
                  <div key={cat} className="min-w-0">
                    <p className="mb-1 text-xs font-semibold text-slate-600">
                      {cat}
                    </p>
                    <ul className="divide-y divide-slate-100">
                      {items.map((item) => (
                        <li key={item} className="py-2">
                          <TextLink className="text-sm">{item}</TextLink>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="min-w-0">
            <SectionHead title="Calendar">
              <TextLink icon={ExternalLink}>Google Calendar</TextLink>
            </SectionHead>
            <CalendarEmbed
              name="OMS staff calendar"
              events={[
                ['Wed Oct 8', 'Staff meeting, 3:15 PM, media center'],
                ['Thu Oct 9', 'Fire drill, 10:15 AM'],
                ['Fri Oct 10', 'Conference availability due'],
                ['Mon Oct 13', 'PBIS team, 7:30 AM'],
                ['Mon Oct 20', 'Conferences begin'],
                ['Tue Oct 21', 'Picture retakes'],
              ]}
            />
          </div>
        </div>
      </Section>
    </div>
  );
};

export const BuildingUpdatesMock: React.FC<{ isLead: boolean }> = ({
  isLead,
}) => {
  const [acked, setAcked] = useState(false);
  const [open, setOpen] = useState(true);
  const [ackRequired, setAckRequired] = useState(false);
  const [weekly, setWeekly] = useState(true);
  const total = 58;
  const ackN = 41;
  const notYet = STAFF.slice(9, 9 + (total - ackN));
  const yes = STAFF.slice(0, 9);
  return (
    <div className="mx-auto w-full max-w-3xl px-6 pb-16">
      {isLead && (
        <Section first label="Post an update">
          <textarea
            rows={3}
            placeholder="Post an update"
            aria-label="Post an update"
            className={`${INPUT} w-full resize-y`}
          />
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
            <IconButton
              icon={<Paperclip className="h-4 w-4" />}
              label="Attach a file"
              size="sm"
            />
            <IconButton
              icon={<Link2 className="h-4 w-4" />}
              label="Add a link"
              size="sm"
            />
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <Toggle
                size="sm"
                showLabels={false}
                checked={ackRequired}
                onChange={setAckRequired}
                label="Require acknowledgement"
              />
              Require acknowledgement
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <Toggle
                size="sm"
                showLabels={false}
                checked={weekly}
                onChange={setWeekly}
                label="Include in weekly email"
              />
              Include in weekly email
            </label>
            <span className="flex-1" />
            <Button
              size="sm"
              icon={<Send className="h-3.5 w-3.5" aria-hidden="true" />}
            >
              Post
            </Button>
          </div>
        </Section>
      )}
      <div className={`flex items-center gap-2 ${isLead ? '' : 'pt-6'}`}>
        <h3 className={EYEBROW}>Updates</h3>
        <MenuSelect
          label="Filter updates"
          value="all"
          options={[
            { value: 'all', label: 'All' },
            { value: 'ack', label: 'Needs acknowledgement' },
            { value: 'pinned', label: 'Pinned' },
          ]}
        />
      </div>
      {UPDATES.map((u) => (
        <article
          key={u.title}
          className="border-b border-slate-200 py-5 last:border-b-0"
        >
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h4 className="text-base font-bold text-slate-800">{u.title}</h4>
              <p className={`${META} mt-0.5 flex items-center gap-1`}>
                {u.who} · {u.date}
                {u.pinned && (
                  <>
                    {' '}
                    · <Pin className="h-3 w-3" aria-hidden="true" /> Pinned
                  </>
                )}
              </p>
            </div>
            {isLead && (
              <IconButton
                icon={<MoreHorizontal className="h-4 w-4" />}
                label="Update options"
                size="sm"
              />
            )}
          </div>
          <UpdateBody u={u} />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Reactions n={u.reactions} />
            {u.ack &&
              !isLead &&
              (acked ? (
                <StatusLabel tone="done">Acknowledged Oct 7</StatusLabel>
              ) : (
                <>
                  <StatusLabel tone="warn">
                    Acknowledgement required
                  </StatusLabel>
                  <Button size="sm" onClick={() => setAcked(true)}>
                    Acknowledge
                  </Button>
                </>
              ))}
            {u.ack && isLead && (
              <>
                <span className="text-xs text-slate-600">
                  Acknowledged by{' '}
                  <span className="font-bold tabular-nums text-slate-800">
                    {ackN} of {total}
                  </span>
                </span>
                <TextLink onClick={() => setOpen((v) => !v)}>
                  {open ? 'Hide' : 'See who'}
                </TextLink>
              </>
            )}
          </div>
          {u.ack && isLead && open && (
            <div className="mt-3 grid grid-cols-1 gap-8 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-semibold text-slate-600">
                  Not yet · {total - ackN}
                </p>
                <ul className="divide-y divide-slate-100 text-sm text-slate-700">
                  {notYet.slice(0, 6).map((n) => (
                    <li key={n} className="py-1.5">
                      {n}
                    </li>
                  ))}
                </ul>
                <TextLink className="mt-1">Show all {total - ackN}</TextLink>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold text-slate-600">
                  Acknowledged · {ackN}
                </p>
                <ul className="divide-y divide-slate-100 text-sm text-slate-700">
                  {yes.slice(0, 6).map((n, i) => (
                    <li key={n} className="flex py-1.5">
                      <span className="flex-1">{n}</span>
                      <span className={META}>Oct {3 + (i % 4)}</span>
                    </li>
                  ))}
                </ul>
                <TextLink className="mt-1">Show all {ackN}</TextLink>
              </div>
            </div>
          )}
        </article>
      ))}
    </div>
  );
};
