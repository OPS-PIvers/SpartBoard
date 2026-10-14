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
