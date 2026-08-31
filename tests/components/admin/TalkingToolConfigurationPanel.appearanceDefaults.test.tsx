// Regression tests for the Appearance Defaults section: (1) the two labels
// must be programmatically associated with their controls (WCAG 1.3.1), and
// (2) touching only the colour/opacity controls must never force-write
// DEFAULT_TALKING_TOOL_CATEGORIES into a config that never had `categories`
// persisted — that would silently freeze the default stem library into
// Firestore as a side effect of an unrelated action.

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import type { TalkingToolGlobalConfig } from '@/types';

vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => [{ id: 'high', name: 'Test High School' }],
}));

import { TalkingToolConfigurationPanel } from '@/components/admin/TalkingToolConfigurationPanel';

afterEach(cleanup);

const makeOnChange = () => vi.fn<(config: TalkingToolGlobalConfig) => void>();

describe('TalkingToolConfigurationPanel — Appearance Defaults section', () => {
  it('associates the surface colour and opacity labels with their controls', () => {
    render(<TalkingToolConfigurationPanel config={{}} onChange={vi.fn()} />);

    expect(screen.getByLabelText('Default Surface Colour')).toBeInTheDocument();
    expect(
      screen.getByLabelText(/Default Surface Opacity/)
    ).toBeInTheDocument();
  });

  it('does not force-write default categories when only the colour swatch changes', () => {
    const onChange = makeOnChange();
    render(<TalkingToolConfigurationPanel config={{}} onChange={onChange} />);

    fireEvent.change(
      screen.getByLabelText('Pick default Talking Tool surface colour'),
      { target: { value: '#abcdef' } }
    );

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).not.toHaveProperty('categories');
    expect(onChange.mock.calls[0][0].buildingDefaults).toEqual({
      high: { buildingId: 'high', cardColor: '#abcdef' },
    });
  });

  it('does not force-write default categories when only the opacity slider changes', () => {
    const onChange = makeOnChange();
    render(<TalkingToolConfigurationPanel config={{}} onChange={onChange} />);

    fireEvent.change(
      screen.getByLabelText('Default Talking Tool surface opacity'),
      { target: { value: '0.5' } }
    );

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).not.toHaveProperty('categories');
  });

  it('still passes through previously-persisted categories unchanged', () => {
    const onChange = makeOnChange();
    const config: TalkingToolGlobalConfig = {
      categories: [
        {
          id: 'cat-a',
          label: 'Category A',
          color: '#111111',
          icon: 'MessageSquare',
          stems: [{ id: 'a1', text: 'Stem A' }],
        },
      ],
    };
    render(
      <TalkingToolConfigurationPanel config={config} onChange={onChange} />
    );

    fireEvent.change(
      screen.getByLabelText('Pick default Talking Tool surface colour'),
      { target: { value: '#abcdef' } }
    );

    expect(onChange.mock.calls[0][0].categories).toEqual(config.categories);
  });
});
