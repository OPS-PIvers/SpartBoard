import { describe, expect, it, vi } from 'vitest';

vi.mock('@/config/firebase', () => ({ functions: {} }));

import { buildClaudePrompt, detailsPatch } from './helpItemAi';
import type { HelpResourceItem } from '@/types/helpCenter';

const item: HelpResourceItem = {
  id: 'i1',
  kind: 'guided-learning',
  title: 'Insert random numbers',
  description: '',
  categoryId: 'quizzes-activities',
  order: 0,
  visible: false,
  orgId: null,
  widgetTypes: ['quiz'],
  url: null,
  embedType: null,
  setId: 'set-9',
  openCount: 0,
  createdBy: 'u',
  createdByEmail: 'a@x.org',
  createdAt: 1,
  updatedAt: 1,
};
const categories = [
  { id: 'quizzes-activities', name: 'Quizzes & activities', order: 0 },
  { id: 'admin', name: 'Admin', order: 1 },
];

describe('buildClaudePrompt', () => {
  it('names the tour, the tools and the current details', () => {
    const text = buildClaudePrompt({
      item,
      categories,
      widgetLabels: new Map([['quiz', 'Quiz']]),
      scopeLabel: 'Everyone',
      canChangeScope: true,
    });
    expect(text).toContain('Tour set_id: set-9');
    expect(text).toContain('get_live_tour_guide');
    expect(text).toContain('update_live_tour');
    expect(text).toContain('widget_types and scope');
    expect(text).toContain(
      '- Category: Quizzes & activities (quizzes-activities)'
    );
    expect(text).toContain('- Widgets: Quiz');
    expect(text).toContain('- Description: (none)');
  });

  it('tells Claude to keep the scope for an org admin', () => {
    const text = buildClaudePrompt({
      item,
      categories,
      widgetLabels: new Map(),
      scopeLabel: 'Orono',
      canChangeScope: false,
    });
    expect(text).toContain('Keep the scope as it is.');
    expect(text).not.toContain('and scope.');
  });
});

describe('detailsPatch', () => {
  const opts = {
    categoryIds: ['quizzes-activities', 'admin'],
    audiences: ['teachers', 'subs'] as const,
    widgetIds: new Set(['quiz', 'clock']),
  };

  it('changes only what differs and is allowed', () => {
    expect(
      detailsPatch(
        item,
        {
          title: 'Insert random numbers',
          description: 'Add random numbers to a question.',
          categoryId: 'made-up',
          audience: 'students',
          widgetTypes: ['quiz', 'nope'],
        },
        opts
      )
    ).toEqual({ description: 'Add random numbers to a question.' });
  });

  it('applies a new category, audience and widgets', () => {
    expect(
      detailsPatch(
        item,
        {
          title: 'New',
          description: '',
          categoryId: 'admin',
          audience: 'subs',
          widgetTypes: ['clock'],
        },
        opts
      )
    ).toEqual({
      title: 'New',
      categoryId: 'admin',
      audience: 'subs',
      widgetTypes: ['clock'],
    });
  });

  it('leaves the audience of a published item alone when it would cross students', () => {
    expect(
      detailsPatch(
        { ...item, visible: true },
        {
          title: item.title,
          description: '',
          categoryId: item.categoryId,
          audience: 'students',
          widgetTypes: ['quiz'],
        },
        { ...opts, audiences: ['teachers', 'students'] }
      )
    ).toEqual({});
  });
});
