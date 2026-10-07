// Production Notes and Department Hub views on fixtures at /teams-notes-dev (auth-bypass builds only).

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ClipboardList,
  FileText,
  Grid2x2,
  LayoutDashboard,
  Library,
  Mic,
  Sparkles,
  SquareSquare,
  BarChart3,
} from 'lucide-react';
import type { PlcActionItem } from '@/types';
import { Button } from '@/components/common/Button';
import {
  TeamShell,
  type ShellPage,
} from '@/components/plc/redesignMockup/TeamShell';
import {
  AGGREGATES,
  ASSESSMENTS,
  DEPT_TEAM,
  LEARNING_TARGETS,
  PLC_TEAM,
} from '@/components/plc/redesignMockup/fixtures';
import { buildItemAnalysis } from '@/utils/plcDataOverview';
import { NotesDocsView, MeetingNoteArticle } from './NotesDocsView';
import { DataBlockView, DecisionBlockView } from './NoteBlockViews';
import { TeamActionItemList } from './TeamActionItemList';
import { AddBlockMenu, OptionsMenu } from './NoteEditorPane';
import { dataBlockModel, decisionLinkModel } from './useTeamNotes';
import { DepartmentHubView } from '@/components/plc/teams/department/DepartmentHubView';

const PLC_PAGES: ShellPage[] = [
  { id: 'data', label: 'Data overview', icon: BarChart3 },
  { id: 'assessments', label: 'Assessments', icon: ClipboardList },
  { id: 'docs', label: 'Notes & Docs', icon: FileText },
  { id: 'resources', label: 'Resources', icon: Sparkles },
];
const DEPT_PAGES: ShellPage[] = [
  { id: 'hub', label: 'Hub', icon: LayoutDashboard },
  { id: 'docs', label: 'Notes & Docs', icon: FileText },
  { id: 'resources', label: 'Resources', icon: Sparkles },
];

const at = (month: number, day: number, hour = 15): number =>
  new Date(2026, month - 1, day, hour).getTime();

const MEMBERS = PLC_TEAM.members.map((m, i) => ({
  uid: `p${i + 1}`,
  displayName: m.name,
}));

const ITEMS: PlcActionItem[] = [
  ['Build the 3-question exit ticket for Q5', 'p1', at(10, 13)],
  ['Share extension task cards in Resources', 'p4', at(10, 10)],
  ['Tag Unit 4 Quick Check questions', 'p3', at(10, 10)],
].map(([text, assigneeUid, dueAt], i) => ({
  id: `a${i}`,
  text: text as string,
  done: false,
  assigneeUid: assigneeUid as string,
  dueAt: dueAt as number,
  createdBy: 'p1',
  createdAt: at(10, 9),
}));

const P: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-sm leading-relaxed text-slate-700">{children}</p>
);

