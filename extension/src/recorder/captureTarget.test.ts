import { describe, expect, it } from 'vitest';
import { captureTarget, shortCssPath, targetOf } from './captureTarget';

const html = (markup: string) => {
  document.body.innerHTML = markup;
  return document.body;
};

describe('captureTarget', () => {
  it('records the clickable control, its role and name', () => {
    html('<nav id="main-nav"><a href="/grades"><span>Grades</span></a></nav>');
    const got = captureTarget(document.querySelector('span')!);
    expect(got.action).toBe('click');
    expect(got.locator).toMatchObject({ role: 'link', name: 'Grades' });
    expect(got.locator.css).toBe('#main-nav > a');
  });

  it('never captures what is typed or chosen in a field', () => {
    html(
      '<label for="s">Search</label><input id="s" value="Alice Nguyen 2045831">' +
        '<select aria-label="Student"><option selected>Marcus Bell</option></select>'
    );
    const input = captureTarget(document.querySelector('input')!);
    expect(input.action).toBe('type');
    expect(input.locator.name).toBe('Search');
    expect(JSON.stringify(input)).not.toContain('Alice');
    const select = captureTarget(document.querySelector('select')!);
    expect(select.action).toBe('select');
    expect(JSON.stringify(select)).not.toContain('Marcus');
  });

  it('never captures what is typed in an editor', () => {
    html(
      '<div contenteditable="true">Alice Nguyen did not turn it in</div>' +
        '<div role="textbox" aria-label="Comment">Marcus Bell</div>'
    );
    const editor = captureTarget(document.querySelector('[contenteditable]')!);
    expect(editor.action).toBe('type');
    expect(JSON.stringify(editor)).not.toContain('Alice');
    const box = captureTarget(document.querySelector('[role=textbox]')!);
    expect(box.locator.name).toBe('Comment');
    expect(JSON.stringify(box)).not.toContain('Marcus');
  });

  it('scrubs emails and student numbers out of captured text', () => {
    html('<button>Message abell27@students.orono.k12.mn.us 2045831</button>');
    const got = captureTarget(document.querySelector('button')!);
    expect(got.locator.name).toBe('Message ••• •••');
  });

  it('records the nearest heading, page title and stable attributes, scrubbed', () => {
    const title = document.title;
    document.title = 'Student 2045831 | Schoology';
    html(
      '<section><h2>Grades for jane.doe@orono.k12.mn.us</h2><div>' +
        '<a href="/students/2045831/grades?tab=1" data-testid="open-grades" aria-label="Open 2045831" name="go">Open</a>' +
        '<button data-testid="row-2045831" name="r-99812">Edit</button></div></section>'
    );
    const link = captureTarget(document.querySelector('a')!);
    expect(link.locator).toMatchObject({
      heading: 'Grades for •••',
      pageTitle: 'Student ••• | Schoology',
      attrs: {
        testId: 'open-grades',
        ariaLabel: 'Open •••',
        name: 'go',
        href: '/students/*/grades',
      },
    });
    // A per-record test id or field name is never kept.
    const button = captureTarget(document.querySelector('button')!);
    expect(button.locator.attrs).toBeUndefined();
    expect(JSON.stringify([link, button])).not.toMatch(/2045831|jane\.doe/);
    expect(JSON.stringify([link, button])).not.toContain('<');
    document.title = title;
  });

  it('takes a menu or dialog label when no heading comes first', () => {
    html(
      '<div role="menu" aria-label="Extensions"><div role="menuitem">Apps Script</div></div>'
    );
    const got = captureTarget(document.querySelector('[role=menuitem]')!);
    expect(got.locator.heading).toBe('Extensions');
  });
});

describe('shortCssPath', () => {
  it('skips per-record ids and classes', () => {
    html(
      '<div class="row-88213 card"><ul><li><button class="btn css-1x2y3z">Go</button></li><li><button class="btn">Two</button></li></ul></div>'
    );
    const second = document.querySelectorAll('button')[1];
    expect(shortCssPath(second)).toBe(
      'div.card > ul > li:nth-of-type(2) > button.btn'
    );
  });

  it('finds the nearest clickable ancestor', () => {
    html('<div role="tab"><i>x</i></div>');
    expect(targetOf(document.querySelector('i')!).getAttribute('role')).toBe(
      'tab'
    );
  });
});
