// Students / Staff choice at the top of the Classes step, shown only with the staff-audience flag.
import React from 'react';
import { GraduationCap, UsersRound } from 'lucide-react';
import { tourAttr } from '@/config/tourAnchors';
import { SegmentedControl } from '@/components/common/SegmentedControl';
import {
  STAFF_EMAIL_DOMAIN,
  type AssignmentAudience,
} from '@/utils/staffAudience';

const OPTIONS: {
  value: AssignmentAudience;
  label: string;
  icon: React.ElementType;
}[] = [
  { value: 'students', label: 'Students', icon: GraduationCap },
  { value: 'staff', label: 'Staff', icon: UsersRound },
];

export const AssignAudienceSwitch: React.FC<{
  value: AssignmentAudience;
  onChange: (value: AssignmentAudience) => void;
}> = ({ value, onChange }) => (
  <div className="space-y-2">
    <SegmentedControl
      role="radiogroup"
      fullWidth
      value={value}
      onChange={onChange}
      options={OPTIONS}
      ariaLabel="Audience"
      anchor={tourAttr('assign-audience.switch')}
    />
    {value === 'staff' && (
      <p className="text-xs text-slate-500">
        Signed-in @{STAFF_EMAIL_DOMAIN} accounts only. Results show each
        person&apos;s name and email.
      </p>
    )}
  </div>
);
