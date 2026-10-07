// The lead's team layout editor (T2, T3, T5, T6): pages, landing, hero pin and landing cards.

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Home, RotateCcw, X } from 'lucide-react';
import type {
  PlcGroupType,
  PlcTeamLayout,
  TeamHeroRef,
  TeamHeroRule,
} from '@/types';
import { Modal } from '@/components/common/Modal';
import { Button } from '@/components/common/Button';
import { SegmentedControl } from '@/components/common/SegmentedControl';
import { OrderRow } from '@/components/plc/redesignMockup/LayoutEditorModal';
import { EYEBROW, INPUT, META } from '@/components/plc/redesignMockup/ui';
import { TEAM_PAGE_REGISTRY } from '@/components/plc/teams/pageRegistry';
import {
  teamCardRowLabel,
  teamHeroRuleSummary,
  teamPageLabel,
} from '@/components/plc/teams/teamLabels';
import { HeroStaleNudgeView } from '@/components/plc/teams/heroes/HeroStaleNudge';
import type { NewerHeroData } from '@/components/plc/teams/heroes/heroStaleness';
import type { TeamHeroPinner } from '@/components/plc/teams/heroes/heroPin';
import {
  cardBlocked,
  cardRows,
  draftFromLayout,
  heroRefKey,
  landingOptions,
  layoutFromDraft,
  moveRow,
  type LayoutDraft,
} from './layoutDraft';

export interface HeroPinGroup {
  label: string;
  options: { ref: TeamHeroRef; label: string }[];
}

export interface LayoutEditorViewProps {
  groupType: PlcGroupType;
  layout: PlcTeamLayout;
  heroRule: TeamHeroRule;
  /** What Reset restores; null when the admin defaults couldn't be read, which hides Reset. */
  districtDefault: PlcTeamLayout | null;
  pinGroups: HeroPinGroup[];
  /** Newer data than the item being pinned, if any. */
  newerFor?: (ref: TeamHeroRef) => NewerHeroData | null;
  isLead: boolean;
  /** Written as `pinnedBy` when this save pins a new item. */
  pinner?: TeamHeroPinner;
  saving?: boolean;
  onSave: (layout: PlcTeamLayout) => void;
  onClose: () => void;
}

