// Regression test: the category/stem mutators must thread `buildingDefaults`
// through their `onChange` calls, since the parent (FeatureConfigurationPanel)
// replaces `config` wholesale rather than deep-merging it — a mutator that
// omits `buildingDefaults` silently wipes any building appearance defaults
// already set for this widget.

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import type { TalkingToolGlobalConfig } from '@/types';

import { TalkingToolConfigurationPanel } from '@/components/admin/TalkingToolConfigurationPanel';

afterEach(cleanup);

const CONFIG_WITH_BUILDING_DEFAULTS: TalkingToolGlobalConfig = {
  categories: [
    {
      id: 'cat-a',
      label: 'Category A',
      color: '#111111',
      icon: 'MessageSquare',
      stems: [{ id: 'a1', text: 'Stem A' }],
    },
  ],
  buildingDefaults: {
    high: { buildingId: 'high', cardColor: '#abcdef', cardOpacity: 0.5 },
  },
};

const makeOnChange = () => vi.fn<(config: TalkingToolGlobalConfig) => void>();

describe('TalkingToolConfigurationPanel — buildingDefaults preservation', () => {
  it('preserves buildingDefaults when adding a category', () => {
    const onChange = makeOnChange();
    render(
      <TalkingToolConfigurationPanel
        config={CONFIG_WITH_BUILDING_DEFAULTS}
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /add category/i }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].buildingDefaults).toEqual(
      CONFIG_WITH_BUILDING_DEFAULTS.buildingDefaults
    );
  });

  it('preserves buildingDefaults when removing a category', () => {
    const onChange = makeOnChange();
    render(
      <TalkingToolConfigurationPanel
        config={CONFIG_WITH_BUILDING_DEFAULTS}
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByLabelText('Remove category'));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].buildingDefaults).toEqual(
      CONFIG_WITH_BUILDING_DEFAULTS.buildingDefaults
    );
  });

  it('preserves buildingDefaults when adding a stem', () => {
    const onChange = makeOnChange();
    render(
      <TalkingToolConfigurationPanel
        config={CONFIG_WITH_BUILDING_DEFAULTS}
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /add stem/i }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].buildingDefaults).toEqual(
      CONFIG_WITH_BUILDING_DEFAULTS.buildingDefaults
    );
  });

  it('preserves buildingDefaults when editing a stem', () => {
    const onChange = makeOnChange();
    render(
      <TalkingToolConfigurationPanel
        config={CONFIG_WITH_BUILDING_DEFAULTS}
        onChange={onChange}
      />
    );

    fireEvent.change(screen.getByPlaceholderText('Enter sentence stem...'), {
      target: { value: 'Updated stem text' },
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].buildingDefaults).toEqual(
      CONFIG_WITH_BUILDING_DEFAULTS.buildingDefaults
    );
  });

  it('preserves buildingDefaults when removing a stem', () => {
    const onChange = makeOnChange();
    render(
      <TalkingToolConfigurationPanel
        config={CONFIG_WITH_BUILDING_DEFAULTS}
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByLabelText('Remove stem'));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].buildingDefaults).toEqual(
      CONFIG_WITH_BUILDING_DEFAULTS.buildingDefaults
    );
  });

  it('preserves buildingDefaults when editing a category label', () => {
    const onChange = makeOnChange();
    render(
      <TalkingToolConfigurationPanel
        config={CONFIG_WITH_BUILDING_DEFAULTS}
        onChange={onChange}
      />
    );

    fireEvent.change(screen.getByPlaceholderText('Category Label'), {
      target: { value: 'Renamed' },
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].buildingDefaults).toEqual(
      CONFIG_WITH_BUILDING_DEFAULTS.buildingDefaults
    );
  });
});
