import React from 'react';
import { SlidersHorizontal } from 'lucide-react';

// Slot stub: the settings slice (PR #3645) replaces this file; same export and props.
export interface GradebookClassOption {
  id: string;
  name: string;
}

export const GradebookSettingsButton: React.FC<{
  classes: GradebookClassOption[];
  currentClassId: string | null;
  className?: string;
}> = ({ className = '' }) => (
  <button
    type="button"
    aria-label="Settings"
    title="Settings"
    disabled
    className={className}
  >
    <SlidersHorizontal size={18} aria-hidden />
  </button>
);
