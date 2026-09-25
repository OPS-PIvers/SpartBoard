import React from 'react';
import type { ProjectStepState } from '@/types';
import { STATE_STYLES } from './stepVisuals';

export const StateMark: React.FC<{ state: ProjectStepState; size: string }> = ({
  state,
  size,
}) => {
  const Mark = STATE_STYLES[state].Mark;
  if (!Mark) return null;
  return <Mark aria-hidden style={{ width: size, height: size }} />;
};
