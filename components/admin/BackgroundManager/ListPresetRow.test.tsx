import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ListPresetRow } from './ListPresetRow';
import { PresetCardProps } from './types';
import { BackgroundPreset } from '@/types';

const preset: BackgroundPreset = {
  id: 'preset-1',
  url: 'https://example.com/bg.jpg',
  label: 'Ocean',
  active: true,
  accessLevel: 'public',
  betaUsers: [],
  createdAt: 0,
  tags: ['calm'],
};

const baseProps: PresetCardProps = {
  preset,
  editingId: null,
  editName: '',
  editingCategoryPresetId: null,
  editingCategoryValue: '',
  allCategories: [],
  allTags: [],
  setEditingId: vi.fn(),
  setEditName: vi.fn(),
  setEditingCategoryPresetId: vi.fn(),
  setEditingCategoryValue: vi.fn(),
  updatePreset: vi.fn(),
  clearPresetCategory: vi.fn(),
  deletePreset: vi.fn(),
  addBetaUser: vi.fn(),
  removeBetaUser: vi.fn(),
  toggleBuildingId: vi.fn(),
  toggleFeatured: vi.fn(),
  getAccessLevelIcon: () => null,
  getAccessLevelColor: () => '',
};

describe('ListPresetRow', () => {
  it('associates the Tags label with its TagInput field', () => {
    render(<ListPresetRow {...baseProps} />);

    expect(screen.getByLabelText('Tags')).toBe(
      screen.getByPlaceholderText('Add tag…')
    );
  });
});
