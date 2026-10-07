// Admin Settings > Team type defaults (TEAMS_REDESIGN T3, T12, T22); props-driven so the harness can render it on fixtures.

import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { IconButton } from '@/components/common/IconButton';
import { SegmentedControl } from '@/components/common/SegmentedControl';
import { OrderRow } from '@/components/plc/redesignMockup/LayoutEditorModal';
import {
  EYEBROW,
  INPUT,
  META,
  TextLink,
} from '@/components/plc/redesignMockup/ui';
import { BUILT_IN_TEAM_TYPE_PRESETS } from '@/config/teamTypePresets';
import { GOAL_COACH_MAX_CRITERIA } from '@/config/goalCoachRubric';
import {
  MEETING_NOTE_BLOCK_KINDS,
  type MeetingNoteBlockKind,
} from '@/utils/meetingNoteTemplate';
import type {
  GoalCoachCriterion,
  PlcGroupType,
  TeamHeroRule,
  TeamTypeDefaults,
  TeamTypePreset,
} from '@/types';
import {
  BLOCK_KIND_LABELS,
  HERO_RULE_LABELS,
  HERO_RULE_OPTIONS,
  TEAM_PAGE_LABELS,
  TEAM_TYPE_LABELS,
  TEAM_TYPE_ORDER,
  draftFromPreset,
  presetFromDraft,
  rubricDraftFrom,
  rubricFromDraft,
  type PresetDraft,
  type RubricDraftRow,
} from './teamTypeDefaultsModel';

export interface TeamTypeDefaultsViewProps {
  defaults: TeamTypeDefaults;
  /** Rejects to keep the edits on screen. */
  onSave: (
    type: PlcGroupType,
    preset: TeamTypePreset,
    rubric?: GoalCoachCriterion[]
  ) => Promise<void>;
  initialType?: PlcGroupType;
}

const LIST =
  'divide-y divide-slate-200 border-y border-slate-200 bg-white px-3';

