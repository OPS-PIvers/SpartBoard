// Goals card and goal hero (T21), with the lead's goal coach check (T22): it refines and never writes.

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, MoreHorizontal, Pin, Sparkles } from 'lucide-react';
import { IconButton } from '@/components/common/IconButton';
import type { PlcGoal } from '@/types';
import type { GoalCoachDraft, GoalCoachResult } from '@/config/goalCoachRubric';
import {
  MENU_ITEM,
  MENU_PANEL,
  META,
  SectionHead,
  StatusLabel,
  TextLink,
} from '@/components/plc/redesignMockup/ui';
import { GoalProgressMeter } from './GoalProgressMeter';

export interface GoalViewProps {
  goal: PlcGoal | null;
  /** Practice wording, routine names resolved. */
  practices: string[];
  isLead: boolean;
  hero?: boolean;
  /** Shows the pinned label; set on a pinned goal hero. */
  pinned?: boolean;
  /** Name of whoever pinned this hero. */
  pinnedBy?: string;
  onEdit?: (goal: PlcGoal) => void;
  onAdd?: () => void;
  /** Present only when the lead can use the goal coach. */
  coach?: (draft: GoalCoachDraft) => Promise<GoalCoachResult>;
  /** Fixture result for the dev harness. */
  initialResult?: GoalCoachResult | null;
}

const CoachResult: React.FC<{ result: GoalCoachResult }> = ({ result }) => {
  const edits = new Map(
    result.suggestions.map((s) => [s.criterionId, s.suggestedEdit])
  );
  return (
    <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-200">
      {result.criteria.map((c) => (
        <li key={c.id} className="py-2">
          <StatusLabel tone={c.met ? 'done' : 'warn'}>{c.label}</StatusLabel>
          {!c.met && (
            <>
              <p className="mt-1 text-xs text-slate-600">{c.reason}</p>
              {edits.get(c.id) && (
                <p className="mt-1 text-sm text-slate-800">{edits.get(c.id)}</p>
              )}
            </>
          )}
        </li>
      ))}
    </ul>
  );
};

export const GoalView: React.FC<GoalViewProps> = ({
  goal,
  practices,
  isLead,
  hero = false,
  pinned = false,
  pinnedBy,
  onEdit,
  onAdd,
  coach,
  initialResult = null,
}) => {
  const { t } = useTranslation();
  const [menu, setMenu] = useState(false);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<GoalCoachResult | null>(initialResult);
  const [failed, setFailed] = useState(false);
  const [checkedFor, setCheckedFor] = useState(goal?.updatedAt ?? 0);
  // A saved edit makes an earlier check stale.
  if ((goal?.updatedAt ?? 0) !== checkedFor) {
    setCheckedFor(goal?.updatedAt ?? 0);
    setResult(null);
  }

  const canCheck = !!coach && !!goal && goal.title.trim().length > 0;
  const check = async () => {
    if (!coach || !goal || !goal.title.trim()) return;
    setChecking(true);
    setFailed(false);
    try {
      setResult(
        await coach({
          title: goal.title,
          ...(goal.measure ? { measure: goal.measure } : {}),
          ...(practices.length ? { practices } : {}),
        })
      );
    } catch {
      setFailed(true);
    } finally {
      setChecking(false);
    }
  };

  const menuItems = isLead && (!!onEdit || !!onAdd);
  return (
    <div className="min-w-0">
      <SectionHead
        title={t('plcDataOverview.goal', { defaultValue: 'Goal' })}
        as={hero ? 'h2' : 'h3'}
      >
        {menuItems && (
          <span className="relative">
            <IconButton
              icon={<MoreHorizontal className="h-4 w-4" />}
              label={t('plcDataOverview.goalOptions', {
                defaultValue: 'Goal options',
              })}
              size="sm"
              aria-haspopup="menu"
              aria-expanded={menu}
              onClick={() => setMenu((v) => !v)}
            />
            {menu && (
              <div
                role="menu"
                className={`${MENU_PANEL} absolute right-0 top-full z-20 mt-1 w-44`}
              >
                {goal && onEdit && (
                  <button
                    type="button"
                    role="menuitem"
                    className={MENU_ITEM}
                    onClick={() => {
                      setMenu(false);
                      onEdit(goal);
                    }}
                  >
                    {t('plcDashboard.comments.edit', { defaultValue: 'Edit' })}
                  </button>
                )}
                {onAdd && (
                  <button
                    type="button"
                    role="menuitem"
                    className={MENU_ITEM}
                    onClick={() => {
                      setMenu(false);
                      onAdd();
                    }}
                  >
                    {t('plcGoals.add', { defaultValue: 'Add goal' })}
                  </button>
                )}
              </div>
            )}
          </span>
        )}
      </SectionHead>
      {!goal ? (
        <p className="text-sm text-slate-500">
          {t('plcGoals.empty', { defaultValue: 'No goals yet.' })}
        </p>
      ) : (
        <>
          <p
            className={`mb-3 leading-relaxed text-slate-700 ${hero ? 'text-xl font-semibold text-slate-800' : 'text-sm'}`}
          >
            {goal.title}
          </p>
          {pinned && (
            <p className={`${META} -mt-2 mb-3 flex items-center gap-1`}>
              <Pin className="h-3 w-3" aria-hidden="true" />
              {pinnedBy
                ? t('plcDataOverview.pinnedBy', {
                    name: pinnedBy,
                    defaultValue: 'Pinned by {{name}}',
                  })
                : t('plcDataOverview.pinned', { defaultValue: 'Pinned' })}
            </p>
          )}
          {goal.current !== undefined && goal.target !== undefined && (
            <GoalProgressMeter
              current={goal.current}
              target={goal.target}
              {...(goal.baseline !== undefined
                ? { baseline: goal.baseline }
                : {})}
            />
          )}
          {hero && practices.length > 0 && (
            <ul className="mb-3 flex flex-col gap-1">
              {practices.map((p) => (
                <li
                  key={p}
                  className="flex items-center gap-2 text-sm text-slate-700"
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300"
                    aria-hidden="true"
                  />
                  {p}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-1 flex items-center gap-3">
            {goal.measure && <span className={META}>{goal.measure}</span>}
            <span className="flex-1" />
            {isLead && coach && (
              <TextLink
                quiet
                icon={checking ? undefined : Sparkles}
                disabled={!canCheck || checking}
                onClick={() => void check()}
              >
                {checking && (
                  <Loader2
                    className="h-3.5 w-3.5 animate-spin"
                    aria-hidden="true"
                  />
                )}
                {t('plcDataOverview.checkGoal', {
                  defaultValue: 'Check this goal',
                })}
              </TextLink>
            )}
          </div>
          {failed && (
            <p role="alert" className="mt-2 text-xs text-brand-red-primary">
              {t('plcDashboard.notes.meetingNotes.actionFailed', {
                defaultValue: 'That didn’t work. Try again.',
              })}
            </p>
          )}
          {result && <CoachResult result={result} />}
        </>
      )}
    </div>
  );
};
