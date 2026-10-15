import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  changedWidgetTypes,
  excusedTypes,
  missingNotes,
  noteIdsByWidget,
} from '@/scripts/checkReleaseWidgetNotes';
import type { WidgetFiles } from '@/scripts/widget-grader/widgetFiles';
import { TOOLS } from '@/config/tools';
import { FEATURE_DEFAULTS } from '@/config/featureDefaults';

const widget = (type: string, folder: string | null, entry: string) => ({
  type,
  folder,
  entry,
  frontFace: [entry],
  settings: [],
  other: [],
  tests: [],
  externalTests: [],
  skipScaling: true,
});

const FILES: Record<string, WidgetFiles> = {
  quiz: widget(
    'quiz',
    'components/widgets/QuizWidget',
    'components/widgets/QuizWidget/Widget.tsx'
  ),
  clock: widget('clock', null, 'components/widgets/ClockWidget.tsx'),
};

const notes = (list: { id: string; widget: string }[]) =>
  JSON.stringify({ entries: [], widgetNotes: list });

describe('checkReleaseWidgetNotes', () => {
  it('names widgets whose own files changed, ignoring tests and shared files', () => {
    expect(
      changedWidgetTypes(
        [
          'components/widgets/QuizWidget/Results.tsx',
          'components/widgets/ClockWidget.test.tsx',
          'components/common/DraggableWindow.tsx',
        ],
        FILES
      )
    ).toEqual(['quiz']);
  });

  it('needs a note added in this release, not one already on main', () => {
    const base = noteIdsByWidget(notes([{ id: 'old', widget: 'quiz' }]));
    expect(missingNotes(['quiz'], base, base, new Set())).toEqual(['quiz']);
    const head = noteIdsByWidget(
      notes([
        { id: 'old', widget: 'quiz' },
        { id: 'new', widget: 'quiz' },
      ])
    );
    expect(missingNotes(['quiz'], base, head, new Set())).toEqual([]);
  });

  it('accepts a no-widget-note line only when it gives a reason', () => {
    expect(
      excusedTypes(
        'Notes\n- no-widget-note: quiz behind a preview flag\nno-widget-note: clock'
      )
    ).toEqual(new Set(['quiz']));
    expect(excusedTypes('no-widget-note: quiz-timer')).toEqual(new Set());
  });
});

describe('public/changelog.json widgetNotes', () => {
  const file = JSON.parse(readFileSync('public/changelog.json', 'utf8')) as {
    widgetNotes?: {
      id: string;
      widget: string;
      date: string;
      text: string;
      feature?: string;
    }[];
  };
  const list = file.widgetNotes ?? [];
  const widgetTypes = new Set<string>(TOOLS.map((t) => t.type));

  it('has unique ids, real widget types, dates and text', () => {
    expect(new Set(list.map((n) => n.id)).size).toBe(list.length);
    for (const n of list) {
      expect(widgetTypes.has(n.widget), n.id).toBe(true);
      expect(n.date, n.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(n.text.trim(), n.id).not.toBe('');
      expect(`${n.text} ${n.feature ?? ''}`, n.id).not.toMatch(/TODO/);
    }
  });

  it('names only flags that exist, or none once the flag is retired', () => {
    for (const n of list.filter((x) => x.feature)) {
      expect(Object.hasOwn(FEATURE_DEFAULTS, n.feature ?? ''), n.id).toBe(true);
    }
  });
});
