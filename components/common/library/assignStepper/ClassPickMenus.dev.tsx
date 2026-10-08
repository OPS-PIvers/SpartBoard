import { useState } from 'react';
import { ClassPickerMenu } from './ClassPickerMenu';
import { StudentPickMenu } from './StudentPickMenu';
import {
  formatClassesValue,
  type AssignClassesValue,
} from './assignClassesValue';
import { SAMPLE_ROSTERS } from './assignStepperTestRosters';

function ClassPickMenusPreview() {
  const [value, setValue] = useState<AssignClassesValue>({
    classIds: ['c1', 'c2'],
    studentsByClass: {
      c2: [
        { kind: 'classlink', sourcedId: 'SID-e' },
        { kind: 'classlink', sourcedId: 'SID-f' },
        { kind: 'classlink', sourcedId: 'SID-g' },
      ],
    },
  });
  const [single, setSingle] = useState<AssignClassesValue>({
    classIds: ['c1'],
    studentsByClass: {},
  });
  return (
    <div className="flex flex-wrap items-start gap-6">
      <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
        <p className="mb-3 text-xs text-slate-500">
          Step value: {formatClassesValue(value, SAMPLE_ROSTERS)}
        </p>
        <div className="space-y-3 pb-72">
          <ClassPickerMenu
            rosters={SAMPLE_ROSTERS}
            value={value}
            onChange={setValue}
          />
          <StudentPickMenu
            rosters={SAMPLE_ROSTERS}
            value={value}
            onChange={setValue}
          />
        </div>
      </div>
      <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
        <p className="mb-3 text-xs text-slate-500">Single class (live)</p>
        <div className="pb-48">
          <ClassPickerMenu
            rosters={SAMPLE_ROSTERS}
            value={single}
            onChange={setSingle}
            singleSelect
          />
        </div>
      </div>
    </div>
  );
}

const ClassPickMenusDev = {
  title: 'Class and student pick menus',
  render: ClassPickMenusPreview,
};

export default ClassPickMenusDev;
