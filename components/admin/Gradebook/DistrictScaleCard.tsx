import React from 'react';
import type { ProficiencyScale } from '@/utils/gradebook/gradebookCore';
import { SECTION } from '@/components/gradebook/settings/GradebookSettingsEditor';
import { ScaleLevelsEditor } from '@/components/gradebook/settings/ScaleLevelsEditor';
import type { UndoEntry } from '@/components/gradebook/settings/useUndoToast';

/** D17 organization proficiency scale: 2-6 named, colored levels and their cutoffs. */
export const DistrictScaleCard: React.FC<{
  title: string;
  scale: ProficiencyScale;
  onSave: (next: ProficiencyScale) => Promise<void>;
  notify: (message: string, undo?: UndoEntry) => void;
  fail: (err: unknown) => void;
}> = ({ title, scale, onSave, notify, fail }) => (
  <section className={SECTION} aria-labelledby="gb-admin-scale">
    <h3 id="gb-admin-scale" className="text-sm font-bold text-slate-800">
      {title}
    </h3>
    <ScaleLevelsEditor
      scale={scale}
      editable
      onCommit={(next, label) => {
        const prev = { levels: scale.levels.map((l) => ({ ...l })) };
        onSave(next).catch(fail);
        notify(`Changed ${label.toLowerCase()}`, {
          run: () => onSave(prev),
        });
      }}
    />
  </section>
);
