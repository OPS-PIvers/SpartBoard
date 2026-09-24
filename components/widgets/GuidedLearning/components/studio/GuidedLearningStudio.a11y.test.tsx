import React from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuidedLearningSet } from '@/types';
import { mockStageLayout } from '@/tests/utils/mockStageLayout';
import { GuidedLearningStudio } from './GuidedLearningStudio';
import { INTERACTION_ORDER } from './studioOptions';
import { modShortcutLabel } from './useStudioShortcuts';

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'test-user' },
    isAdmin: false,
    canAccessFeature: () => false,
  }),
}));
vi.mock('@/hooks/useStorage', () => ({
  useStorage: () => ({
    uploading: false,
    uploadHotspotImage: vi.fn(),
    uploadGuidedLearningMedia: vi.fn(),
    uploadGuidedLearningImage: vi.fn(),
    deleteFile: vi.fn(),
    deleteDriveFile: vi.fn(),
  }),
}));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({
    currentDialog: null,
    showAlert: vi.fn().mockResolvedValue(undefined),
    showConfirm: vi.fn().mockResolvedValue(false),
    showPrompt: vi.fn().mockResolvedValue(null),
  }),
}));

type StudioProps = React.ComponentProps<typeof GuidedLearningStudio>;

const buildSet = (): GuidedLearningSet => ({
  id: 'set-1',
  schemaVersion: 3,
  title: 'Timer tour',
  imageUrls: ['https://example.com/slide-1.png'],
  steps: [
    {
      id: 'step-1',
      xPct: 20,
      yPct: 30,
      imageIndex: 0,
      interactionType: 'tooltip',
      text: 'One',
    },
    {
      id: 'step-2',
      xPct: 70,
      yPct: 60,
      imageIndex: 0,
      interactionType: 'tooltip',
      text: 'Two',
    },
  ],
  mode: 'guided',
  createdAt: 1,
  updatedAt: 1,
});

let restore: (() => void) | null = null;

/** A field's name from a tied label, aria-label or aria-labelledby. */
const fieldName = (
  el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
): string =>
  [
    ...Array.from(el.labels ?? []).map((l) => l.textContent ?? ''),
    el.getAttribute('aria-label') ?? '',
    ...(el.getAttribute('aria-labelledby') ?? '')
      .split(' ')
      .map((id) =>
        id ? (document.getElementById(id)?.textContent ?? '') : ''
      ),
  ]
    .join('')
    .trim();

const Host: React.FC<{ studio: Partial<StudioProps> }> = ({ studio }) => {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open studio
      </button>
      {open && (
        <GuidedLearningStudio
          set={buildSet()}
          meta={null}
          onSave={vi.fn().mockResolvedValue(undefined)}
          {...studio}
          onClose={() => {
            studio.onClose?.();
            setOpen(false);
          }}
        />
      )}
    </>
  );
};

function openStudio(studio: Partial<StudioProps> = {}) {
  const handle = mockStageLayout({
    container: { w: 720, h: 520 },
    image: { w: 1440, h: 1040 },
  });
  restore = handle.restore;
  render(<Host studio={studio} />);
  const opener = screen.getByRole('button', { name: 'Open studio' });
  opener.focus();
  fireEvent.click(opener);
  act(() => handle.fireResize());
  return opener;
}

const studio = () => screen.getByTestId('gl-studio');
const canvas = () => screen.getByRole('application', { name: 'Slide canvas' });
const titleInput = () => screen.getByLabelText('Activity title');
const stepCount = () => titleInput().nextSibling;

async function closeAndGetSaved(onSave: StudioProps['onSave']) {
  fireEvent.click(screen.getByRole('button', { name: 'Close editor' }));
  await waitFor(() => expect(screen.queryByTestId('gl-studio')).toBeNull());
  const last = vi.mocked(onSave).mock.lastCall;
  if (!last) throw new Error('onSave was never called');
  return last[0];
}

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  restore?.();
  restore = null;
});

