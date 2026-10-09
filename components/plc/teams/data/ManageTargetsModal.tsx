// "Manage targets" (T17): the team's learning targets and cutoffs on today's list doc, plus each question's tag.

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { Button } from '@/components/common/Button';
import { IconButton } from '@/components/common/IconButton';
import type { LearningTargetList } from '@/types';
import {
  DEFAULT_MASTERY_CUTOFFS,
  addTargets,
  archiveTarget,
  setMasteryCutoffs,
} from '@/utils/learningTargets';
import { DataTable } from '@/components/plc/redesignMockup/charts/DataTable';
import {
  INPUT,
  MenuSelect,
  META,
  SectionHead,
  TextLink,
} from '@/components/plc/redesignMockup/ui';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';

const COMPACT_QUESTIONS = 7;

export interface TagQuestion {
  questionId: string;
  text: string;
  /** Target id the question is tagged with, from the assessment's aggregate. */
  targetId: string | null;
}

export interface TagQuestionSet {
  assessmentId: string;
  title: string;
  questions: TagQuestion[];
}

export interface ManageTargetsModalProps {
  list: LearningTargetList | null;
  /** Newest first. */
  questionSets: TagQuestionSet[];
  onSave: (list: LearningTargetList) => Promise<void>;
  onClose: () => void;
}

const EMPTY: LearningTargetList = { targets: [], updatedAt: 0 };

