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
