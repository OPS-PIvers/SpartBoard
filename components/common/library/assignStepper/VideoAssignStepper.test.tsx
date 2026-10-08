import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Plc } from '@/types';
import type { AssignPeriodAccessContext } from '../AssignPeriodAccessSection';
import {
  VideoAssignStepper,
  type VideoAssignStepperProps,
} from './VideoAssignStepper';
import { initialClassesValue } from './VideoAssignStepper.helpers';
import { SAMPLE_ROSTERS } from './assignStepperTestRosters';

const PLCS = [
  { id: 'plc-a', name: 'Grade 8 Science PLC' },
  { id: 'plc-b', name: 'Orono MS Science' },
] as Plc[];

const PERIODS: AssignPeriodAccessContext = {
  bellOptions: [],
  bellWindow: () => ({ openAt: 1, closeAt: 2 }),
  onTagRoster: vi.fn(),
};

const renderStepper = (props: Partial<VideoAssignStepperProps> = {}) => {
  const onSubmit = vi.fn<VideoAssignStepperProps['onSubmit']>(() =>
    Promise.resolve()
  );
  render(
    <VideoAssignStepper
      onClose={vi.fn()}
      title="Cell Division Video"
      rosters={SAMPLE_ROSTERS}
      plcs={[]}
      canAssignLive={false}
      lastPacing={null}
      initialClassIds={['c1', 'c2']}
      onSubmit={onSubmit}
      {...props}
    />
  );
  return { onSubmit };
};

const stepHeader = (name: string) =>
  screen.getByRole('button', { name: new RegExp(`^\\d${name}`) });
const assign = (name = 'Assign') =>
  fireEvent.click(screen.getByRole('button', { name }));

describe('VideoAssignStepper', () => {
  it('self-paced shows Classes and When with no pacing switch when live is off', () => {
    renderStepper();
    expect(screen.queryByRole('radiogroup', { name: 'Pacing' })).toBeNull();
    expect(stepHeader('Classes')).toBeInTheDocument();
    expect(stepHeader('When')).toBeInTheDocument();
    expect(screen.queryByText('Sharing')).toBeNull();
    expect(screen.getByText(/Modifications:/)).toBeInTheDocument();
  });

  it('adds Sharing for a teacher in a PLC and blocks Assign until a PLC is picked', async () => {
    const { onSubmit } = renderStepper({ plcs: PLCS });
    fireEvent.click(stepHeader('Sharing'));
    fireEvent.click(screen.getByRole('switch', { name: /Share results/ }));
    expect(screen.getByRole('button', { name: 'Assign' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('PLC'), {
      target: { value: 'plc-b' },
    });
    assign();
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].plc?.id).toBe('plc-b');
  });

  it('live keeps one class, hides student picks and modifications, and starts live', async () => {
    const { onSubmit } = renderStepper({
      canAssignLive: true,
      lastPacing: 'teacher',
      plcs: PLCS,
    });
    expect(stepHeader('Class')).toBeInTheDocument();
    expect(screen.queryByText(/Modifications:/)).toBeNull();
    expect(screen.queryByText('All students')).toBeNull();
    expect(stepHeader('Sharing')).toBeInTheDocument();
    fireEvent.click(stepHeader('When'));
    expect(
      screen.getByText('Starts paused. You start it from the board.')
    ).toBeInTheDocument();
    assign('Start live');
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const result = onSubmit.mock.calls[0][0];
    expect(result.pacing).toBe('teacher');
    expect(result.classes).toEqual({ classIds: ['c1'], studentsByClass: {} });
    expect(result.manualStart).toBe(false);
    expect(result.targeting.openAt).toBeUndefined();
  });

  it('switching pacing back to self-paced shows the student picks again', () => {
    renderStepper({ canAssignLive: true });
    fireEvent.click(screen.getByRole('radio', { name: /Teacher-paced/ }));
    expect(screen.queryByText(/Modifications:/)).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: /Self-paced/ }));
    expect(screen.getByText(/Modifications:/)).toBeInTheDocument();
  });

  it('defaults to Scheduled and resolves dates on assign', async () => {
    const { onSubmit } = renderStepper({ periodAccess: PERIODS });
    assign();
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const result = onSubmit.mock.calls[0][0];
    expect(result.manualStart).toBe(false);
    expect(typeof result.targeting.openAt).toBe('number');
  });

  it('Manual sends manualStart with an assessment plan and no due date', async () => {
    const { onSubmit } = renderStepper({ periodAccess: PERIODS });
    fireEvent.click(stepHeader('When'));
    fireEvent.click(screen.getByRole('radio', { name: 'Manual' }));
    assign();
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const result = onSubmit.mock.calls[0][0];
    expect(result.manualStart).toBe(true);
    expect(result.targeting.periodPlan).toEqual({ mode: 'assessment' });
    expect(result.targeting.dueAt).toBeUndefined();
  });

  it('hides Manual without bell periods', () => {
    renderStepper();
    fireEvent.click(stepHeader('When'));
    expect(screen.queryByRole('radio', { name: 'Manual' })).toBeNull();
  });
});

describe('initialClassesValue', () => {
  it('sorts pre-picked students into their classes and drops unknown ones', () => {
    const rows = initialClassesValue(
      SAMPLE_ROSTERS,
      ['c1', 'c2'],
      [
        { kind: 'classlink', sourcedId: 'SID-a' },
        { kind: 'classlink', sourcedId: 'SID-zzz' },
      ]
    );
    expect(rows.classIds).toEqual(['c1', 'c2']);
    expect(Object.keys(rows.studentsByClass)).toEqual(['c1']);
    expect(rows.studentsByClass.c1).toHaveLength(1);
  });
});
