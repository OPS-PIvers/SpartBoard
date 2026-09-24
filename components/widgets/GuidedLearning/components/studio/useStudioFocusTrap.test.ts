import { afterEach, describe, expect, it } from 'vitest';
import { tabbables } from './useStudioFocusTrap';

afterEach(() => {
  document.body.innerHTML = '';
  document.head.querySelectorAll('style').forEach((s) => s.remove());
});

const mount = (html: string) => {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.appendChild(root);
  return root;
};
const ids = (root: HTMLElement) => tabbables(root).map((el) => el.id);

describe('tabbables', () => {
  it('skips a control a stylesheet hides with display: none, like the Properties toggle at 1024px and up', () => {
    const style = document.createElement('style');
    style.textContent = '.lg-hidden { display: none; }';
    document.head.appendChild(style);
    const root = mount(`
      <button id="title">Title</button>
      <button id="properties" class="lg-hidden">Properties</button>
      <button id="save">Save</button>
    `);
    expect(ids(root)).toEqual(['title', 'save']);
  });

  it('skips controls inside an ancestor with display: none', () => {
    const root = mount(`
      <button id="a">A</button>
      <div style="display: none"><button id="b">B</button><input id="c" /></div>
      <button id="d">D</button>
    `);
    expect(ids(root)).toEqual(['a', 'd']);
  });

  it('keeps displayed controls in DOM order', () => {
    const root = mount(
      `<div><a id="link" href="#x">x</a><textarea id="t"></textarea></div>`
    );
    expect(ids(root)).toEqual(['link', 't']);
  });
});