function move<T>(list: readonly T[], i: number, d: number): T[] {
  const j = i + d;
  if (j < 0 || j >= list.length) return [...list];
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

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

export const TeamTypeDefaultsView: React.FC<TeamTypeDefaultsViewProps> = ({
  defaults,
  onSave,
  initialType = 'plc',
}) => {
  const [type, setType] = useState<PlcGroupType>(initialType);
  const [drafts, setDrafts] = useState<
    Partial<Record<PlcGroupType, PresetDraft>>
  >({});
  const [rubricDraft, setRubricDraft] = useState<RubricDraftRow[] | null>(null);
  const [saving, setSaving] = useState(false);

  const draft =
    drafts[type] ??
    draftFromPreset(
      defaults.types[type] ?? BUILT_IN_TEAM_TYPE_PRESETS[type],
      type
    );
  const rubric = rubricDraft ?? rubricDraftFrom(defaults.goalCoachRubric);
  const isPlc = type === 'plc';
  const dirty = !!drafts[type] || (isPlc && rubricDraft !== null);

  const edit = (patch: Partial<PresetDraft>) =>
    setDrafts((d) => ({ ...d, [type]: { ...draft, ...patch } }));
  const editRubric = (rows: RubricDraftRow[]) => setRubricDraft(rows);

  const discard = () => {
    setDrafts((d) => {
      const next = { ...d };
      delete next[type];
      return next;
    });
    if (isPlc) setRubricDraft(null);
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSave(
        type,
        presetFromDraft(draft, type),
        isPlc && rubricDraft ? rubricFromDraft(rubricDraft) : undefined
      );
      discard();
    } catch {
      // The caller reports the failure; the edits stay.
    } finally {
      setSaving(false);
    }
  };

  const heroOptions: TeamHeroRule[] = HERO_RULE_OPTIONS[type].includes(
    draft.heroRule
  )
    ? [...HERO_RULE_OPTIONS[type]]
    : [draft.heroRule, ...HERO_RULE_OPTIONS[type]];

  const setSection = (
    i: number,
    patch: Partial<{ heading: string; kind: MeetingNoteBlockKind }>
  ) =>
    edit({
      template: draft.template.map((s, j) =>
        j === i ? { ...s, ...patch } : s
      ),
    });

  return (
    <div className="mx-auto max-w-3xl pb-10 font-normal">
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl
          ariaLabel="Team type"
          value={type}
          onChange={setType}
          options={TEAM_TYPE_ORDER.map((k) => ({
            value: k,
            label: TEAM_TYPE_LABELS[k],
          }))}
        />
        <span className="flex-1" />
        <span className={META}>Applies to teams created after you save.</span>
      </div>

      <PanelSection title="Pages">
        <ul className={LIST}>
          {draft.pages.map((p, i) => {
            const label = TEAM_PAGE_LABELS[p.id];
            const landing = p.id === draft.landing;
            return (
              <OrderRow
                key={p.id}
                label={label}
                on={p.enabled}
                index={i}
                count={draft.pages.length}
                lockedOn={landing}
                switchLabel={`${label} on by default`}
                note={
                  landing && (
                    <span className="text-xxs font-bold uppercase tracking-wider text-brand-blue-primary">
                      Landing page
                    </span>
                  )
                }
                onMove={(d) => edit({ pages: move(draft.pages, i, d) })}
                onToggle={(on) =>
                  edit({
                    pages: draft.pages.map((x) =>
                      x.id === p.id ? { ...x, enabled: on } : x
                    ),
                  })
                }
              />
            );
          })}
        </ul>
      </PanelSection>

      <PanelSection title="Landing page cards">
        <ul className={LIST}>
          {draft.cards.map((c, i) => (
            <OrderRow
              key={c.key}
              label={c.label}
              on={c.on}
              index={i}
              count={draft.cards.length}
              switchLabel={`${c.label} on by default`}
              onMove={(d) => edit({ cards: move(draft.cards, i, d) })}
              onToggle={(on) =>
                edit({
                  cards: draft.cards.map((x) =>
                    x.key === c.key ? { ...x, on } : x
                  ),
                })
              }
            />
          ))}
        </ul>
      </PanelSection>

      <PanelSection title="Hero default">
        <select
          aria-label="Hero default"
          value={draft.heroRule}
          onChange={(e) => edit({ heroRule: e.target.value as TeamHeroRule })}
          className={`${INPUT} mt-1 py-1.5`}
        >
          {heroOptions.map((h) => (
            <option key={h} value={h}>
              {HERO_RULE_LABELS[h]}
            </option>
          ))}
        </select>
      </PanelSection>

      <PanelSection
        title="Meeting-note template"
        extra={
          draft.template.length === 0 && <span className={META}>None</span>
        }
      >
        {draft.template.length > 0 && (
          <ul className={LIST}>
            {draft.template.map((s, i) => (
              <li key={i} className="flex items-center gap-2 py-2">
                <input
                  type="text"
                  value={s.heading}
                  onChange={(e) => setSection(i, { heading: e.target.value })}
                  aria-label="Section heading"
                  className={`${INPUT} min-w-0 flex-1 py-1.5`}
                />
                <select
                  value={s.kind}
                  onChange={(e) =>
                    setSection(i, {
                      kind: e.target.value as MeetingNoteBlockKind,
                    })
                  }
                  aria-label={`Block for ${s.heading}`}
                  className={`${INPUT} py-1.5`}
                >
                  {MEETING_NOTE_BLOCK_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {BLOCK_KIND_LABELS[k]}
                    </option>
                  ))}
                </select>
                <IconButton
                  icon={<Trash2 className="h-3.5 w-3.5" />}
                  label="Remove section"
                  size="sm"
                  variant="danger"
                  onClick={() =>
                    edit({ template: draft.template.filter((_, j) => j !== i) })
                  }
                />
              </li>
            ))}
          </ul>
        )}
        <TextLink
          icon={Plus}
          className="mt-2"
          onClick={() =>
            edit({
              template: [
                ...draft.template,
                { heading: '', kind: 'text', body: '' },
              ],
            })
          }
        >
          Add section
        </TextLink>
      </PanelSection>

      <PanelSection
        title="Resource categories"
        extra={
          draft.categories.length === 0 && <span className={META}>None</span>
        }
      >
        {draft.categories.length > 0 && (
          <ul className={LIST}>
            {draft.categories.map((c, i) => (
              <li key={i} className="flex items-center gap-2 py-2">
                <input
                  type="text"
                  value={c}
                  maxLength={60}
                  onChange={(e) =>
                    edit({
                      categories: draft.categories.map((x, j) =>
                        j === i ? e.target.value : x
                      ),
                    })
                  }
                  aria-label={`Category ${i + 1}`}
                  className={`${INPUT} min-w-0 flex-1 py-1.5`}
                />
                <IconButton
                  icon={<Trash2 className="h-3.5 w-3.5" />}
                  label="Remove category"
                  size="sm"
                  variant="danger"
                  onClick={() =>
                    edit({
                      categories: draft.categories.filter((_, j) => j !== i),
                    })
                  }
                />
              </li>
            ))}
          </ul>
        )}
        <TextLink
          icon={Plus}
          className="mt-2"
          onClick={() => edit({ categories: [...draft.categories, ''] })}
        >
          Add category
        </TextLink>
      </PanelSection>

      {isPlc && (
        <PanelSection
          title="Goal coach rubric"
          extra={
            <TextLink
              quiet
              onClick={() => editRubric(rubricDraftFrom(undefined))}
            >
              Restore default
            </TextLink>
          }
        >
          {rubric.length > 0 && (
            <ul className={LIST}>
              {rubric.map((r, i) => (
                <li key={i} className="flex items-center gap-2 py-2">
                  <span className="w-5 shrink-0 text-xs font-bold tabular-nums text-slate-400">
                    {i + 1}
                  </span>
                  <input
                    type="text"
                    value={r.label}
                    maxLength={80}
                    onChange={(e) =>
                      editRubric(
                        rubric.map((x, j) =>
                          j === i ? { ...x, label: e.target.value } : x
                        )
                      )
                    }
                    aria-label={`Criterion ${i + 1}`}
                    className={`${INPUT} min-w-0 flex-1 py-1.5`}
                  />
                  <IconButton
                    icon={<Trash2 className="h-3.5 w-3.5" />}
                    label="Remove criterion"
                    size="sm"
                    variant="danger"
                    onClick={() => editRubric(rubric.filter((_, j) => j !== i))}
                  />
                </li>
              ))}
            </ul>
          )}
          {rubric.length < GOAL_COACH_MAX_CRITERIA && (
            <TextLink
              icon={Plus}
              className="mt-2"
              onClick={() => editRubric([...rubric, { label: '' }])}
            >
              Add criterion
            </TextLink>
          )}
        </PanelSection>
      )}

      <div className="mt-8 flex justify-end gap-2 border-t border-slate-200 pt-4">
        <Button
          variant="secondary"
          disabled={!dirty || saving}
          onClick={discard}
        >
          Discard changes
        </Button>
        <Button
          disabled={!dirty}
          isLoading={saving}
          onClick={() => void save()}
        >
          Save {TEAM_TYPE_LABELS[type]} defaults
        </Button>
      </div>
    </div>
  );
};
