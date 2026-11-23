import { describe, expect, it, vi } from 'vitest';
import { freshArticleOf, freshStateOf } from './freshserviceArticles';

vi.mock('@/config/firebase', () => ({ db: {} }));

const url = 'https://orono.freshservice.com/a/solutions/articles/7';

describe('freshArticleOf', () => {
  it('reads a record and links only a FreshService agent address', () => {
    expect(freshArticleOf({ articleId: 7, status: 2, url, sentAt: 5 })).toEqual(
      { published: true, url, sentAt: 5 }
    );
    expect(
      freshArticleOf({ articleId: 7, url: 'https://evil.example/a', sentAt: 5 })
    ).toEqual({ published: false, url: null, sentAt: 5 });
    expect(freshArticleOf({ folderId: '9' })).toBeNull();
    expect(freshArticleOf(undefined)).toBeNull();
  });
});

describe('freshStateOf', () => {
  const draft = { published: false, url, sentAt: 100 };
  it('names the state as of the last send', () => {
    expect(freshStateOf(undefined, 50)).toBe('none');
    expect(freshStateOf(draft, 50)).toBe('draft');
    expect(freshStateOf({ ...draft, published: true }, 100)).toBe('published');
    expect(freshStateOf(draft, null)).toBe('draft');
  });
  it('says a tour published after the last send needs an update', () => {
    expect(freshStateOf(draft, 101)).toBe('stale');
  });
});
