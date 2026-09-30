import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PlcGradebookSectionView } from './PlcGradebookSection';
import { DEFAULT_PROFICIENCY_SCALE } from '@/utils/gradebook/gradebookCore';
import { defaultSettingsBody } from '@/utils/gradebook/settingsConfig';

const base = () => ({
  plcId: 'p1',
  plcName: 'Grade 8 ELA',
  loading: false,
  cutoffs: { proficient: 85, approaching: 70 },
  districtScale: DEFAULT_PROFICIENCY_SCALE,
  orgName: 'Orono',
  save: vi.fn((_b: unknown) => Promise.resolve()),
  remove: vi.fn(() => Promise.resolve()),
  saveCutoffs: vi.fn((_c: unknown) => Promise.resolve()),
  notify: vi.fn(),
  fail: vi.fn(),
});

describe('PlcGradebookSectionView', () => {
  it('lets a lead share defaults on the PLC scale', () => {
    const p = base();
    render(<PlcGradebookSectionView {...p} canEdit body={null} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Share gradebook settings' })
    );
    expect(p.save).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Grade 8 ELA',
        scale: { source: 'plc', plcId: 'p1' },
      })
    );
  });

  it('shows members the set read-only', () => {
    const p = base();
    render(
      <PlcGradebookSectionView
        {...p}
        canEdit={false}
        body={{
          ...defaultSettingsBody('Grade 8 ELA'),
          scale: { source: 'plc', plcId: 'p1' },
        }}
      />
    );
    expect(screen.queryByRole('button', { name: 'Stop sharing' })).toBeNull();
    expect(screen.getByLabelText('Proficient cutoff')).toHaveProperty(
      'disabled',
      true
    );
  });

  it('saves the lead cutoff edit to the PLC scale, not the set', () => {
    const p = base();
    render(
      <PlcGradebookSectionView
        {...p}
        canEdit
        body={{
          ...defaultSettingsBody('Grade 8 ELA'),
          scale: { source: 'plc', plcId: 'p1' },
        }}
      />
    );
    const top = screen.getByLabelText('Proficient cutoff');
    fireEvent.change(top, { target: { value: '90' } });
    fireEvent.blur(top);
    expect(p.saveCutoffs).toHaveBeenCalledWith(
      expect.objectContaining({ proficient: 90, approaching: 70 })
    );
    expect(p.save).not.toHaveBeenCalled();
  });
});
