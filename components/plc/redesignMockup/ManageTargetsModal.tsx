// Screen 1b: Manage targets (T17), the shared Modal with the team's targets, cutoffs and question tags.

import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { Button } from '@/components/common/Button';
import { IconButton } from '@/components/common/IconButton';
import { DEFAULT_MASTERY_CUTOFFS } from '@/utils/learningTargets';
import { DataTable } from './charts/DataTable';
import {
  AGGREGATES,
  ASSESSMENTS,
  LEARNING_TARGETS,
  U3_TARGET_OF,
} from './fixtures';
import { INPUT, MenuSelect, META, SectionHead, TextLink } from './ui';

export const ManageTargetsModal: React.FC<{
  tagged: boolean;
  onClose: () => void;
}> = ({ tagged, onClose }) => {
  const [showAll, setShowAll] = useState(false);
  const questions =
    AGGREGATES.find((a) => a.assessmentId === 'u3')?.perQuestion ?? [];
  const counts = (code: string) =>
    tagged ? Object.values(U3_TARGET_OF).filter((t) => t === code).length : 0;
  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Learning targets"
      maxWidth="max-w-3xl"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onClose}>Save</Button>
        </div>
      }
    >
      <SectionHead title="Targets">
        <Button
          variant="ghost"
          size="sm"
          icon={<Plus className="h-3.5 w-3.5" aria-hidden="true" />}
        >
          Add target
        </Button>
      </SectionHead>
      <DataTable
        head={['Target', 'Questions', '']}
        rows={LEARNING_TARGETS.map((t) => [
          <span key={t.id}>
            <span className="font-bold">{t.code}</span>{' '}
            <span className="text-slate-500">{t.label}</span>
          </span>,
          counts(t.code ?? ''),
          <IconButton
            key="remove"
            icon={<Trash2 className="h-3.5 w-3.5" />}
            label={`Remove ${t.code}`}
            size="sm"
            variant="danger"
          />,
        ])}
      />

      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-slate-200 pt-5">
        <span className="text-xs font-bold uppercase tracking-widest text-slate-500">
          Cutoffs
        </span>
        {(
          [
            ['Proficient at', DEFAULT_MASTERY_CUTOFFS.proficient],
            ['Approaching at', DEFAULT_MASTERY_CUTOFFS.approaching],
          ] as const
        ).map(([label, value]) => (
          <label
            key={label}
            className="flex items-center gap-2 text-sm text-slate-700"
          >
            {label}
            <input
              type="number"
              min={0}
              max={100}
              defaultValue={value}
              className={`${INPUT} w-20 py-1.5 tabular-nums`}
            />
            %
          </label>
        ))}
      </div>

      <div className="mt-6 border-t border-slate-200 pt-5">
        <SectionHead title="Tag questions">
          <MenuSelect
            label="Assessment"
            value="u3"
            options={[...ASSESSMENTS].reverse().map((a) => ({
              value: a.id,
              label: a.title,
            }))}
          />
          <span className={META}>
            {tagged ? questions.length : 0} of {questions.length} tagged
          </span>
        </SectionHead>
        <ul className="divide-y divide-slate-100">
          {(showAll ? questions : questions.slice(0, 7)).map((q, i) => (
            <li key={q.questionId} className="flex items-center gap-3 py-2">
              <span className="w-8 shrink-0 text-sm font-bold tabular-nums text-slate-800">
                Q{i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
                {q.text}
              </span>
              <select
                aria-label={`Target for Q${i + 1}`}
                defaultValue={tagged ? U3_TARGET_OF[q.questionId] : ''}
                className={`${INPUT} py-1.5`}
              >
                <option value="">No target</option>
                {LEARNING_TARGETS.map((t) => (
                  <option key={t.id} value={t.code}>
                    {t.code}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
        <TextLink className="mt-2" onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Show fewer' : `Show all ${questions.length}`}
        </TextLink>
      </div>
    </Modal>
  );
};
