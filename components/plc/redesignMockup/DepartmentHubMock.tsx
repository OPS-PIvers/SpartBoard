// Screen 4: Department Hub (T23, T24).

import React from 'react';
import {
  ClipboardList,
  ExternalLink,
  FileText,
  Grid2x2,
  Library,
  Pin,
  Scale,
  SquareSquare,
} from 'lucide-react';
import { Button } from '@/components/common/Button';
import {
  ActionItem,
  INPUT,
  META,
  PAGE,
  Row,
  RowList,
  Section,
  SectionHead,
  TextLink,
} from './ui';

const MAP = [
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
];

/** Stand-in for the Google Docs embed the hero renders. */
export const DocEmbed: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
    {children}
  </div>
);

export const HeroHead: React.FC<{
  title: string;
  meta: React.ReactNode;
  isLead: boolean;
  onChange?: () => void;
  eyebrow?: string;
  actions?: React.ReactNode;
}> = ({ title, meta, isLead, onChange, eyebrow, actions }) => (
  <div className="flex flex-wrap items-start gap-4">
    <div className="min-w-0 flex-1">
      {eyebrow && <p className={`${META} mb-1`}>{eyebrow}</p>}
      <h2 className="text-xl font-extrabold text-slate-800">{title}</h2>
      <p className={`${META} mt-1 flex flex-wrap items-center gap-1`}>{meta}</p>
    </div>
    <div className="flex items-center gap-2">
      {isLead && (
        <Button
          variant="ghost"
          size="sm"
          icon={<Pin className="h-3.5 w-3.5" aria-hidden="true" />}
          title="Change what the team sees first"
          onClick={onChange}
        >
          Change
        </Button>
      )}
      {actions}
    </div>
  </div>
);

export const DepartmentHubMock: React.FC<{
  isLead: boolean;
  onLayout: () => void;
}> = ({ isLead, onLayout }) => (
  <div className={PAGE}>
    <Section first label="Pinned doc">
      <HeroHead
        title="2026-27 Math Curriculum Map"
        isLead={isLead}
        onChange={onLayout}
        meta={
          <>
            Google Doc · updated Oct 3 by Hannah Olson ·
            <Pin className="h-3 w-3" aria-hidden="true" />
            Pinned
          </>
        }
        actions={
          <Button
            variant="secondary"
            size="sm"
            icon={<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />}
          >
            Open in Docs
          </Button>
        }
      />
      <DocEmbed>
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
            {MAP.map(([grade, ...units]) => (
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
      </DocEmbed>
    </Section>

    <Section label="Next meeting and open items">
      <div className="grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-2">
        <div className="min-w-0">
          <SectionHead title="Department meeting" meta="Tue, Oct 14">
            <TextLink>Open note</TextLink>
          </SectionHead>
          <p className="mb-1 text-xs font-semibold text-slate-600">Agenda</p>
          <RowList label="Agenda">
            {[
              [
                'Unit 3 vocabulary list: one list for 6, 7 and 8?',
                'Elena Ruiz',
              ],
              ['Calculator policy for CFAs', 'Jordan Kim'],
              ['Winter benchmark window', 'Hannah Olson'],
            ].map(([t, who]) => (
              <Row
                key={t}
                title={t}
                trailing={<span className={META}>{who}</span>}
              />
            ))}
          </RowList>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="text"
              placeholder="Add an agenda item"
              aria-label="Add an agenda item"
              className={`${INPUT} min-w-0 flex-1 py-1.5`}
            />
            <Button variant="secondary" size="sm">
              Add
            </Button>
          </div>
        </div>
        <div className="min-w-0">
          <SectionHead title="Open decisions and action items" />
          <RowList>
            <Row
              icon={Scale}
              title="Adopt one Unit 3 vocabulary list?"
              meta="Open · discuss Oct 14"
            />
            <Row
              icon={Scale}
              title="Retire the 2019 Grade 8 textbook"
              meta="Decided Sep 30 · ordering pending"
            />
            <ActionItem
              title="Draft Grade 7 pacing for Q2"
              meta="Priya Shah · due Oct 17"
            />
            <ActionItem
              title="Collect calculator models in use"
              meta="Jordan Kim · due Oct 14"
            />
          </RowList>
        </div>
      </div>
    </Section>

    <Section label="Docs and materials">
      <div className="grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-2">
        <div className="min-w-0">
          <SectionHead title="Recently updated docs">
            <TextLink>Notes &amp; Docs</TextLink>
          </SectionHead>
          <RowList>
            {[
              ['2026-27 Math Curriculum Map', 'Hannah Olson', 'Oct 3'],
              ['Grade 7 pacing guide', 'Priya Shah', 'Oct 1'],
              ['Department meeting Sep 30', 'Hannah Olson', 'Sep 30'],
              ['Intervention block schedule', 'David Strand', 'Sep 26'],
            ].map(([t, who, d]) => (
              <Row
                key={t}
                icon={FileText}
                title={t}
                meta={who}
                trailing={<span className={META}>{d}</span>}
              />
            ))}
          </RowList>
        </div>
        <div className="min-w-0">
          <SectionHead title="Newly shared materials">
            <TextLink>Resources</TextLink>
          </SectionHead>
          <RowList>
            {(
              [
                [
                  ClipboardList,
                  'Unit 3 Ratios CFA',
                  'Quiz · 18 questions',
                  'Priya Shah',
                ],
                [
                  Grid2x2,
                  'Proportional reasoning rubric',
                  'Rubric · 4 criteria',
                  'Elena Ruiz',
                ],
                [
                  Library,
                  'Grade 8 slope bank',
                  'Question bank · 42 questions',
                  'Julie Kraft',
                ],
                [SquareSquare, 'Integer chips board', 'Board', 'Rachel Moen'],
              ] as const
            ).map(([icon, t, kind, who]) => (
              <Row
                key={t}
                icon={icon}
                title={t}
                meta={`${kind} · ${who}`}
                trailing={<TextLink>Copy to my library</TextLink>}
              />
            ))}
          </RowList>
        </div>
      </div>
    </Section>
  </div>
);
