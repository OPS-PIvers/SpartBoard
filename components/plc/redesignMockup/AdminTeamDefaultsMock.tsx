// Screen 7: Admin Settings > Team type defaults (T3, T12, T22), inside the Admin Settings rail and panel layout.

import React, { useState } from 'react';
import {
  BarChart,
  BookOpenCheck,
  Building2,
  FlaskConical,
  GraduationCap,
  Image as ImageIcon,
  LayoutTemplate,
  LifeBuoy,
  Link2,
  Plus,
  Settings,
  Shield,
  Trash2,
  Users2,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/common/Button';
import { IconButton } from '@/components/common/IconButton';
import { SegmentedControl } from '@/components/common/SegmentedControl';
import { OrderRow } from './LayoutEditorModal';
import { EYEBROW, INPUT, META, TextLink } from './ui';

type TeamType = 'plc' | 'department' | 'building' | 'mentoring';

interface Preset {
  label: string;
  pages: [string, boolean, boolean?][];
  cards: [string, boolean][];
  hero: string[];
  template: [string, string][];
}

const PRESETS: Record<TeamType, Preset> = {
  plc: {
    label: 'PLC',
    pages: [
      ['Data overview', true, true],
      ['Assessments', true],
      ['Notes & Docs', true],
      ['Resources', true],
      ['Updates', false],
    ],
    cards: [
      ['Score distribution', true],
      ['Team average over time', true],
      ['Participation', true],
      ['Mastery by learning target', true],
      ['Goals', true],
      ['Recent assessments', true],
      ['Next meeting and open items', true],
      ['Latest updates', false],
      ['Calendar', false],
    ],
    hero: ['Latest common assessment', 'Team goal', 'Lowest learning target'],
    template: [
      ['What do we want students to learn?', 'Text'],
      ['How will we know if they learned it?', 'Data'],
      ['How will we respond when some students do not learn it?', 'Decision'],
      ['How will we extend learning for students who already know it?', 'Text'],
      ['Action items', 'Action items'],
    ],
  },
  department: {
    label: 'Department',
    pages: [
      ['Hub', true, true],
      ['Notes & Docs', true],
      ['Resources', true],
      ['Updates', false],
    ],
    cards: [
      ['Next meeting note', true],
      ['Open decisions and action items', true],
      ['Recently updated docs', true],
      ['Newly shared materials', true],
      ['Goals', false],
      ['Latest updates', false],
      ['Calendar', false],
    ],
    hero: ['Next meeting note until a doc is pinned', 'Newest doc'],
    template: [
      ['Agenda', 'Text'],
      ['Curriculum and materials', 'Text'],
      ['Decisions', 'Decision'],
      ['Action items', 'Action items'],
    ],
  },
  building: {
    label: 'Building',
    pages: [
      ['Hub', true, true],
      ['Resources', true],
      ['Updates', true],
      ['Notes & Docs', false],
    ],
    cards: [
      ['Quick links', true],
      ['Latest updates', true],
      ['Resources by category', true],
      ['Calendar', true],
      ['Goals', false],
    ],
    hero: ['Newest pinned update', 'Calendar'],
    template: [],
  },
  mentoring: {
    label: 'Mentoring',
    pages: [
      ['Program Hub', true, true],
      ['Workspace', true],
      ['Updates', true],
      ['Resources', true],
    ],
    cards: [
      ['Your next task', true],
      ['Submission status', true],
      ['Latest updates', true],
      ['Program dates', true],
      ['Resources', true],
      ['Goals', false],
    ],
    hero: ['Next required task', 'Newest pinned update'],
    template: [
      ['Check-in', 'Text'],
      ['Goal progress', 'Text'],
      ['Next steps', 'Action items'],
    ],
  },
};

const RUBRIC = [
  'Focuses on students, not a teacher task',
  'Names the assessment or measure',
  'States a baseline and a target',
  'Has a time frame',
  'Names a practice the team will change',
];

const RAIL: { label: string; tabs: [string, LucideIcon][] }[] = [
  {
    label: 'Access',
    tabs: [
      ['Widgets', Shield],
      ['Features', Zap],
      ['Previews', FlaskConical],
    ],
  },
  {
    label: 'Content',
    tabs: [
      ['Background Manager', ImageIcon],
      ['Templates', LayoutTemplate],
      ['Help Center', LifeBuoy],
      ['Standards', BookOpenCheck],
    ],
  },
  {
    label: 'Organization',
    tabs: [
      ['Organization', Building2],
      ['Gradebook', GraduationCap],
      ['Analytics', BarChart],
    ],
  },
  { label: 'Tools', tabs: [['Links', Link2]] },
  {
    label: 'PLC',
    tabs: [
      ['PLC Resources', Users2],
      ['Building groups', Building2],
      ['Team type defaults', LayoutTemplate],
    ],
  },
];

const ACTIVE_TAB = 'Team type defaults';

const PanelSection: React.FC<{
  title: string;
  extra?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, extra, children }) => (
  <section className="pt-6">
    <div className="mb-1 flex items-center gap-3">
      <h3 className={EYEBROW}>{title}</h3>
      <span className="flex-1" />
      {extra}
    </div>
    {children}
  </section>
);

