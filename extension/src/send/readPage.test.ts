import { afterEach, describe, expect, it } from 'vitest';
import { MAX_IMAGES, mainContent, pageUrl, readPage } from './readPage';

const LONG =
  'Photosynthesis is the process plants use to turn light, water and carbon dioxide into sugar and oxygen. ';

function show(html: string, title = 'A page') {
  document.body.innerHTML = html;
  document.title = title;
  window.getSelection()?.removeAllRanges();
}

afterEach(() => {
  document.body.innerHTML = '';
  window.getSelection()?.removeAllRanges();
});

describe('readPage', () => {
  it('reads the article and leaves out navigation, footer and asides', () => {
    show(`
      <header><nav><a href="/">Home</a><a href="/about">About</a></nav></header>
      <aside>Related: ten other links</aside>
      <article>
        <h1>Plants</h1>
        <p>${LONG}</p>
        <h2>Steps</h2>
        <ol><li>Light is absorbed</li><li>Water is split<ul><li>Oxygen is released</li></ul></li></ol>
        <table><tr><th>Input</th><th>Output</th></tr><tr><td>Water</td><td>Oxygen</td></tr></table>
        <blockquote>Plants feed the world.</blockquote>
        <pre>6CO2 + 6H2O</pre>
      </article>
      <footer>Copyright</footer>`);
    const read = readPage(window);
    expect(read.title).toBe('A page');
    expect(read.platform).toBe('generic');
    expect(read.selectionOnly).toBe(false);
    expect(read.blocks).toEqual([
      { type: 'heading', level: 1, text: 'Plants' },
      { type: 'paragraph', text: LONG.trim() },
      { type: 'heading', level: 2, text: 'Steps' },
      { type: 'listItem', text: 'Light is absorbed' },
      { type: 'listItem', text: 'Water is split' },
      { type: 'listItem', text: 'Oxygen is released' },
      {
        type: 'table',
        rows: [{ cells: ['Input', 'Output'] }, { cells: ['Water', 'Oxygen'] }],
      },
      { type: 'quote', text: 'Plants feed the world.' },
      { type: 'paragraph', text: '6CO2 + 6H2O' },
    ]);
    const all = JSON.stringify(read);
    expect(all).not.toContain('About');
    expect(all).not.toContain('Related');
    expect(all).not.toContain('Copyright');
  });

  it('never reads a form value, an editable area or a hidden element', () => {
    show(`
      <main>
        <p>${LONG}</p>
        <form>
          <label>Your name <input value="Jamie Student" /></label>
          <textarea>Secret essay draft</textarea>
          <select><option selected>Period 3</option></select>
          <div contenteditable="true">Typed private note</div>
          <button>Submit</button>
        </form>
        <p hidden>Hidden answer key</p>
        <p style="display:none">Display none text</p>
        <p aria-hidden="true">Screen-reader-hidden</p>
      </main>`);
    const input = document.querySelector('input') as HTMLInputElement;
    input.value = 'Typed after load';
    const all = JSON.stringify(readPage(window));
    expect(all).toContain('Your name');
    for (const secret of [
      'Jamie Student',
      'Typed after load',
      'Secret essay draft',
      'Period 3',
      'Typed private note',
      'Submit',
      'Hidden answer key',
      'Display none text',
      'Screen-reader-hidden',
    ])
      expect(all).not.toContain(secret);
  });

  it('reads only the selection when the teacher selected text', () => {
    show(
      `<main><p>${LONG}</p><p id="pick">Only this sentence.</p><p>Not this one.</p></main>`
    );
    const range = document.createRange();
    range.selectNodeContents(document.getElementById('pick') as HTMLElement);
    window.getSelection()?.addRange(range);
    const read = readPage(window);
    expect(read.selectionOnly).toBe(true);
    expect(read.blocks).toEqual([
      { type: 'paragraph', text: 'Only this sentence.' },
    ]);
  });

  it('sends nothing when the selection is only inside a form control', () => {
    show(
      `<main><p>${LONG}</p><div><textarea id="t">draft</textarea></div></main>`
    );
    const range = document.createRange();
    range.selectNodeContents(document.getElementById('t') as HTMLElement);
    window.getSelection()?.addRange(range);
    const read = readPage(window);
    expect(read.selectionOnly).toBe(true);
    expect(read.blocks).toEqual([]);
    expect(JSON.stringify(read)).not.toContain('draft');
  });

  it('sends nothing when the selection is only inside an editable area', () => {
    show(
      `<main><p>${LONG}</p><div contenteditable="true"><p id="t">my draft reply</p></div></main>`
    );
    const range = document.createRange();
    range.selectNodeContents(document.getElementById('t') as HTMLElement);
    window.getSelection()?.addRange(range);
    const read = readPage(window);
    expect(read.blocks).toEqual([]);
    expect(JSON.stringify(read)).not.toContain('draft');
  });

  it('leaves CSS-hidden text out of a selection', () => {
    show(
      `<style>.key{display:none}</style><main><div id="q"><p>Question one</p><p class="key">Answer: B</p><p>Question two</p></div></main>`
    );
    const range = document.createRange();
    range.selectNodeContents(document.getElementById('q') as HTMLElement);
    window.getSelection()?.addRange(range);
    expect(readPage(window).blocks).toEqual([
      { type: 'paragraph', text: 'Question one' },
      { type: 'paragraph', text: 'Question two' },
    ]);
  });

  it('trims a selection to the selected characters', () => {
    show(`<main><p id="p">Keep this part, drop the rest.</p></main>`);
    const text = (document.getElementById('p') as HTMLElement)
      .firstChild as Text;
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 14);
    window.getSelection()?.addRange(range);
    expect(readPage(window).blocks).toEqual([
      { type: 'paragraph', text: 'Keep this part' },
    ]);
  });

  it('never picks a typed draft or a hidden region as the main content', () => {
    show(`
      <div id="real"><p>${LONG}</p><p>${LONG}</p></div>
      <div contenteditable="true"><div><p>Draft ${LONG}</p><p>Draft ${LONG}</p><p>Draft ${LONG}</p><img src="/draft.png"/></div></div>
      <div style="display:none"><div><p>Hidden ${LONG}</p><p>Hidden ${LONG}</p><p>Hidden ${LONG}</p></div></div>`);
    const all = JSON.stringify(readPage(window));
    expect(all).toContain('Photosynthesis');
    expect(all).not.toContain('Draft');
    expect(all).not.toContain('Hidden');
    expect(all).not.toContain('draft.png');
  });

  it('keeps inline icons and links inside one paragraph', () => {
    show(
      `<main><p>Click <svg></svg><a href="#">here</a> to see ${LONG}</p></main>`
    );
    expect(readPage(window).blocks).toEqual([
      { type: 'paragraph', text: `Click here to see ${LONG.trim()}` },
    ]);
  });

  it('finds the text-heavy column on a page without article or main', () => {
    show(`
      <div id="menu"><ul><li><a href="/a">Link one</a></li><li><a href="/b">Link two that is longer</a></li></ul></div>
      <div id="content"><div><p>${LONG}</p><p>${LONG}</p><p>${LONG}</p></div></div>`);
    expect(mainContent(document).closest('#content')).not.toBeNull();
    expect(JSON.stringify(readPage(window))).not.toContain('Link one');
  });

  it('collects absolute picture URLs, skipping icons, data URLs and duplicates', () => {
    show(`
      <main>
        <p>${LONG}</p>
        <img src="/diagram.png" width="400" height="300" />
        <img src="/diagram.png" />
        <img src="https://cdn.example.com/leaf.jpg" alt=" A  leaf" />
        <img src="/icon.png" width="16" height="16" />
        <img src="data:image/png;base64,AAAA" />
      </main>`);
    expect(readPage(window).images).toEqual([
      { url: `${location.origin}/diagram.png` },
      { url: 'https://cdn.example.com/leaf.jpg', alt: 'A leaf' },
    ]);
  });

  it('caps the pictures it sends', () => {
    const imgs = Array.from(
      { length: MAX_IMAGES + 10 },
      (_, i) => `<img src="/p${i}.png" />`
    ).join('');
    show(`<main><p>${LONG}</p>${imgs}</main>`);
    expect(readPage(window).images).toHaveLength(MAX_IMAGES);
  });

  it('never reads its own Send button', () => {
    show(
      `<main><p>${LONG}</p></main><div id="spartboard-send">Send to SpartBoard</div>`
    );
    expect(JSON.stringify(readPage(window))).not.toContain('Send to');
  });
});

describe('pageUrl', () => {
  it('drops the sign-in part and fragment, and a query that runs past the cap', () => {
    expect(pageUrl('https://me:pw@a.org/x?q=1#top')).toBe(
      'https://a.org/x?q=1'
    );
    expect(pageUrl(`https://a.org/x?q=${'z'.repeat(3000)}`)).toBe(
      'https://a.org/x'
    );
    expect(pageUrl(`https://a.org/${'p'.repeat(3000)}`)).toBe('https://a.org');
  });
});