export const ManageTargetsModal: React.FC<ManageTargetsModalProps> = ({
  list,
  questionSets,
  onSave,
  onClose,
}) => {
  const { t } = useTranslation();
  const base = list ?? EMPTY;
  const [draft, setDraft] = useState<LearningTargetList>(base);
  const [proficient, setProficient] = useState(
    String(
      base.masteryCutoffs?.proficient ?? DEFAULT_MASTERY_CUTOFFS.proficient
    )
  );
  const [approaching, setApproaching] = useState(
    String(
      base.masteryCutoffs?.approaching ?? DEFAULT_MASTERY_CUTOFFS.approaching
    )
  );
  const [adding, setAdding] = useState(false);
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const [setId, setSetId] = useState(questionSets[0]?.assessmentId ?? '');
  const [showAll, setShowAll] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  const active = draft.targets.filter((tg) => !tg.archived);
  const byId = useMemo(
    () => new Map(draft.targets.map((tg) => [tg.id, tg])),
    [draft.targets]
  );
  const set = questionSets.find((s) => s.assessmentId === setId) ?? null;
  const questions = set?.questions ?? [];
  const taggedCount = questions.filter((q) => q.targetId).length;
  const countFor = (id: string) =>
    questions.filter((q) => q.targetId === id).length;
  const nameOf = (id: string | null) => {
    if (!id)
      return t('plcDataOverview.noTarget', { defaultValue: 'No target' });
    const target = byId.get(id);
    return target?.code ?? target?.label ?? id;
  };

  const add = () => {
    if (!label.trim()) return;
    try {
      setDraft((d) => addTargets(d, [{ code, label }]));
      setCode('');
      setLabel('');
      setAdding(false);
    } catch {
      setError(true);
    }
  };

  const save = async () => {
    setSaving(true);
    setError(false);
    try {
      const next = setMasteryCutoffs(draft, {
        proficient: Number(proficient),
        approaching: Number(approaching),
      });
      await onSave(next);
      onClose();
    } catch {
      setError(true);
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t('plcDataOverview.learningTargets', {
        defaultValue: 'Learning targets',
      })}
      maxWidth="max-w-3xl"
      closeTourId="teams.targets.close"
      footer={
        <div className="flex items-center justify-end gap-2">
          {error && (
            <span
              role="alert"
              className="mr-auto text-xs text-brand-red-primary"
            >
              {t('learningTargets.saveFailed', { defaultValue: 'Save failed' })}
            </span>
          )}
          <Button
            variant="secondary"
            onClick={onClose}
            {...tourAttr('teams.targets.cancel')}
          >
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button
            onClick={() => void save()}
            disabled={saving}
            {...tourAttr('teams.targets.save')}
          >
            {t('common.save', { defaultValue: 'Save' })}
          </Button>
        </div>
      }
    >
      <SectionHead
        title={t('plcDataOverview.targets', { defaultValue: 'Targets' })}
      >
        <Button
          variant="ghost"
          size="sm"
          icon={<Plus className="h-3.5 w-3.5" aria-hidden="true" />}
          aria-expanded={adding}
          {...tourAttr('teams.targets.add-target')}
          onClick={() => setAdding((v) => !v)}
        >
          {t('learningTargets.addTarget', { defaultValue: 'Add target' })}
        </Button>
      </SectionHead>
      {adding && (
        <form
          className="mb-3 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={t('learningTargets.codePlaceholder', {
              defaultValue: 'Code',
            })}
            aria-label={t('learningTargets.columns.code', {
              defaultValue: 'Code',
            })}
            {...tourAttr('teams.targets.code')}
            className={`${INPUT} w-28 py-1.5`}
          />
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t('learningTargets.labelPlaceholder', {
              defaultValue: 'I can…',
            })}
            aria-label={t('learningTargets.columns.label', {
              defaultValue: 'Target',
            })}
            {...tourAttr('teams.targets.label')}
            className={`${INPUT} min-w-0 flex-1 py-1.5`}
          />
          <Button
            type="submit"
            size="sm"
            disabled={!label.trim()}
            {...tourAttr('teams.targets.add')}
          >
            {t('learningTargets.add', { defaultValue: 'Add' })}
          </Button>
        </form>
      )}
      {active.length === 0 ? (
        <p className="py-2 text-sm text-slate-500">
          {t('learningTargets.empty', {
            defaultValue: 'No learning targets yet.',
          })}
        </p>
      ) : (
        <DataTable
          head={[
            t('plcDataOverview.col.target', { defaultValue: 'Target' }),
            t('plcDataOverview.col.questions', { defaultValue: 'Questions' }),
            '',
          ]}
          rows={active.map((tg) => [
            <span key={tg.id}>
              {tg.code && <span className="font-bold">{tg.code}</span>}{' '}
              <span className="text-slate-500">{tg.label}</span>
            </span>,
            countFor(tg.id),
            <IconButton
              key="remove"
              icon={<Trash2 className="h-3.5 w-3.5" />}
              label={t('plcDataOverview.removeTarget', {
                code: tg.code ?? tg.label,
                defaultValue: 'Remove {{code}}',
              })}
              size="sm"
              variant="danger"
              {...tourFieldAttr('teams.targets.archive', 'teams-data', tg.id)}
              onClick={() => setDraft((d) => archiveTarget(d, tg.id))}
            />,
          ])}
        />
      )}

      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-slate-200 pt-5">
        <span className="text-xs font-bold uppercase tracking-widest text-slate-500">
          {t('plcDataOverview.cutoffs', { defaultValue: 'Cutoffs' })}
        </span>
        {(
          [
            [
              t('plcDataOverview.proficientAt', {
                defaultValue: 'Proficient at',
              }),
              proficient,
              setProficient,
            ],
            [
              t('plcDataOverview.approachingAt', {
                defaultValue: 'Approaching at',
              }),
              approaching,
              setApproaching,
            ],
          ] as const
        ).map(([text, value, onChange], i) => (
          <label
            key={text}
            className="flex items-center gap-2 text-sm text-slate-700"
          >
            {text}
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              {...tourFieldAttr('teams.targets.cutoff', 'teams-data', String(i))}
              className={`${INPUT} w-20 py-1.5 tabular-nums`}
            />
            %
          </label>
        ))}
      </div>

      {questionSets.length > 0 && (
        <div className="mt-6 border-t border-slate-200 pt-5">
          <SectionHead
            title={t('plcDataOverview.tagQuestions', {
              defaultValue: 'Tag questions',
            })}
          >
            <MenuSelect
              label={t('plcDataOverview.col.assessment', {
                defaultValue: 'Assessment',
              })}
              value={setId}
              anchor={tourAttr('teams.targets.assessment')}
              onChange={(v) => {
                setSetId(v);
                setShowAll(false);
              }}
              options={questionSets.map((s) => ({
                value: s.assessmentId,
                label: s.title,
              }))}
            />
            <span className={META}>
              {t('plcDataOverview.taggedCount', {
                count: taggedCount,
                total: questions.length,
                defaultValue: '{{count}} of {{total}} tagged',
              })}
            </span>
          </SectionHead>
          <ul className="divide-y divide-slate-100">
            {(showAll ? questions : questions.slice(0, COMPACT_QUESTIONS)).map(
              (q, i) => (
                <li key={q.questionId} className="flex items-center gap-3 py-2">
                  <span className="w-8 shrink-0 text-sm font-bold tabular-nums text-slate-800">
                    Q{i + 1}
                  </span>
                  <span className="min-w-0 flex-1 break-words text-sm text-slate-700">
                    {q.text}
                  </span>
                  <span
                    className={`shrink-0 text-sm ${q.targetId ? 'font-semibold text-slate-800' : 'text-slate-500'}`}
                  >
                    {nameOf(q.targetId)}
                  </span>
                </li>
              )
            )}
          </ul>
          {questions.length > COMPACT_QUESTIONS && (
            <TextLink
              className="mt-2"
              onClick={() => setShowAll((v) => !v)}
              {...tourAttr('teams.targets.show-all')}
            >
              {showAll
                ? t('plcDataOverview.showFewer', { defaultValue: 'Show fewer' })
                : t('plcDataOverview.showAllN', {
                    count: questions.length,
                    defaultValue: 'Show all {{count}}',
                  })}
            </TextLink>
          )}
        </div>
      )}
    </Modal>
  );
};
