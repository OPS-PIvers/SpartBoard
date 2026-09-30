import React from 'react';
import {
  DEFAULT_PROFICIENCY_SCALE,
  type ProficiencyScale,
} from '@/utils/gradebook/gradebookCore';
import { clampPct } from '@/utils/gradebook/settingsConfig';
import { SECTION } from '@/components/gradebook/settings/GradebookSettingsEditor';
import type { UndoEntry } from '@/components/gradebook/settings/useUndoToast';

const FIELD =
  'h-8 px-2.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-800 focus:outline-none focus:border-brand-blue-primary focus:ring-[3px] focus:ring-brand-blue-primary/30';

const LEVEL_LABELS = [
  'Top level name',
  'Middle level name',
  'Bottom level name',
];

/** D17 organization proficiency scale: three level names and two cutoffs. */
export const DistrictScaleCard: React.FC<{
  title: string;
  scale: ProficiencyScale;
  onSave: (next: ProficiencyScale) => Promise<void>;
  notify: (message: string, undo?: UndoEntry) => void;
  fail: (err: unknown) => void;
}> = ({ title, scale, onSave, notify, fail }) => {
  const commit = (next: ProficiencyScale, message: string) => {
    const prev = {
      ...scale,
      levelNames: [...scale.levelNames],
    } as ProficiencyScale;
    onSave(next).catch(fail);
    notify(message, { run: () => onSave(prev) });
  };

  return (
    <section className={SECTION} aria-labelledby="gb-admin-scale">
      <h3 id="gb-admin-scale" className="text-sm font-bold text-slate-800">
        {title}
      </h3>
      <div className="grid grid-cols-[240px_auto_auto] justify-start items-center gap-x-3 gap-y-2">
        {([0, 1, 2] as const).map((lvl) => (
          <React.Fragment key={lvl}>
            <input
              key={scale.levelNames[lvl]}
              defaultValue={scale.levelNames[lvl]}
              maxLength={30}
              aria-label={LEVEL_LABELS[lvl]}
              className={FIELD}
              onBlur={(e) => {
                const name =
                  e.currentTarget.value.trim() ||
                  DEFAULT_PROFICIENCY_SCALE.levelNames[lvl];
                if (name === scale.levelNames[lvl]) return;
                const names = [...scale.levelNames] as [string, string, string];
                names[lvl] = name;
                commit(
                  { ...scale, levelNames: names },
                  `Renamed level to ${name}`
                );
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
            />
            <span className="text-sm text-slate-500">
              {lvl < 2 ? 'at or above' : 'below'}
            </span>
            {lvl < 2 ? (
              <span className="inline-flex items-center gap-1.5 text-sm text-slate-500">
                <input
                  key={lvl === 0 ? scale.proficient : scale.approaching}
                  type="number"
                  inputMode="numeric"
                  min={lvl === 0 ? 1 : 0}
                  max={lvl === 0 ? 100 : 99}
                  defaultValue={
                    lvl === 0 ? scale.proficient : scale.approaching
                  }
                  aria-label={`${scale.levelNames[lvl]} cutoff`}
                  className={`${FIELD} w-[76px]`}
                  onBlur={(e) => {
                    const raw = Number(e.currentTarget.value);
                    const next = { ...scale };
                    if (lvl === 0) next.proficient = clampPct(raw, 1, 100);
                    else next.approaching = clampPct(raw, 0, 99);
                    if (next.approaching >= next.proficient)
                      next.approaching = next.proficient - 1;
                    if (
                      next.proficient === scale.proficient &&
                      next.approaching === scale.approaching
                    ) {
                      e.currentTarget.value = String(
                        lvl === 0 ? scale.proficient : scale.approaching
                      );
                      return;
                    }
                    commit(next, 'Changed cutoff');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                  }}
                />
                <span>%</span>
              </span>
            ) : (
              <span className="text-sm font-bold text-slate-700">
                {scale.approaching}%
              </span>
            )}
          </React.Fragment>
        ))}
      </div>
    </section>
  );
};
