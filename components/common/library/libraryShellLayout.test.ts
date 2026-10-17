import { describe, expect, it } from 'vitest';
import {
  autoFolderPanelMode,
  isShortLibrary,
  resolveFolderPanelMode,
  resolveHeaderLabels,
} from './libraryShellLayout';

const quizTabs = [
  { label: 'Library', count: 24 },
  { label: 'In Progress', count: 12 },
  { label: 'Completed', count: 12 },
];

describe('autoFolderPanelMode', () => {
  it('shows the full panel when wide, a rail when narrower, nothing when narrow', () => {
    expect(autoFolderPanelMode(800)).toBe('full');
    expect(autoFolderPanelMode(600)).toBe('rail');
    expect(autoFolderPanelMode(400)).toBe('hidden');
    expect(autoFolderPanelMode(null)).toBe('full');
  });
});

describe('isShortLibrary', () => {
  it('moves Show folders into the toolbar only on a short card', () => {
    expect(isShortLibrary(100)).toBe(true);
    expect(isShortLibrary(239)).toBe(true);
    expect(isShortLibrary(240)).toBe(false);
    expect(isShortLibrary(900)).toBe(false);
    expect(isShortLibrary(null)).toBe(false);
  });
});

describe('resolveFolderPanelMode', () => {
  it('keeps a toggled setting until the widget crosses a breakpoint', () => {
    expect(resolveFolderPanelMode('full', 400, true)).toBe('full');
    expect(resolveFolderPanelMode('full', 400, false)).toBe('hidden');
    expect(resolveFolderPanelMode('auto', 600, true)).toBe('rail');
  });
});

describe('resolveHeaderLabels', () => {
  it('keeps every label when the bar has room', () => {
    expect(resolveHeaderLabels(900, quizTabs, ['New'])).toEqual({
      actionLabelsHidden: false,
      tabLabelsHidden: false,
    });
  });

  it('drops the New label before New reaches the Completed tab', () => {
    // Measured: tabs 433px + New 77px + 44px chrome = 554px.
    expect(resolveHeaderLabels(550, quizTabs, ['New'])).toEqual({
      actionLabelsHidden: true,
      tabLabelsHidden: false,
    });
  });

  it('drops tab labels once an icon-only New no longer fits beside them', () => {
    expect(resolveHeaderLabels(480, quizTabs, ['New'])).toEqual({
      actionLabelsHidden: true,
      tabLabelsHidden: true,
    });
  });

  it('collapses sooner when there are more actions', () => {
    const mini = [
      { label: 'Library', count: 24 },
      { label: 'In Progress', count: 12 },
      { label: 'Archive', count: 12 },
    ];
    expect(
      resolveHeaderLabels(700, mini, ['Import', 'Export', 'New App'])
        .actionLabelsHidden
    ).toBe(true);
  });
});
