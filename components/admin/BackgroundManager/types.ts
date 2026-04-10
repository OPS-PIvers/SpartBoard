import React from 'react';
import { BackgroundPreset, AccessLevel } from '@/types';

export interface PresetCardProps {
  preset: BackgroundPreset;
  editingId: string | null;
  editName: string;
  editingCategoryPresetId: string | null;
  editingCategoryValue: string;
  allCategories: string[];
  setEditingId: (id: string | null) => void;
  setEditName: (name: string) => void;
  setEditingCategoryPresetId: (id: string | null) => void;
  setEditingCategoryValue: (name: string) => void;
  updatePreset: (
    id: string,
    updates: Partial<BackgroundPreset>
  ) => Promise<void>;
  clearPresetCategory: (id: string) => Promise<void>;
  deletePreset: (preset: BackgroundPreset) => Promise<void>;
  addBetaUser: (presetId: string, email: string) => Promise<void>;
  removeBetaUser: (presetId: string, email: string) => Promise<void>;
  toggleBuildingId: (presetId: string, buildingId: string) => Promise<void>;
  toggleFeatured: (presetId: string) => Promise<void>;
  getAccessLevelIcon: (level: AccessLevel) => React.ReactNode;
  getAccessLevelColor: (level: AccessLevel) => string;
}
