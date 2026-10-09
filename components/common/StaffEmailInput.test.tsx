import React, { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { StaffEmailInput } from './StaffEmailInput';
import { primeStaffDirectory } from '@/hooks/useStaffDirectory';

vi.mock('@/config/firebase', () => ({ db: {} }));

primeStaffDirectory('org-a', [
  { email: 'paul.ivers@orono.k12.mn.us', name: 'Paul Ivers' },
  { email: 'paula.berg@orono.k12.mn.us', name: 'Paula Berg' },
  { email: 'mark.johnson@orono.k12.mn.us', name: 'Mark Johnson' },
]);

const Harness: React.FC<{
  orgId: string | null;
  onEnter?: () => void;
  exclude?: ReadonlySet<string>;
}> = ({ orgId, onEnter, exclude }) => {
  const [value, setValue] = useState('');
  return (
    <StaffEmailInput
      aria-label="Invite"
      orgId={orgId}
      exclude={exclude}
      value={value}
      onValueChange={setValue}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onEnter?.();
      }}
    />
  );
};

const typeInto = async (text: string) => {
  const input = screen.getByLabelText('Invite');
  fireEvent.focus(input);
  await Promise.resolve();
  fireEvent.change(input, { target: { value: text } });
  return input as HTMLInputElement;
};

describe('StaffEmailInput', () => {
  it('lists matching staff and fills the email on click', async () => {
    render(<Harness orgId="org-a" />);
    const input = await typeInto('paul');
    const options = await screen.findAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual([
      'Paul Iverspaul.ivers@orono.k12.mn.us',
      'Paula Bergpaula.berg@orono.k12.mn.us',
    ]);
    fireEvent.mouseDown(options[1]);
    expect(input.value).toBe('paula.berg@orono.k12.mn.us');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('picks the highlighted row on Enter instead of submitting', async () => {
    const onEnter = vi.fn();
    render(<Harness orgId="org-a" onEnter={onEnter} />);
    const input = await typeInto('paul');
    await screen.findAllByRole('option');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(input.value).toBe('paula.berg@orono.k12.mn.us');
    expect(onEnter).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onEnter).toHaveBeenCalledTimes(1);
  });

  it('skips excluded emails', async () => {
    render(
      <Harness
        orgId="org-a"
        exclude={new Set(['paul.ivers@orono.k12.mn.us'])}
      />
    );
    await typeInto('paul');
    const options = await screen.findAllByRole('option');
    expect(options).toHaveLength(1);
  });

  it('shows no list when suggestions are off', async () => {
    const onEnter = vi.fn();
    render(<Harness orgId={null} onEnter={onEnter} />);
    const input = await typeInto('paul');
    await Promise.resolve();
    expect(screen.queryByRole('listbox')).toBeNull();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onEnter).toHaveBeenCalledTimes(1);
  });
});
