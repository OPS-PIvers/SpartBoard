// The defining choice above the assign steps, e.g. Students submit work / Study resource (D2).
import React from 'react';
import type { TourAnchorAttrs } from '@/config/tourAnchors';
import { SegmentedControl } from '@/components/common/SegmentedControl';

export interface AssignTopSwitchOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ElementType;
  anchor?: TourAnchorAttrs;
}

export function AssignTopSwitch<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  anchor,
}: {
  value: T;
  onChange: (value: T) => void;
  options: AssignTopSwitchOption<T>[];
  ariaLabel: string;
  anchor?: TourAnchorAttrs;
}): React.ReactElement {
  return (
    <SegmentedControl
      role="radiogroup"
      fullWidth
      value={value}
      onChange={onChange}
      options={options}
      ariaLabel={ariaLabel}
      anchor={anchor}
    />
  );
}
