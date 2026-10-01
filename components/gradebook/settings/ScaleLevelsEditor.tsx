import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import {
  MIN_SCALE_LEVELS,
  SCALE_COLORS,
  normalizeScale,
  type ProficiencyScale,
  type ScaleColor,
  type ScaleLevel,
} from '@/utils/gradebook/gradebookCore';
import {
  SCALE_COLOR_LABELS,
  SCALE_COLOR_STYLES,
} from '@/utils/gradebook/scaleColors';
import { addScaleLevel, clampPct } from '@/utils/gradebook/settingsConfig';
import { CommitInput, ICON_BTN, LINK_BTN, PctInput } from './settingsFields';

export type ScaleEditKind = 'cutoff' | 'level';

const ColorPicker: React.FC<{
  level: ScaleLevel;
  disabled: boolean;
  onPick: (color: ScaleColor) => void;
}> = ({ level, disabled, onPick }) => {
  const [open, setOpen] = useState(false);
  return (
    <span
      className="relative inline-flex"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpen(false);
      }}
    >
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`${level.name} color: ${SCALE_COLOR_LABELS[level.color]}`}
        title={SCALE_COLOR_LABELS[level.color]}
        onClick={() => setOpen((o) => !o)}
        className={`h-[22px] w-[22px] shrink-0 rounded focus:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-blue-primary/30 disabled:cursor-default ${SCALE_COLOR_STYLES[level.color].bar}`}
      />
      {open && (
        <span
          role="group"
          aria-label={`${level.name} color`}
          className="absolute left-0 top-full z-20 mt-1.5 grid w-max grid-cols-4 gap-1.5 rounded-lg border border-slate-200 bg-white p-2 shadow-lg"
        >
          {SCALE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={SCALE_COLOR_LABELS[c]}
              aria-pressed={c === level.color}
              title={SCALE_COLOR_LABELS[c]}
              onClick={() => {
                setOpen(false);
                if (c !== level.color) onPick(c);
              }}
              className={`h-6 w-6 rounded focus:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-blue-primary/30 ${SCALE_COLOR_STYLES[c].bar} ${c === level.color ? 'ring-2 ring-slate-800 ring-offset-1' : ''}`}
            />
          ))}
        </span>
      )}
    </span>
  );
};

/** Level rows: color, name, cutoff, remove; plus Add level. */
export const ScaleLevelsEditor: React.FC<{
  scale: ProficiencyScale;
  editable: boolean;
  /** Defaults to `editable`; a shared PLC scale opens only its top two cutoffs. */
  cutoffEditable?: (level: number) => boolean;
  onCommit: (
    next: ProficiencyScale,
    label: string,
    kind: ScaleEditKind
  ) => void;
}> = ({ scale, editable, cutoffEditable = () => editable, onCommit }) => {
  const levels = scale.levels;
  const n = levels.length;
  const patch = (i: number, p: Partial<ScaleLevel>) =>
    normalizeScale({
      levels: levels.map((l, k) => (k === i ? { ...l, ...p } : { ...l })),
    });
  const added = editable ? addScaleLevel(scale) : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-[auto_minmax(0,260px)_auto_auto_auto] items-center justify-start gap-x-2.5 gap-y-2">
        {levels.map((l, i) => {
          const bottom = i === n - 1;
          return (
            <React.Fragment key={i}>
              <ColorPicker
                level={l}
                disabled={!editable}
                onPick={(color) =>
                  onCommit(patch(i, { color }), 'Level color', 'level')
                }
              />
              <CommitInput
                value={l.name}
                disabled={!editable}
                maxLength={30}
                aria-label={`Level ${i + 1} name`}
                className="w-full min-w-0"
                onCommit={(raw) => {
                  const name = raw.trim();
                  if (name) onCommit(patch(i, { name }), 'Level name', 'level');
                }}
              />
              <span className="text-[13px] text-slate-500">
                {bottom ? 'below' : 'at or above'}
              </span>
              {bottom ? (
                <span className="text-sm font-bold text-slate-700">
                  {levels[i - 1].min}%
                </span>
              ) : (
                <PctInput
                  value={l.min}
                  disabled={!cutoffEditable(i)}
                  min={n - 1 - i}
                  max={i === 0 ? 100 : levels[i - 1].min - 1}
                  label={`${l.name} cutoff`}
                  onCommit={(raw) => {
                    const min = clampPct(Number(raw), 0, 100);
                    const next = { levels: levels.map((x) => ({ ...x })) };
                    next.levels[i].min = min;
                    // Push neighbours out of the way so the edited cutoff sticks.
                    for (let k = i - 1; k >= 0; k--)
                      if (next.levels[k].min <= next.levels[k + 1].min)
                        next.levels[k].min = next.levels[k + 1].min + 1;
                    for (let k = i + 1; k < n - 1; k++)
                      if (next.levels[k].min >= next.levels[k - 1].min)
                        next.levels[k].min = next.levels[k - 1].min - 1;
                    onCommit(normalizeScale(next), 'Cutoff', 'cutoff');
                  }}
                />
              )}
              {editable ? (
                <button
                  type="button"
                  className={ICON_BTN}
                  disabled={n <= MIN_SCALE_LEVELS}
                  title="Remove level"
                  aria-label={`Remove ${l.name}`}
                  onClick={() =>
                    onCommit(
                      normalizeScale({
                        levels: levels
                          .filter((_, k) => k !== i)
                          .map((x) => ({ ...x })),
                      }),
                      'Levels',
                      'level'
                    )
                  }
                >
                  <Trash2 size={15} aria-hidden />
                </button>
              ) : (
                <span />
              )}
            </React.Fragment>
          );
        })}
      </div>
      {editable && (
        <div>
          <button
            type="button"
            className={`${LINK_BTN} disabled:opacity-50 disabled:no-underline`}
            disabled={!added}
            onClick={() => added && onCommit(added, 'Levels', 'level')}
          >
            + Add level
          </button>
        </div>
      )}
    </div>
  );
};
