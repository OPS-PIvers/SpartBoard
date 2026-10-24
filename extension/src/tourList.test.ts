import { describe, expect, it } from 'vitest';
import {
  badgeFor,
  pageHost,
  parseTourList,
  parseTourPanelMessage,
  toursForPanel,
  type ListedTour,
} from './tourList';

const tour = (id: string, title: string, host: string): ListedTour => ({
  id,
  title,
  host,
  steps: 3,
  version: 1,
});

describe('tour list', () => {
  it('keeps only tours it can show and start', () => {
    const list = parseTourList(
      {
        admin: true,
        tours: [
          tour('a', 'Grades', 'App.Schoology.com'),
          { id: 'b', title: 'No host', host: '', steps: 1, version: 1 },
          { id: 'c', title: 'Bad', host: 'x.example', steps: 'many' },
          'junk',
        ],
      },
      5
    );
    expect(list).toEqual({
      at: 5,
      admin: true,
      tours: [tour('a', 'Grades', 'app.schoology.com')],
    });
    expect(parseTourList(null, 1)).toEqual({ at: 1, admin: false, tours: [] });
  });

  it('reads only web pages as hosts', () => {
    expect(pageHost('https://App.Example/x')).toBe('app.example');
    expect(pageHost('chrome://extensions')).toBe('');
    expect(pageHost(undefined)).toBe('');
  });

  it('badges a page with how many tours start on its host', () => {
    const tours = [
      tour('a', 'One', 'a.example'),
      tour('b', 'Two', 'a.example'),
      tour('c', 'Three', 'b.example'),
    ];
    expect(badgeFor(tours, 'https://a.example/any/page')).toBe('2');
    expect(badgeFor(tours, 'https://c.example/')).toBe('');
    expect(badgeFor(tours, 'chrome://newtab')).toBe('');
    const many = Array.from({ length: 120 }, (_, i) =>
      tour(String(i), 'T', 'a.example')
    );
    expect(badgeFor(many, 'https://a.example/')).toBe('99+');
  });

  it('lists this site first and searches every tour by title or site', () => {
    const tours = [
      tour('a', 'Post grades', 'a.example'),
      tour('b', 'Add an assignment', 'a.example'),
      tour('c', 'Grades in Infinite Campus', 'b.example'),
    ];
    const all = toursForPanel(tours, 'a.example', '');
    expect(all.here.map((t) => t.id)).toEqual(['b', 'a']);
    expect(all.others.map((t) => t.id)).toEqual(['c']);
    const found = toursForPanel(tours, 'a.example', 'GRADES');
    expect(found.here.map((t) => t.id)).toEqual(['a']);
    expect(found.others.map((t) => t.id)).toEqual(['c']);
    expect(toursForPanel(tours, 'a.example', 'b.example').others).toHaveLength(
      1
    );
    // A page that isn't a website has no tours of its own.
    expect(toursForPanel(tours, '', '').here).toEqual([]);
  });

  it('accepts only well-formed panel requests', () => {
    expect(
      parseTourPanelMessage({ type: 'tours/list', refresh: true })
    ).toEqual({ type: 'tours/list', refresh: true });
    expect(
      parseTourPanelMessage({ type: 'tours/start', setId: 'set_1', tabId: 4 })
    ).toEqual({ type: 'tours/start', setId: 'set_1', tabId: 4 });
    expect(
      parseTourPanelMessage({
        type: 'tours/start',
        setId: 'set_1',
        tabId: null,
      })
    ).toEqual({ type: 'tours/start', setId: 'set_1', tabId: null });
    expect(
      parseTourPanelMessage({ type: 'tours/start', setId: 'a/b', tabId: 4 })
    ).toBeNull();
    expect(
      parseTourPanelMessage({ type: 'tours/start', setId: 'a', tabId: 1.5 })
    ).toBeNull();
    expect(parseTourPanelMessage({ type: 'tours/list' })).toBeNull();
  });
});