export const LayoutEditorView: React.FC<LayoutEditorViewProps> = ({
  groupType,
  layout,
  heroRule,
  districtDefault,
  pinGroups,
  newerFor,
  isLead,
  pinner,
  saving = false,
  onSave,
  onClose,
}) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<LayoutDraft>(() =>
    draftFromLayout(layout, groupType)
  );
  const [confirmReset, setConfirmReset] = useState(false);

  const refByKey = useMemo(() => {
    const map = new Map<string, TeamHeroRef>();
    for (const group of pinGroups) {
      for (const option of group.options) {
        map.set(heroRefKey(option.ref), option.ref);
      }
    }
    return map;
  }, [pinGroups]);
  const firstKey = refByKey.keys().next().value ?? null;
  const selectedKey =
    draft.heroKey && refByKey.has(draft.heroKey) ? draft.heroKey : firstKey;
  const selectedRef = selectedKey ? refByKey.get(selectedKey) : undefined;
  const newer = selectedRef && newerFor ? newerFor(selectedRef) : null;
  const landings = landingOptions(draft.pages);

  const update = (patch: Partial<LayoutDraft>) =>
    setDraft((d) => ({ ...d, ...patch }));

  const save = () =>
    onSave(
      layoutFromDraft(
        { ...draft, heroKey: draft.heroMode === 'pinned' ? selectedKey : null },
        refByKey,
        pinner,
        layout.hero
      )
    );

  const footer = confirmReset ? (
    <div className="flex flex-wrap items-center gap-3">
      <span className="min-w-0 flex-1 text-sm text-slate-700">
        {t('teams.layout.resetConfirm', {
          defaultValue:
            'Pages, cards and the pinned item go back to the district default. Content stays.',
        })}
      </span>
      <Button variant="secondary" onClick={() => setConfirmReset(false)}>
        {t('common.cancel', { defaultValue: 'Cancel' })}
      </Button>
      <Button
        variant="danger"
        onClick={() => {
          if (districtDefault) {
            setDraft(draftFromLayout(districtDefault, groupType));
          }
          setConfirmReset(false);
        }}
      >
        {t('teams.layout.reset', { defaultValue: 'Reset' })}
      </Button>
    </div>
  ) : (
    <div className="flex items-center gap-2">
      {districtDefault && (
        <Button
          variant="ghost"
          icon={<RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />}
          onClick={() => setConfirmReset(true)}
        >
          {t('teams.layout.resetToDefault', {
            defaultValue: 'Reset to district default',
          })}
        </Button>
      )}
      <span className="flex-1" />
      <Button variant="secondary" onClick={onClose}>
        {t('common.cancel', { defaultValue: 'Cancel' })}
      </Button>
      <Button onClick={save} disabled={saving}>
        {t('common.save', { defaultValue: 'Save' })}
      </Button>
    </div>
  );

  const title = t('teams.layout.title', { defaultValue: 'Team layout' });

  return (
    <Modal
      isOpen
      onClose={onClose}
      maxWidth="max-w-2xl"
      ariaLabel={title}
      customHeader={
        <div className="mb-2 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 p-6 pb-0">
          <h3 className="text-lg font-black text-slate-800">{title}</h3>
          <span className={META}>
            {t('teams.layout.everyoneSees', {
              defaultValue: 'Everyone on the team sees this layout.',
            })}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100"
            aria-label={t('plcDashboard.close', { defaultValue: 'Close' })}
          >
            <X size={20} />
          </button>
        </div>
      }
      footer={footer}
    >
      <h4 className={`${EYEBROW} mt-2`}>
        {t('teams.layout.pages', { defaultValue: 'Pages' })}
      </h4>
      <ul className="divide-y divide-slate-100">
        {draft.pages.map((p, i) => {
          const label = teamPageLabel(t, p.id, isLead);
          const isLanding = p.id === draft.landing;
          return (
            <OrderRow
              key={p.id}
              label={label}
              icon={TEAM_PAGE_REGISTRY[p.id].icon}
              on={p.enabled || isLanding}
              index={i}
              count={draft.pages.length}
              lockedOn={isLanding}
              switchLabel={t('teams.layout.show', {
                label,
                defaultValue: 'Show {{label}}',
              })}
              note={
                isLanding && (
                  <span className="inline-flex items-center gap-1 text-xxs font-bold uppercase tracking-wider text-brand-blue-primary">
                    <Home className="h-3 w-3" aria-hidden="true" />
                    {t('teams.layout.landingPage', {
                      defaultValue: 'Landing page',
                    })}
                  </span>
                )
              }
              onMove={(d) => update({ pages: moveRow(draft.pages, i, d) })}
              onToggle={(on) =>
                update({
                  pages: draft.pages.map((x) =>
                    x.id === p.id ? { ...x, enabled: on } : x
                  ),
                })
              }
            />
          );
        })}
      </ul>
      <label className="mt-3 flex items-center gap-3 text-sm text-slate-700">
        <span className="w-28 shrink-0 font-semibold">
          {t('teams.layout.landingPage', { defaultValue: 'Landing page' })}
        </span>
        <select
          value={draft.landing}
          onChange={(e) => {
            const landing = e.target.value as LayoutDraft['landing'];
            const on = draft.cards.filter((c) => c.on).flatMap((c) => c.ids);
            update({ landing, cards: cardRows(groupType, landing, on) });
          }}
          className={`${INPUT} py-1.5`}
        >
          {landings.map((id) => (
            <option key={id} value={id}>
              {teamPageLabel(t, id, isLead)}
            </option>
          ))}
        </select>
      </label>

      <div className="mt-6 border-t border-slate-200 pt-5">
        <h4 className={`${EYEBROW} mb-3`}>
          {t('teams.layout.firstThing', {
            defaultValue: 'First thing the team sees',
          })}
        </h4>
        <SegmentedControl
          role="radiogroup"
          ariaLabel={t('teams.layout.firstThing', {
            defaultValue: 'First thing the team sees',
          })}
          value={draft.heroMode}
          onChange={(heroMode) => update({ heroMode })}
          options={[
            {
              value: 'default',
              label: t('teams.layout.followDefault', {
                defaultValue: 'Follow default',
              }),
            },
            {
              value: 'pinned',
              label: t('teams.layout.pinItem', { defaultValue: 'Pin an item' }),
            },
          ]}
        />
        {draft.heroMode === 'pinned' ? (
          <>
            <label className="mt-3 flex items-center gap-3 text-sm text-slate-700">
              <span className="w-28 shrink-0 font-semibold">
                {t('teams.layout.pinnedItem', { defaultValue: 'Pinned item' })}
              </span>
              <select
                value={selectedKey ?? ''}
                onChange={(e) => update({ heroKey: e.target.value })}
                className={`${INPUT} min-w-0 flex-1 py-1.5`}
              >
                {pinGroups
                  .filter((g) => g.options.length > 0)
                  .map((group) => (
                    <optgroup key={group.label} label={group.label}>
                      {group.options.map((option) => (
                        <option
                          key={heroRefKey(option.ref)}
                          value={heroRefKey(option.ref)}
                        >
                          {option.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
              </select>
            </label>
            {newer && (
              <HeroStaleNudgeView
                editor
                className="mt-2"
                newer={newer}
                onShowLatest={() => update({ heroMode: 'default' })}
              />
            )}
          </>
        ) : (
          <p className={`${META} mt-3`}>{teamHeroRuleSummary(t, heroRule)}</p>
        )}
      </div>

      <div className="mt-6 border-t border-slate-200 pt-5">
        <h4 className={EYEBROW}>
          {t('teams.layout.landingCards', {
            defaultValue: 'Landing page cards',
          })}
        </h4>
        <ul className="divide-y divide-slate-100">
          {draft.cards.map((c, i) => {
            const blocked = cardBlocked(c.ids, draft.pages);
            const label = teamCardRowLabel(t, c.ids, groupType);
            return (
              <OrderRow
                key={c.key}
                label={label}
                on={c.on}
                index={i}
                count={draft.cards.length}
                disabled={blocked}
                switchLabel={t('teams.layout.show', {
                  label,
                  defaultValue: 'Show {{label}}',
                })}
                note={
                  blocked && (
                    <span className={META}>
                      {t('teams.layout.needsUpdates', {
                        defaultValue: 'Turn on Updates first',
                      })}
                    </span>
                  )
                }
                onMove={(d) => update({ cards: moveRow(draft.cards, i, d) })}
                onToggle={(on) =>
                  update({
                    cards: draft.cards.map((x) =>
                      x.key === c.key ? { ...x, on } : x
                    ),
                  })
                }
              />
            );
          })}
        </ul>
      </div>
    </Modal>
  );
};
