// The defining choice above the assign steps, e.g. Students submit work / Study resource (D2).
import React from 'react';
import { SegmentedControl } from '@/components/common/SegmentedControl';

export interface AssignTopSwitchOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ElementType;
}

export function AssignTopSwitch<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (value: T) => void;
  options: AssignTopSwitchOption<T>[];
  ariaLabel: string;
}): React.ReactElement {
  return (
    <SegmentedControl
      role="radiogroup"
      fullWidth
      value={value}
      onChange={onChange}
      options={options}
      ariaLabel={ariaLabel}
    />
  );
}
