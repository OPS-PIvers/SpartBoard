import { describe, it, expect } from 'vitest';
import {
  normalizeHelpCenterConfig,
  normalizeHelpResourceItem,
  sortHelpItems,
} from './helpCenterNormalize';
import {
  DEFAULT_HELP_CATEGORIES,
  type HelpResourceItem,
} from '@/types/helpCenter';

describe('normalizeHelpResourceItem', () => {
  it('returns null when kind is missing', () => {
    expect(normalizeHelpResourceItem('a', { title: 'x' })).toBeNull();
  });

  it('returns null when kind is invalid', () => {
    expect(
      normalizeHelpResourceItem('a', { kind: 'bogus', title: 'x' })
    ).toBeNull();
  });

  it('returns null when title is missing', () => {
    expect(normalizeHelpResourceItem('a', { kind: 'embed' })).toBeNull();
  });

  it('returns null when title is empty', () => {
    expect(
      normalizeHelpResourceItem('a', { kind: 'embed', title: '' })
    ).toBeNull();
  });

  it('fills defaults for a minimal doc', () => {
    const item = normalizeHelpResourceItem('a', {
      kind: 'embed',
      title: 'Getting started',
    });
    expect(item).toMatchObject({
      id: 'a',
      kind: 'embed',
      title: 'Getting started',
      description: '',
      categoryId: '',
      order: 0,
      visible: true,
      orgId: null,
      widgetTypes: [],
      url: null,
      embedType: null,
      setId: null,
      openCount: 0,
    });
  });

  it('preserves visible: false', () => {
    const item = normalizeHelpResourceItem('a', {
      kind: 'embed',
      title: 'Draft',
      visible: false,
    });
    expect(item?.visible).toBe(false);
  });

  it('passes through full field set', () => {
    const item = normalizeHelpResourceItem('a', {
      kind: 'guided-learning',
      title: 'Walkthrough',
      description: 'desc',
      categoryId: 'admin',
      order: 3,
      visible: true,
      orgId: 'orono',
      widgetTypes: ['clock'],
      setId: 'set-1',
      openCount: 5,
      createdBy: 'uid1',
      createdByEmail: 'a@b.com',
      createdAt: 100,
      updatedAt: 200,
    });
    expect(item).toEqual({
      id: 'a',
      kind: 'guided-learning',
      title: 'Walkthrough',
      description: 'desc',
      categoryId: 'admin',
      order: 3,
      visible: true,
      orgId: 'orono',
      widgetTypes: ['clock'],
      url: null,
      embedType: null,
      setId: 'set-1',
      openCount: 5,
      createdBy: 'uid1',
      createdByEmail: 'a@b.com',
      createdAt: 100,
      updatedAt: 200,
    });
  });
});

describe('normalizeHelpCenterConfig', () => {
  it('defaults to DEFAULT_HELP_CATEGORIES when categories missing', () => {
    expect(normalizeHelpCenterConfig(undefined).categories).toEqual(
      DEFAULT_HELP_CATEGORIES
    );
  });

  it('defaults to DEFAULT_HELP_CATEGORIES when categories empty', () => {
    expect(normalizeHelpCenterConfig({ categories: [] }).categories).toEqual(
      DEFAULT_HELP_CATEGORIES
    );
  });

  it('uses provided categories when present', () => {
    const categories = [{ id: 'x', name: 'X', order: 0 }];
    expect(
      normalizeHelpCenterConfig({ categories, updatedAt: 1, updatedBy: 'u' })
    ).toEqual({ categories, updatedAt: 1, updatedBy: 'u' });
  });
});

describe('sortHelpItems', () => {
  const base: HelpResourceItem = {
    id: '',
    kind: 'embed',
    title: '',
    description: '',
    categoryId: 'getting-started',
    order: 0,
    visible: true,
    orgId: null,
    widgetTypes: [],
    url: null,
    embedType: null,
    setId: null,
    openCount: 0,
    createdBy: '',
    createdByEmail: '',
    createdAt: 0,
    updatedAt: 0,
  };

  it('sorts by category order, then item order, then title', () => {
    const items: HelpResourceItem[] = [
      { ...base, id: '1', categoryId: 'admin', order: 0, title: 'Z' },
      { ...base, id: '2', categoryId: 'getting-started', order: 1, title: 'B' },
      { ...base, id: '3', categoryId: 'getting-started', order: 0, title: 'A' },
      { ...base, id: '4', categoryId: 'getting-started', order: 0, title: 'C' },
    ];
    const sorted = sortHelpItems(items);
    expect(sorted.map((i) => i.id)).toEqual(['3', '4', '2', '1']);
  });
});
