import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Plc } from '@/types';
import { SharingStep } from './SharingStep';
import {
  formatSharingValue,
  isSharingStepAvailable,
  resolveSharingPlc,
} from './SharingStep.format';

const A = { id: 'a', name: 'Grade 8 Science PLC' } as Plc;
const B = { id: 'b', name: 'Orono MS Science' } as Plc;

describe('formatSharingValue', () => {
  it('says not shared when off', () => {
    expect(
      formatSharingValue({ plcMode: false, plcId: 'a' }, { plcs: [A, B] })
    ).toBe('Not shared');
  });

  it('names the chosen PLC', () => {
    expect(
      formatSharingValue({ plcMode: true, plcId: 'b' }, { plcs: [A, B] })
    ).toBe('Shared with Orono MS Science');
  });

  it('names a sole PLC without an explicit pick', () => {
    expect(
      formatSharingValue({ plcMode: true, plcId: '' }, { plcs: [A] })
    ).toBe('Shared with Grade 8 Science PLC');
  });

  it('says not shared when on with no PLC picked among several', () => {
    expect(
      formatSharingValue({ plcMode: true, plcId: '' }, { plcs: [A, B] })
    ).toBe('Not shared');
  });
});

describe('resolveSharingPlc', () => {
  it('drops a stale id', () => {
    expect(resolveSharingPlc({ plcMode: true, plcId: 'gone' }, [A, B])).toBe(
      null
    );
  });
});

describe('isSharingStepAvailable', () => {
  it('needs a PLC and work that collects submissions', () => {
    expect(isSharingStepAvailable([A], 'work')).toBe(true);
    expect(isSharingStepAvailable([A], 'resource')).toBe(false);
    expect(isSharingStepAvailable([], 'work')).toBe(false);
  });
});

describe('SharingStep', () => {
  it('renders nothing without PLCs', () => {
    const { container } = render(
      <SharingStep
        value={{ plcMode: false, plcId: '' }}
        onChange={vi.fn()}
        plcs={[]}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('toggles sharing on', () => {
    const onChange = vi.fn();
    render(
      <SharingStep
        value={{ plcMode: false, plcId: '' }}
        onChange={onChange}
        plcs={[A, B]}
      />
    );
    expect(screen.queryByRole('combobox')).toBeNull();
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith({ plcMode: true, plcId: '' });
  });

  it('picks a PLC when there are several', () => {
    const onChange = vi.fn();
    render(
      <SharingStep
        value={{ plcMode: true, plcId: 'a' }}
        onChange={onChange}
        plcs={[A, B]}
      />
    );
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'b' } });
    expect(onChange).toHaveBeenCalledWith({ plcMode: true, plcId: 'b' });
  });

  it('names a sole PLC and shows no picker', () => {
    render(
      <SharingStep
        value={{ plcMode: true, plcId: '' }}
        onChange={vi.fn()}
        plcs={[A]}
      />
    );
    expect(
      screen.getByText('Share results with Grade 8 Science PLC')
    ).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).toBeNull();
  });
});