const NoteScreen: React.FC<{ lead: boolean }> = ({ lead }) => {
  const { t } = useTranslation();
  const [items, setItems] = useState(ITEMS);
  const data = useMemo(
    () => dataBlockModel({ assessmentId: 'u3' }, AGGREGATES, ASSESSMENTS),
    []
  );
  const link = useMemo(() => {
    const u3 = AGGREGATES.find((a) => a.assessmentId === 'u3');
    const q5 = u3
      ? buildItemAnalysis(u3).questions.find((q) => q.number === 5)
      : undefined;
    return decisionLinkModel(
      {
        link: {
          kind: 'question',
          assessmentId: 'u3',
          questionId: q5?.questionId ?? '',
        },
      },
      AGGREGATES,
      ASSESSMENTS,
      LEARNING_TARGETS,
      t
    );
  }, [t]);
  const entry = (
    key: string,
    title: string,
    meta: string,
    active = false,
    icon = false
  ) => ({ key, title, meta, active, icon, onSelect: () => undefined });

  return (
    <NotesDocsView
      entries={[
        entry('n1', 'PLC meeting Oct 9', 'Today', true),
        entry('d1', 'Unit 3 reteach plan', 'Doc · Sep 30'),
        entry('n2', 'PLC meeting Oct 2', 'Oct 2'),
        entry('n3', 'PLC meeting Sep 25', 'Sep 25'),
      ]}
      records={[
        entry('r1', 'Meeting record May 14', 'Read-only', false, true),
        entry('r2', 'Meeting record Apr 30', 'Read-only', false, true),
      ]}
      canEdit
      onNewMeetingNote={() => undefined}
      newMenu={[
        { key: 'blank', label: 'Blank note', run: () => undefined },
        { key: 'doc', label: 'Link a Google Doc', run: () => undefined },
      ]}
    >
      <MeetingNoteArticle
        title={
          <h2 className="text-2xl font-extrabold text-slate-800">
            PLC meeting Oct 9
          </h2>
        }
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              icon={<Mic className="h-3.5 w-3.5" aria-hidden="true" />}
            >
              Record
            </Button>
            <OptionsMenu
              items={[
                {
                  key: 'docs',
                  label: 'Open in Docs',
                  icon: <FileText className="h-4 w-4" />,
                  run: () => undefined,
                },
              ]}
            />
          </>
        }
        meta="Thu, Oct 9 · 3:15 PM · Priya Shah, Hannah Olson, Jordan Kim, Elena Ruiz, Marcus Bell"
        sections={[
          {
            key: 's1',
            heading: '1. What do we want students to learn?',
            content: (
              <P>
                Unit rates with fractions (7.RP.1) and the meaning of the
                constant of proportionality (7.RP.2b).
              </P>
            ),
            extras: [],
          },
          {
            key: 's2',
            heading: '2. How will we know if they learned it?',
            content: null,
            extras: [
              <DataBlockView
                key="data"
                {...data}
                onOpenData={() => undefined}
              />,
            ],
          },
          {
            key: 's3',
            heading:
              '3. How will we respond when some students do not learn it?',
            content: null,
            extras: [
              <DecisionBlockView
                key="decision"
                text="Reteach Q5 in small groups Monday and Tuesday using a double number line. Re-check with a 3-question exit ticket Wednesday."
                dateLabel="Oct 9"
                linkLabel={link?.label}
                linkDetail={link?.detail}
                onOpenLink={() => undefined}
                revisitLabel="Revisit Oct 16"
              />,
            ],
          },
          {
            key: 's4',
            heading:
              '4. How will we extend learning for students who already know it?',
            content: (
              <P>
                Rate problems with three quantities from the Unit 3 extension
                set. Elena shares her task cards.
              </P>
            ),
            extras: [],
          },
          {
            key: 's5',
            heading: 'Action items',
            content: (
              <TeamActionItemList
                items={items}
                members={MEMBERS}
                canEdit={lead}
                currentUid="p1"
                onChange={setItems}
              />
            ),
            extras: [],
          },
        ]}
        footer={lead ? <AddBlockMenu showData onAdd={() => undefined} /> : null}
      />
    </NotesDocsView>
  );
};