export const AdminTeamDefaultsMock: React.FC = () => {
  const [type, setType] = useState<TeamType>('plc');
  const p = PRESETS[type];
  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex flex-1 overflow-hidden">
        <div className="hidden shrink-0 flex-col bg-brand-blue-dark text-white md:flex md:w-[76px] lg:w-60">
          <div className="flex h-14 shrink-0 items-center justify-between px-3 lg:px-4">
            <span className="hidden items-center gap-2 truncate text-base font-bold lg:flex">
              <Settings className="h-4 w-4 shrink-0 text-white/70" />
              Admin Settings
            </span>
            <button
              type="button"
              className="mx-auto shrink-0 rounded-lg p-2 transition-colors hover:bg-white/20 lg:mx-0"
              aria-label="Close settings"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <nav
            role="tablist"
            aria-orientation="vertical"
            aria-label="Admin sections"
            className="flex flex-1 flex-col overflow-y-auto py-2"
          >
            {RAIL.map((group) => (
              <div key={group.label} className="mb-1">
                <div className="px-4 pb-1 pt-3">
                  <span className="hidden text-[10px] font-bold uppercase tracking-[0.18em] text-white/35 lg:block">
                    {group.label}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5 px-2">
                  {group.tabs.map(([label, Icon]) => {
                    const active = label === ACTIVE_TAB;
                    return (
                      <button
                        key={label}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        title={label}
                        className={`flex w-full items-center justify-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors lg:justify-start ${
                          active
                            ? 'bg-white font-semibold text-brand-blue-dark shadow-sm'
                            : 'text-white/70 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        <Icon className="h-5 w-5 shrink-0" />
                        <span className="hidden truncate lg:inline">
                          {label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </div>

        <div
          className="min-w-0 flex-1 overflow-y-auto bg-slate-50"
          data-scroll-root
        >
          <div
            role="tabpanel"
            aria-label={ACTIVE_TAB}
            className="p-4 pb-16 md:p-6 md:pb-16"
          >
            <div className="mx-auto max-w-3xl">
              <div className="flex flex-wrap items-center gap-3">
                <SegmentedControl
                  ariaLabel="Team type"
                  value={type}
                  onChange={setType}
                  options={(Object.keys(PRESETS) as TeamType[]).map((k) => ({
                    value: k,
                    label: PRESETS[k].label,
                  }))}
                />
                <span className="flex-1" />
                <span className={META}>
                  Applies to teams created after you save.
                </span>
              </div>

              <PanelSection title="Pages">
                <ul className="divide-y divide-slate-200 border-y border-slate-200 bg-white px-3">
                  {p.pages.map(([label, on, landing], i) => (
                    <OrderRow
                      key={label}
                      label={label}
                      on={on}
                      index={i}
                      count={p.pages.length}
                      lockedOn={!!landing}
                      switchLabel={`${label} on by default`}
                      note={
                        landing && (
                          <span className="text-xxs font-bold uppercase tracking-wider text-brand-blue-primary">
                            Landing page
                          </span>
                        )
                      }
                      onMove={() => undefined}
                      onToggle={() => undefined}
                    />
                  ))}
                </ul>
              </PanelSection>

              <PanelSection title="Landing page cards">
                <ul className="divide-y divide-slate-200 border-y border-slate-200 bg-white px-3">
                  {p.cards.map(([label, on], i) => (
                    <OrderRow
                      key={label}
                      label={label}
                      on={on}
                      index={i}
                      count={p.cards.length}
                      switchLabel={`${label} on by default`}
                      onMove={() => undefined}
                      onToggle={() => undefined}
                    />
                  ))}
                </ul>
              </PanelSection>

              <PanelSection title="Hero default">
                <select
                  aria-label="Hero default"
                  className={`${INPUT} mt-1 py-1.5`}
                >
                  {p.hero.map((h) => (
                    <option key={h}>{h}</option>
                  ))}
                </select>
              </PanelSection>

              <PanelSection
                title="Meeting-note template"
                extra={
                  p.template.length === 0 && <span className={META}>None</span>
                }
              >
                {p.template.length > 0 && (
                  <ul className="divide-y divide-slate-200 border-y border-slate-200 bg-white px-3">
                    {p.template.map(([heading, kind]) => (
                      <li
                        key={heading}
                        className="flex items-center gap-2 py-2"
                      >
                        <input
                          type="text"
                          defaultValue={heading}
                          aria-label="Section heading"
                          className={`${INPUT} min-w-0 flex-1 py-1.5`}
                        />
                        <select
                          defaultValue={kind}
                          aria-label={`Block for ${heading}`}
                          className={`${INPUT} py-1.5`}
                        >
                          {['Text', 'Data', 'Decision', 'Action items'].map(
                            (k) => (
                              <option key={k}>{k}</option>
                            )
                          )}
                        </select>
                        <IconButton
                          icon={<Trash2 className="h-3.5 w-3.5" />}
                          label="Remove section"
                          size="sm"
                          variant="danger"
                        />
                      </li>
                    ))}
                  </ul>
                )}
                <TextLink icon={Plus} className="mt-2">
                  Add section
                </TextLink>
              </PanelSection>

              {type === 'plc' && (
                <PanelSection
                  title="Goal coach rubric"
                  extra={<TextLink quiet>Restore default</TextLink>}
                >
                  <ul className="divide-y divide-slate-200 border-y border-slate-200 bg-white px-3">
                    {RUBRIC.map((r, i) => (
                      <li key={r} className="flex items-center gap-2 py-2">
                        <span className="w-5 shrink-0 text-xs font-bold tabular-nums text-slate-400">
                          {i + 1}
                        </span>
                        <input
                          type="text"
                          defaultValue={r}
                          aria-label={`Criterion ${i + 1}`}
                          className={`${INPUT} min-w-0 flex-1 py-1.5`}
                        />
                        <IconButton
                          icon={<Trash2 className="h-3.5 w-3.5" />}
                          label="Remove criterion"
                          size="sm"
                          variant="danger"
                        />
                      </li>
                    ))}
                  </ul>
                  <TextLink icon={Plus} className="mt-2">
                    Add criterion
                  </TextLink>
                </PanelSection>
              )}

              <div className="mt-8 flex justify-end gap-2 border-t border-slate-200 pt-4">
                <Button variant="secondary">Discard changes</Button>
                <Button>Save {p.label} defaults</Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
