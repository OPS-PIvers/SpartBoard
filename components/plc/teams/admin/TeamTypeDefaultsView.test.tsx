import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TeamTypeDefaultsView } from './TeamTypeDefaultsView';
import { BUILT_IN_TEAM_TYPE_PRESETS } from '@/config/teamTypePresets';

type OnSave = ComponentProps<typeof TeamTypeDefaultsView>['onSave'];

const setup = () => {
  const onSave = vi.fn((..._args: Parameters<OnSave>) => Promise.resolve());
  render(<TeamTypeDefaultsView defaults={{ types: {} }} onSave={onSave} />);
  return onSave;
};

describe('TeamTypeDefaultsView', () => {
  it('starts on PLC with the rubric and nothing to save', () => {
    setup();
    expect(screen.getByText('Goal coach rubric')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Save PLC defaults/i })
    ).toBeDisabled();
    expect(
      screen.getByText('Applies to teams created after you save.')
    ).toBeInTheDocument();
  });

  it('hides the rubric for other types and shows no template for Building', () => {
    setup();
    fireEvent.click(screen.getByRole('tab', { name: 'Building' }));
    expect(screen.queryByText('Goal coach rubric')).not.toBeInTheDocument();
    expect(screen.queryAllByLabelText('Section heading')).toHaveLength(0);
    expect(
      screen.getByRole('button', { name: /Save Building defaults/i })
    ).toBeInTheDocument();
  });

  it('saves a page switch for the selected type only', async () => {
    const onSave = setup();
    fireEvent.click(screen.getByRole('tab', { name: 'Department' }));
    fireEvent.click(
      screen.getByRole('switch', { name: 'Updates on by default' })
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Save Department defaults/i })
    );
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const [type, preset, rubric] = onSave.mock.calls[0];
    expect(type).toBe('department');
    expect(preset.pages.find((p) => p.id === 'updates')?.enabled).toBe(true);
    expect(preset.cards).toEqual(BUILT_IN_TEAM_TYPE_PRESETS.department.cards);
    expect(rubric).toBeUndefined();
  });

  it('sends the rubric with PLC once it is edited, and Discard restores it', async () => {
    const onSave = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Add criterion' }));
    const inputs = screen.getAllByLabelText(/^Criterion \d+$/);
    expect(inputs).toHaveLength(6);
    fireEvent.change(inputs[5], { target: { value: 'Uses team data' } });
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(screen.getAllByLabelText(/^Criterion \d+$/)).toHaveLength(5);

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Remove criterion' })[0]
    );
    fireEvent.click(screen.getByRole('button', { name: /Save PLC defaults/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const rubric = onSave.mock.calls[0][2];
    expect(rubric).toHaveLength(4);
  });

  it('writes the chosen block kind into the template', async () => {
    const onSave = setup();
    fireEvent.change(
      screen.getByLabelText('Block for What do we want students to learn?'),
      { target: { value: 'decision' } }
    );
    fireEvent.click(screen.getByRole('button', { name: /Save PLC defaults/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][1].meetingNoteTemplate).toContain(
      '## What do we want students to learn?\n<!-- block:decision -->'
    );
  });
});