describe('Studio keyboard and screen-reader access', () => {
  it('moves focus into the Studio on open, then Tab walks its controls from the title', async () => {
    const user = userEvent.setup();
    openStudio();
    expect(document.activeElement).toBe(studio());
    await user.tab();
    expect(document.activeElement).toBe(titleInput());
    await user.tab();
    expect(studio()).toContainElement(document.activeElement as HTMLElement);
    expect(document.activeElement).not.toBe(titleInput());
  });

  it('traps Tab inside the Studio, wrapping at both ends', async () => {
    const user = userEvent.setup();
    openStudio();
    await user.tab({ shift: true });
    const last = document.activeElement as HTMLElement;
    expect(studio()).toContainElement(last);
    expect(last).not.toBe(studio());
    await user.tab();
    expect(document.activeElement).toBe(titleInput());
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(last);
  });

  it('brings a lost focus back into the Studio instead of treating the page as the canvas', () => {
    openStudio();
    act(() => (document.activeElement as HTMLElement).blur());
    expect(document.activeElement).toBe(document.body);
    const tab = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      document.body.dispatchEvent(tab);
    });
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(titleInput());
    expect(screen.queryByTestId('gl-studio-selection')).toBeNull();
  });

  it('leaves Tab alone while focus is in a layer above the Studio', () => {
    openStudio();
    const toast = document.createElement('button');
    document.body.appendChild(toast);
    toast.focus();
    const tab = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      toast.dispatchEvent(tab);
    });
    expect(tab.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(toast);
    toast.remove();
  });

  it('returns focus to the opener when the Studio closes', async () => {
    const opener = openStudio();
    expect(document.activeElement).not.toBe(opener);
    fireEvent.click(screen.getByRole('button', { name: 'Close editor' }));
    await waitFor(() => expect(screen.queryByTestId('gl-studio')).toBeNull());
    expect(document.activeElement).toBe(opener);
  });

  it('cycles steps with Tab on the canvas and lets Tab leave after the last one', () => {
    openStudio();
    canvas().focus();
    const press = (shiftKey = false) => {
      const e = new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey,
        bubbles: true,
        cancelable: true,
      });
      act(() => {
        canvas().dispatchEvent(e);
      });
      return e.defaultPrevented;
    };
    expect(press()).toBe(true);
    expect(press()).toBe(true);
    expect(screen.getByTestId('gl-studio-selection')).toBeInTheDocument();
    // On the last step Tab is not taken, so focus moves on to the next control.
    expect(press()).toBe(false);
    expect(press(true)).toBe(true);
    expect(press(true)).toBe(false);
  });

  it('places a step in the center with Enter on the focused canvas, then nudges it with arrows', async () => {
    const onSave = vi.fn<StudioProps['onSave']>().mockResolvedValue(undefined);
    openStudio({ onSave });
    canvas().focus();
    fireEvent.keyDown(canvas(), { key: 'Enter' });
    expect(stepCount()).toHaveTextContent('3 steps');
    expect(screen.getByTestId('gl-studio-selection')).toBeInTheDocument();
    fireEvent.keyDown(canvas(), { key: 'ArrowRight' });
    fireEvent.keyDown(canvas(), { key: 'ArrowDown', shiftKey: true });
    // Enter on a selected step edits its callout rather than adding another.
    fireEvent.keyDown(canvas(), { key: 'Escape' });
    expect(stepCount()).toHaveTextContent('3 steps');
    const saved = await closeAndGetSaved(onSave);
    const added = saved.steps.find(
      (s) => s.id !== 'step-1' && s.id !== 'step-2'
    );
    expect(added?.xPct).toBeCloseTo(50.25);
    expect(added?.yPct).toBeCloseTo(52);
    expect(added?.imageIndex).toBe(0);
  });

  it('does not place a step from Enter on a control or the page', () => {
    openStudio();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Close editor' }), {
      key: 'Enter',
    });
    fireEvent.keyDown(document.body, { key: 'Enter' });
    expect(stepCount()).toHaveTextContent('2 steps');
  });

  it('opens a translated shortcut sheet with ? listing every Studio shortcut, and closes it with Escape', () => {
    openStudio();
    canvas().focus();
    fireEvent.keyDown(canvas(), { key: '?', shiftKey: true });
    const sheet = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
    expect(sheet).toContainElement(document.activeElement as HTMLElement);
    const keys = within(sheet)
      .getAllByText((_, el) => el?.tagName === 'KBD')
      .map((el) => el.textContent);
    for (const key of ['z', 'y', 'd', 'c', 'v', 'b', 'k'])
      expect(keys).toContain(modShortcutLabel(key));
    expect(keys).toContain(modShortcutLabel('z', true));
    for (const key of ['[', ']', 'A', 'R', 'E', 'P', 'B', '0', '1', '?'])
      expect(keys).toContain(key);
    expect(
      within(sheet).getByText(
        'Duplicate the step, or the slide when no step is selected'
      )
    ).toBeInTheDocument();
    expect(
      within(sheet).getByText('Add a step in the center (nothing selected)')
    ).toBeInTheDocument();
    // Studio shortcuts stay off while the sheet is open.
    fireEvent.keyDown(window, { key: ']' });
    expect(screen.queryByTestId('gl-studio-selection')).toBeNull();
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' });
    expect(screen.queryByTestId('gl-studio-shortcuts')).toBeNull();
    expect(document.activeElement).toBe(canvas());
  });

  it('opens the shortcut sheet from the header button', () => {
    openStudio();
    fireEvent.click(
      screen.getByRole('button', { name: 'Keyboard shortcuts (?)' })
    );
    expect(screen.getByTestId('gl-studio-shortcuts')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Close keyboard shortcuts' })
    );
    expect(screen.queryByTestId('gl-studio-shortcuts')).toBeNull();
  });

  it('does not open the shortcut sheet while typing', () => {
    openStudio();
    fireEvent.keyDown(titleInput(), { key: '?', shiftKey: true });
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    studio().appendChild(editable);
    fireEvent.keyDown(editable, { key: '?', shiftKey: true });
    editable.remove();
    expect(screen.queryByTestId('gl-studio-shortcuts')).toBeNull();
  });

  it('gives every step-editor field an accessible name, for every interaction type', () => {
    openStudio({ initialStepId: 'step-1' });
    const section = screen.getByTestId('gl-studio-step-section');
    for (const type of INTERACTION_ORDER) {
      fireEvent.change(
        within(section).getByRole('combobox', { name: 'Interaction' }),
        { target: { value: type } }
      );
      const fields = Array.from(
        section.querySelectorAll<
          HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
        >('input:not([type="file"]), select, textarea')
      );
      expect(fields.length).toBeGreaterThan(0);
      for (const field of fields)
        expect(
          fieldName(field),
          `${type}: ${field.outerHTML.slice(0, 80)}`
        ).not.toBe('');
    }
  });
});
