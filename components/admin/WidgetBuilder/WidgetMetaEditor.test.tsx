import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { WidgetMetaEditor } from './WidgetMetaEditor';
import { clampWidgetDimension, WidgetMeta } from './types';

vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => [],
}));

const baseMeta: WidgetMeta = {
  title: 'Test Widget',
  slug: 'test-widget',
  description: '',
  icon: '',
  color: 'bg-blue-500',
  defaultWidth: 400,
  defaultHeight: 300,
  buildings: [],
  accessLevel: 'public',
  betaUsers: [],
};

// Regression: clearing the Width/Height fields fed `Number('')` (0) straight
// into config, persisting a 0x0 default size for the custom widget.
describe('WidgetMetaEditor default size inputs', () => {
  it('clamps an emptied Width field to the minimum instead of 0', () => {
    const onChange = vi.fn();
    render(<WidgetMetaEditor meta={baseMeta} onChange={onChange} />);
    fireEvent.change(screen.getByDisplayValue('400'), {
      target: { value: '' },
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ defaultWidth: 200 })
    );
  });

  it('clamps an emptied Height field to the minimum instead of 0', () => {
    const onChange = vi.fn();
    render(<WidgetMetaEditor meta={baseMeta} onChange={onChange} />);
    fireEvent.change(screen.getByDisplayValue('300'), {
      target: { value: '' },
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ defaultHeight: 150 })
    );
  });

  it('clamps an out-of-range Width value to the max', () => {
    const onChange = vi.fn();
    render(<WidgetMetaEditor meta={baseMeta} onChange={onChange} />);
    fireEvent.change(screen.getByDisplayValue('400'), {
      target: { value: '5000' },
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ defaultWidth: 1200 })
    );
  });
});

describe('clampWidgetDimension', () => {
  it('coerces an empty string to the minimum', () => {
    expect(clampWidgetDimension('', 200, 1200)).toBe(200);
  });

  it('coerces a non-numeric string to the minimum', () => {
    expect(clampWidgetDimension('abc', 200, 1200)).toBe(200);
  });

  it('clamps a value below the minimum', () => {
    expect(clampWidgetDimension('10', 200, 1200)).toBe(200);
  });

  it('clamps a value above the maximum', () => {
    expect(clampWidgetDimension('5000', 200, 1200)).toBe(1200);
  });

  it('passes through an in-range value unchanged', () => {
    expect(clampWidgetDimension('500', 200, 1200)).toBe(500);
  });
});
