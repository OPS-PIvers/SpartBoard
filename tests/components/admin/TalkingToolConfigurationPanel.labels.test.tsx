// Pins each stems group's aria-labelledby ↔ SettingsLabel id pairing; dropping either leaves the group unnamed with nothing else failing.

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { TalkingToolCategory } from '@/types';
import { DEFAULT_TALKING_TOOL_CATEGORIES } from '@/config/talkingToolData';

import { TalkingToolConfigurationPanel } from '@/components/admin/TalkingToolConfigurationPanel';

afterEach(cleanup);

const renderPanel = (categories?: TalkingToolCategory[]) =>
  render(
    <TalkingToolConfigurationPanel
      config={categories ? { categories } : {}}
      onChange={vi.fn()}
    />
  );

describe('TalkingToolConfigurationPanel — stems group accessible names', () => {
  it('names every stems group from its visible Sentence Stems heading', () => {
    renderPanel();

    expect(
      screen.getAllByRole('group', { name: 'Sentence Stems' })
    ).toHaveLength(DEFAULT_TALKING_TOOL_CATEGORIES.length);
  });

  it('gives each category its own group rather than sharing one label id', () => {
    renderPanel([
      {
        id: 'cat-a',
        label: 'Category A',
        color: '#111111',
        icon: 'MessageSquare',
        stems: [{ id: 'a1', text: 'Stem A' }],
      },
      {
        id: 'cat-b',
        label: 'Category B',
        color: '#222222',
        icon: 'MessageSquare',
        stems: [{ id: 'b1', text: 'Stem B' }],
      },
    ]);

    const groups = screen.getAllByRole('group', { name: 'Sentence Stems' });
    expect(groups).toHaveLength(2);

    // A shared id would name both groups from the first label — assert each
    // resolves to the heading inside its own subtree.
    const labelIds = groups.map((g) => g.getAttribute('aria-labelledby'));
    expect(new Set(labelIds).size).toBe(2);
    groups.forEach((group, i) => {
      expect(
        group.querySelector(`#${CSS.escape(labelIds[i] as string)}`)
      ).toHaveTextContent('Sentence Stems');
    });
  });
});
