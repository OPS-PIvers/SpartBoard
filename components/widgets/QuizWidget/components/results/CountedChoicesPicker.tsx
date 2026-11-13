import React, { useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { CellPopover } from '@/components/admin/Organization/components/primitives';
import { tourFieldAttr } from '@/config/tourAnchors';
import { plainPromptText } from '@/utils/promptMath';

const SMALL_TEXT = { fontSize: 'min(11px, 3.8cqmin)' } as const;
const SMALL_ICON = {
  width: 'min(12px, 3.8cqmin)',
  height: 'min(12px, 3.8cqmin)',
} as const;

export interface CountedChoiceOption {
  questionId: string;
  number: number;
  text: string;
}

/** One over-answered choose-N section: which of the student's answers count. */
export const CountedChoicesPicker: React.FC<{
  sectionId: string;
  sectionTitle: string;
  count: number;
  options: CountedChoiceOption[];
  counted: readonly string[];
  /** True when the teacher has already changed the default pick. */
  teacherPicked: boolean;
  onSave: (picked: string[] | null) => Promise<void>;
}> = ({
  sectionId,
  sectionTitle,
  count,
  options,
  counted,
  teacherPicked,
  onSave,
}) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const picked = draft ?? [...counted];
  const label = `${sectionTitle || 'Section'}: answered ${options.length}, ${count} count`;
  const numbers = options
    .filter((o) => counted.includes(o.questionId))
    .map((o) => `Q${o.number}`)
    .join(', ');

  const save = async (next: string[] | null) => {
    setSaving(true);
    try {
      await onSave(next);
      setDraft(null);
    } finally {
      setSaving(false);
    }
  };

  const toggle = (id: string) => {
    const on = picked.includes(id);
    if (!on && picked.length >= count) return;
    const next = on ? picked.filter((x) => x !== id) : [...picked, id];
    setDraft(next);
    const same =
      next.length === counted.length && next.every((x) => counted.includes(x));
    if (next.length === count && !same) void save(next);
    else if (same) setDraft(null);
  };

  return (
    <div
      className="flex flex-wrap items-center font-sans text-brand-gray-dark"
      style={{ ...SMALL_TEXT, gap: 'min(6px, 1.5cqmin)' }}
    >
      <span className="font-semibold">{label}</span>
      <button
        ref={ref}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Answers that count in ${sectionTitle || 'this section'}`}
        disabled={saving}
        onClick={() => setOpen((o) => !o)}
        {...tourFieldAttr('quiz-results.counted-answers', 'quiz', sectionId)}
        className="inline-flex items-center rounded-md border border-brand-gray-lighter bg-white font-semibold text-brand-gray-darkest hover:border-brand-blue-light disabled:opacity-60"
        style={{
          ...SMALL_TEXT,
          gap: 'min(4px, 1cqmin)',
          padding: 'min(3px, 0.8cqmin) min(8px, 2cqmin)',
        }}
      >
        {numbers}
        <ChevronDown aria-hidden style={SMALL_ICON} />
      </button>
      <CellPopover
        open={open}
        onClose={() => {
          setOpen(false);
          setDraft(null);
        }}
        anchorRef={ref}
        className="max-h-[300px] overflow-y-auto"
      >
        <div role="menu" aria-label={`Pick ${count} to count`}>
          <p className="px-2.5 pt-1 pb-1.5 text-xs font-semibold text-slate-500">
            Pick {count} to count
          </p>
          {options.map((o) => {
            const on = picked.includes(o.questionId);
            const full = !on && picked.length >= count;
            return (
              <button /* no-tour-anchor: per-student menu row, depends on live answers */
                key={o.questionId}
                type="button"
                role="menuitemcheckbox"
                aria-checked={on}
                disabled={saving || full}
                onClick={() => toggle(o.questionId)}
                className={`flex w-full max-w-[320px] items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-slate-50 focus:bg-slate-50 focus:outline-hidden disabled:opacity-50 ${on ? 'font-semibold text-slate-900' : 'text-slate-700'}`}
              >
                <span className="w-4 shrink-0 text-brand-blue-primary">
                  {on && <Check size={16} aria-hidden />}
                </span>
                <span className="shrink-0 tabular-nums">Q{o.number}</span>
                <span className="flex-1 truncate font-normal text-slate-600">
                  {plainPromptText(o.text)}
                </span>
              </button>
            );
          })}
          {teacherPicked && (
            <button /* no-tour-anchor: only after a teacher has changed the pick */
              type="button"
              role="menuitem"
              disabled={saving}
              onClick={() => {
                setOpen(false);
                void save(null);
              }}
              className="mt-1 w-full border-t border-slate-100 px-2.5 pt-2 pb-1 text-left text-sm font-semibold text-brand-blue-primary hover:underline"
            >
              Use the first {count}
            </button>
          )}
        </div>
      </CellPopover>
    </div>
  );
};