const DocTable: React.FC = () => (
  <table className="w-full text-sm">
    <thead>
      <tr className="border-b border-slate-200 bg-slate-50">
        <th className="px-4 py-2" />
        {['Sep', 'Oct', 'Nov', 'Dec'].map((m) => (
          <th
            key={m}
            scope="col"
            className="px-4 py-2 text-left text-xxs font-bold uppercase tracking-wider text-slate-500"
          >
            {m}
          </th>
        ))}
      </tr>
    </thead>
    <tbody className="divide-y divide-slate-100">
      {[
        [
          'Grade 6',
          'Ratios and rates',
          'Dividing fractions',
          'Expressions',
          'Equations',
        ],
        [
          'Grade 7',
          'Ratios and proportions',
          'Proportions and percent',
          'Rational numbers',
          'Expressions',
        ],
        [
          'Grade 8',
          'Transformations',
          'Linear relationships',
          'Systems',
          'Functions',
        ],
      ].map(([grade, ...units]) => (
        <tr key={grade}>
          <th
            scope="row"
            className="px-4 py-2.5 text-left font-bold text-slate-800"
          >
            {grade}
          </th>
          {units.map((u) => (
            <td key={u} className="px-4 py-2.5 text-slate-700">
              {u}
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  </table>
);

const DeptScreen: React.FC<{ lead: boolean }> = ({ lead }) => {
  const noop = () => undefined;
  const [agenda, setAgenda] = useState([
    {
      id: 'g1',
      text: 'Unit 3 vocabulary list: one list for 6, 7 and 8?',
      who: 'Elena Ruiz',
    },
    { id: 'g2', text: 'Calculator policy for CFAs', who: 'Jordan Kim' },
    { id: 'g3', text: 'Winter benchmark window', who: 'Hannah Olson' },
  ]);
  return (
    <DepartmentHubView
      isLead={lead}
      cards={{
        hero: true,
        nextMeeting: true,
        openDecisions: true,
        openItems: true,
        recentDocs: true,
        newMaterials: true,
      }}
      hero={{
        title: '2026-27 Math Curriculum Map',
        meta: 'Google Doc · updated Oct 3 by Hannah Olson',
        pinned: true,
        docUrl: 'https://docs.google.com/document/d/example',
        body: <DocTable />,
      }}
      onChangeHero={noop}
      nextMeeting={{
        title: 'Department meeting Oct 14',
        dateLabel: 'Tue, Oct 14',
        agenda: agenda.map((a) => ({
          ...a,
          onRemove: lead
            ? () => setAgenda((l) => l.filter((x) => x.id !== a.id))
            : undefined,
        })),
        onOpenNote: noop,
        onAddAgenda: (text) =>
          setAgenda((l) => [
            ...l,
            { id: `g${l.length + 1}`, text, who: 'Hannah Olson' },
          ]),
      }}
      decisions={[
        {
          key: 'd1',
          title: 'Adopt one Unit 3 vocabulary list?',
          meta: 'Open · discuss Oct 14',
          onOpen: noop,
        },
        {
          key: 'd2',
          title: 'Retire the 2019 Grade 8 textbook',
          meta: 'Decided Sep 30',
          onOpen: noop,
        },
      ]}
      items={[
        {
          key: 'i1',
          title: 'Draft Grade 7 pacing for Q2',
          meta: 'Priya Shah · due Oct 17',
          done: false,
          onOpen: noop,
          onToggle: noop,
        },
        {
          key: 'i2',
          title: 'Collect calculator models in use',
          meta: 'Jordan Kim · due Oct 14',
          done: false,
          onOpen: noop,
          onToggle: noop,
        },
      ]}
      recentDocs={[
        ['2026-27 Math Curriculum Map', 'Hannah Olson', 'Oct 3'],
        ['Grade 7 pacing guide', 'Priya Shah', 'Oct 1'],
        ['Department meeting Sep 30', 'Hannah Olson', 'Sep 30'],
        ['Intervention block schedule', 'David Strand', 'Sep 26'],
      ].map(([title, meta, date]) => ({
        key: title,
        title,
        meta,
        date,
        onOpen: noop,
      }))}
      materials={[
        {
          key: 'm1',
          icon: ClipboardList,
          title: 'Unit 3 Ratios CFA',
          meta: 'Quiz · 18 questions · Priya Shah',
          onOpen: noop,
          onCopy: noop,
        },
        {
          key: 'm2',
          icon: Grid2x2,
          title: 'Proportional reasoning rubric',
          meta: 'Rubric · 4 criteria · Elena Ruiz',
          onOpen: noop,
          onCopy: noop,
        },
        {
          key: 'm3',
          icon: Library,
          title: 'Grade 8 slope bank',
          meta: 'Question bank · 42 questions · Julie Kraft',
          onOpen: noop,
        },
        {
          key: 'm4',
          icon: SquareSquare,
          title: 'Integer chips board',
          meta: 'Board · Rachel Moen',
          onOpen: noop,
        },
      ]}
      onOpenNotes={noop}
      onOpenResources={noop}
    />
  );
};

function readParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    screen: params.get('screen') === 'dept' ? 'dept' : 'note',
    lead: params.get('role') !== 'member',
    capture: params.get('capture') === '1',
  } as const;
}

export const TeamsNotesDevHarness: React.FC = () => {
  const [initial] = useState(readParams);
  const [screen, setScreen] = useState<'note' | 'dept'>(initial.screen);
  const [lead, setLead] = useState(initial.lead);
  return (
    <div
      className={`flex flex-col bg-white font-sans ${initial.capture ? 'min-h-screen' : 'h-screen [height:100dvh] overflow-hidden'}`}
    >
      <div className="flex shrink-0 flex-wrap items-center gap-4 border-b border-slate-200 bg-slate-100 px-4 py-2 text-xs text-slate-700">
        <span className="font-bold uppercase tracking-widest text-slate-500">
          Build
        </span>
        <label className="flex items-center gap-2">
          Screen
          <select
            value={screen}
            onChange={(e) =>
              setScreen(e.target.value === 'dept' ? 'dept' : 'note')
            }
            className="rounded border border-slate-300 bg-white px-2 py-1"
          >
            <option value="note">8. PLC meeting note</option>
            <option value="dept">4. Department Hub</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          View as
          <select
            value={lead ? 'lead' : 'member'}
            onChange={(e) => setLead(e.target.value === 'lead')}
            className="rounded border border-slate-300 bg-white px-2 py-1"
          >
            <option value="lead">Lead</option>
            <option value="member">Member</option>
          </select>
        </label>
      </div>
      <div
        className={initial.capture ? 'flex flex-1 flex-col' : 'min-h-0 flex-1'}
      >
        {screen === 'note' ? (
          <TeamShell
            team={PLC_TEAM}
            pages={PLC_PAGES}
            activePage="docs"
            overlay={null}
            onOverlay={() => undefined}
            isLead={lead}
            fullBleed
          >
            <NoteScreen lead={lead} />
          </TeamShell>
        ) : (
          <TeamShell
            team={DEPT_TEAM}
            pages={DEPT_PAGES}
            activePage="hub"
            overlay={null}
            onOverlay={() => undefined}
            isLead={lead}
          >
            <DeptScreen lead={lead} />
          </TeamShell>
        )}
      </div>
    </div>
  );
};

export default TeamsNotesDevHarness;
