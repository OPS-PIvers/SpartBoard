import type {
  CustomBlockDefinition,
  CustomGridCell,
  CustomWidgetDoc,
} from '@/types';
import { defineFixtures } from './types';
import { STRESS, range } from './stress';

const WIDGET_ID = 'grader-custom-widget';

const cell = (
  i: number,
  columns: number,
  block: CustomBlockDefinition | null
): CustomGridCell => ({
  id: `cell-${i}`,
  colStart: (i % columns) + 1,
  rowStart: Math.floor(i / columns) + 1,
  colSpan: 1,
  rowSpan: 1,
  block,
});

const docFor = (
  title: string,
  columns: number,
  blocks: (CustomBlockDefinition | null)[]
): CustomWidgetDoc => ({
  id: WIDGET_ID,
  slug: 'grader-custom-widget',
  title,
  icon: 'Puzzle',
  color: 'bg-indigo-500',
  createdBy: 'mock-user-id',
  createdAt: Date.UTC(2026, 8, 1),
  updatedAt: Date.UTC(2026, 8, 1),
  mode: 'block',
  published: true,
  buildings: [],
  gridDefinition: {
    columns,
    rows: Math.ceil(blocks.length / columns),
    cells: blocks.map((block, i) => cell(i, columns, block)),
    connections: [],
  },
  defaultWidth: 400,
  defaultHeight: 300,
  settings: [],
  accessLevel: 'public',
  betaUsers: [],
  enabled: true,
});

const block = (
  id: string,
  type: CustomBlockDefinition['type'],
  config: CustomBlockDefinition['config']
): CustomBlockDefinition => ({ id, type, config, style: {} });

const typicalDoc = docFor('Exit ticket', 2, [
  block('b1', 'heading', { text: 'Exit ticket', size: 'lg' }),
  block('b2', 'stars', { maxStars: 5, initialValue: 3 }),
  block('b3', 'counter', { label: 'Questions answered', startValue: 2 }),
  block('b4', 'cb-button', { label: 'Submit', style: 'primary' }),
]);

const stressDoc = docFor(STRESS.title, 3, [
  block('s1', 'heading', { text: STRESS.title, size: 'xl' }),
  block('s2', 'text', { text: STRESS.sentence.repeat(3) }),
  block('s3', 'text', { text: STRESS.word.repeat(3) }),
  ...range(6, (i) =>
    block(`s-btn-${i}`, 'cb-button', {
      label: STRESS.longLabel(i),
      style: 'secondary',
    })
  ),
  block('s4', 'checklist', {
    items: range(STRESS.itemCount, (i) => STRESS.longLabel(i)),
  }),
  block('s5', 'multiple-choice', {
    question: STRESS.sentence,
    options: range(6, (i) => STRESS.longLabel(i)),
    correctIndex: 1,
  }),
  block('s6', 'poll', {
    question: STRESS.sentence,
    options: range(6, (i) => STRESS.longLabel(i)),
  }),
]);

const docs = (doc: CustomWidgetDoc) => ({
  [`custom_widgets/${WIDGET_ID}`]: doc as unknown as Record<string, unknown>,
});

export const customWidgetFixtures = defineFixtures<'custom-widget'>({
  // Empty: a widget whose definition doc is gone, which is what a deleted widget looks like.
  empty: { config: { customWidgetId: '' } },
  typical: {
    firestoreDocs: docs(typicalDoc),
    config: { customWidgetId: WIDGET_ID },
  },
  stress: {
    firestoreDocs: docs(stressDoc),
    config: { customWidgetId: WIDGET_ID },
  },
});
