import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ProjectGroup, ProjectStep } from '@/types';
import { ProjectOwnGroupSteps } from './ProjectOwnGroupSteps';

const steps: ProjectStep[] = Array.from({ length: 8 }, (_, i) => ({
  id: `s${i}`,
  title: `Step ${i + 1}`,
}));

const group = (done: number): ProjectGroup => ({
  id: 'g1',
  name: 'Team A',
  classId: 'c1',
  memberUids: [],
  order: 0,
  updatedAt: 0,
  stepStates: Object.fromEntries(
    steps.slice(0, done).map((s) => [s.id, 'done'])
  ),
});

let width = 300;
const observers: Array<() => void> = [];

beforeEach(() => {
  width = 300;
  observers.length = 0;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private cb: () => void) {
        observers.push(() => this.cb());
      }
      observe = () => undefined;
      disconnect = () => undefined;
    }
  );
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(
    () => width
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const view = (done: number) => (
  <ProjectOwnGroupSteps
    group={group(done)}
    steps={steps}
    canEdit
    busyStepId={null}
    openStepId={null}
    onOpenStep={() => undefined}
    onPick={() => undefined}
  />
);

describe('ProjectOwnGroupSteps strip placement', () => {
  it('opens on the page of the first unfinished step', () => {
    render(view(4));
    expect(screen.getByRole('list').scrollLeft).toBeGreaterThan(0);
  });

  it('never moves the strip after the first measure, when a step finishes live', () => {
    const { rerender } = render(view(0));
    const list = screen.getByRole('list');
    expect(list.scrollLeft).toBe(0);
    rerender(view(4));
    expect(list.scrollLeft).toBe(0);
  });

  it('never moves the strip when a resize makes it overflow', () => {
    width = 2000;
    const { rerender } = render(view(4));
    const list = screen.getByRole('list');
    expect(list.scrollLeft).toBe(0);
    width = 300;
    observers.forEach((fire) => fire());
    rerender(view(4));
    expect(list.scrollLeft).toBe(0);
  });
});
