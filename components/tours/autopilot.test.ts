import { afterEach, describe, expect, it, vi } from 'vitest';
import { performStep } from './autopilot';

const radios = (checked: string) => {
  const group = document.createElement('div');
  group.setAttribute('role', 'radiogroup');
  const clicks: string[] = [];
  for (const [value, label] of [
    ['groups', 'Groups'],
    ['single', 'One name'],
  ]) {
    const b = document.createElement('button');
    b.setAttribute('role', 'radio');
    b.setAttribute('data-value', value);
    b.setAttribute('aria-checked', String(value === checked));
    b.textContent = label;
    b.addEventListener('click', () => clicks.push(value));
    group.appendChild(b);
  }
  const field = document.createElement('div');
  field.appendChild(group);
  field.addEventListener('click', (e) => {
    if (e.target === field) clicks.push('field');
  });
  document.body.appendChild(field);
  return { field, clicks };
};

const opts = () => ({ instant: true, signal: new AbortController().signal });

describe('performStep select', () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('picks the matching choice in a segmented control', async () => {
    const { field, clicks } = radios('single');
    await performStep(field, { action: 'select', value: 'groups' }, opts());
    expect(clicks).toEqual(['groups']);
  });

  it('leaves a segmented control alone when the choice is already on', async () => {
    const { field, clicks } = radios('groups');
    await performStep(field, { action: 'select', value: 'groups' }, opts());
    expect(clicks).toEqual([]);
  });
});

describe('performStep select with no matching option', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('reports false after one click on a cycle button with no options', async () => {
    const button = document.createElement('button');
    const clicks: string[] = [];
    button.addEventListener('click', () => clicks.push('cycle'));
    document.body.appendChild(button);
    vi.useFakeTimers();
    const done = performStep(
      button,
      { action: 'select', value: 'groups' },
      opts()
    );
    await vi.runAllTimersAsync();
    vi.useRealTimers();
    expect(await done).toBe(false);
    expect(clicks).toEqual(['cycle']);
  });

  it('reports false for a native select without the value', async () => {
    const select = document.createElement('select');
    select.append(new Option('One', 'one'), new Option('Two', 'two'));
    document.body.appendChild(select);
    expect(
      await performStep(select, { action: 'select', value: 'three' }, opts())
    ).toBe(false);
    expect(select.value).toBe('one');
  });

  it('reports true when a segmented choice matches', async () => {
    const { field } = radios('single');
    expect(
      await performStep(field, { action: 'select', value: 'groups' }, opts())
    ).toBe(true);
  });
});
