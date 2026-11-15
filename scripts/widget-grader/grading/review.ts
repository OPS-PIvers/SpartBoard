// Weekly approval page for loop candidates: Paul taps Approve or Skip, and the page republishes itself with his picks.
// node scripts/widget-grader/grading/review.ts build --candidates <file.json> --out <dir>
// node scripts/widget-grader/grading/review.ts decisions --page <index.html>

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ReviewShot {
  caption: string;
  before: string;
  after: string;
}

export interface ReviewCandidate {
  id: string;
  widgetType: string;
  widgetName: string;
  dimension: string;
  branch: string;
  summary: string;
  gains: { criterionId: string; before: number | null; after: number }[];
  shots: ReviewShot[];
}

export interface ReviewDecision {
  choice: 'approve' | 'skip';
  note?: string;
}

export interface ReviewState {
  weekId: string;
  candidates: ReviewCandidate[];
  decisions: Record<string, ReviewDecision>;
  sentAt: string | null;
}

const STATE_RE =
  /<script type="application\/json" id="review-state">([\s\S]*?)<\/script>/;

export const embedJson = (value: unknown): string =>
  JSON.stringify(value).replace(/</g, '\\u003c');

export function readState(html: string): ReviewState {
  const m = STATE_RE.exec(html);
  if (!m) throw new Error('No review state in page');
  return JSON.parse(m[1]) as ReviewState;
}

const dataUri = (path: string): string =>
  `data:image/png;base64,${readFileSync(path).toString('base64')}`;

/** Inlines every screenshot so the page can republish itself as one document. */
export function inlineShots(
  candidates: ReviewCandidate[],
  base: string
): ReviewCandidate[] {
  return candidates.map((c) => ({
    ...c,
    shots: c.shots.map((s) => ({
      caption: s.caption,
      before: dataUri(resolve(base, s.before)),
      after: dataUri(resolve(base, s.after)),
    })),
  }));
}

const STYLE = `
:root{--bg:#f7f8fa;--surface:#fff;--text:#1d2433;--muted:#5b6475;--line:#e3e6ec;--brand:#2d3f89;--ok:#1f7a4d;--skip:#8a4b14;--shot:#eef0f4}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#12151c;--surface:#1a1e27;--text:#e7eaf0;--muted:#9aa3b5;--line:#2c3240;--brand:#8ea2f0;--ok:#5fc795;--skip:#e0a36b;--shot:#232835}}
:root[data-theme="dark"]{--bg:#12151c;--surface:#1a1e27;--text:#e7eaf0;--muted:#9aa3b5;--line:#2c3240;--brand:#8ea2f0;--ok:#5fc795;--skip:#e0a36b;--shot:#232835}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:980px;margin:0 auto;padding:24px 16px 64px}
h1{font-size:22px;margin:0 0 4px}
.sub{color:var(--muted);margin:0 0 20px}
.fix{background:var(--surface);border-top:1px solid var(--line);padding:20px 0 24px}
.fix h2{font-size:17px;margin:0 0 4px}
.fix p{margin:0 0 10px}
.gains{color:var(--muted);font-size:13px;margin-bottom:12px}
.shot{margin:0 0 14px}
.shot .cap{font-size:13px;color:var(--muted);margin-bottom:6px}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.pair figure{margin:0}
.pair figcaption{font-size:12px;color:var(--muted);margin-bottom:4px}
.pair img{display:block;max-width:100%;height:auto;background:var(--shot);border:1px solid var(--line)}
.choices{display:flex;gap:10px;justify-content:center;margin-top:8px}
button{font:inherit;padding:8px 18px;border-radius:6px;border:1px solid var(--line);background:var(--surface);color:var(--text);cursor:pointer;min-height:40px}
button[aria-pressed="true"].approve{background:var(--ok);border-color:var(--ok);color:#fff}
button[aria-pressed="true"].skip{background:var(--skip);border-color:var(--skip);color:#fff}
button:disabled{opacity:.5;cursor:default}
.note{display:block;width:100%;max-width:520px;margin:10px auto 0;padding:8px;border:1px solid var(--line);border-radius:6px;background:var(--surface);color:var(--text);font:inherit}
.send{display:flex;flex-direction:column;align-items:center;gap:8px;margin-top:24px}
.send .primary{background:var(--brand);border-color:var(--brand);color:#fff}
.status{color:var(--muted);font-size:14px;text-align:center}
@media (max-width:560px){.pair{grid-template-columns:1fr}}
`;

const SCRIPT = String.raw`
(function () {
  var stateEl = document.getElementById('review-state');
  var state = JSON.parse(stateEl.textContent);
  var app = document.getElementById('app');
  var artifactApi = null;
  var sending = false;
  var message = '';

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') n.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }

  function decided() {
    return state.candidates.filter(function (c) { return state.decisions[c.id]; }).length;
  }

  function pick(id, choice) {
    if (state.sentAt) return;
    var prev = state.decisions[id] || {};
    state.decisions[id] = { choice: choice, note: prev.note || '' };
    render();
  }

  function setNote(id, value) {
    var d = state.decisions[id];
    if (d) d.note = value;
  }

  function documentFor(next) {
    var parts = [
      document.querySelector('title').outerHTML,
      document.getElementById('review-style').outerHTML,
      '<main id="app"></main>',
      '<script type="application/json" id="review-state">' +
        JSON.stringify(next).replace(/</g, '\\u003c') + '</scr' + 'ipt>',
      document.getElementById('review-main').outerHTML,
    ];
    return '<!doctype html><html>' + document.head.outerHTML + '<body>' + parts.join('') + '</body></html>';
  }

  function send() {
    if (!artifactApi || sending) return;
    sending = true;
    message = 'Sending…';
    render();
    var next = JSON.parse(JSON.stringify(state));
    next.sentAt = new Date().toISOString();
    artifactApi.publish(documentFor(next)).catch(function (e) {
      sending = false;
      message = e && e.code === 'conflict' ? 'Someone else just sent this page.' : 'Could not send. Try again.';
      render();
    });
  }

  function render() {
    var total = state.candidates.length;
    var locked = !!state.sentAt;
    var kids = [
      el('h1', { text: 'Widget fixes' }),
      el('p', { class: 'sub', text: locked
        ? 'Sent ' + new Date(state.sentAt).toLocaleString() + '. Approved fixes become PRs and merge when CI passes.'
        : 'Week of ' + state.weekId + '. Approve a fix to open its PR. Skip the ones you do not want.' }),
    ];
    if (!total) kids.push(el('p', { class: 'status', text: 'No fixes this week.' }));
    state.candidates.forEach(function (c) {
      var d = state.decisions[c.id];
      var gains = c.gains.map(function (g) {
        return g.criterionId + ' ' + (g.before == null ? '-' : g.before) + ' to ' + g.after;
      }).join(', ');
      var shots = c.shots.map(function (s) {
        return el('div', { class: 'shot' }, [
          el('div', { class: 'cap', text: s.caption }),
          el('div', { class: 'pair' }, [
            el('figure', {}, [el('figcaption', { text: 'Before' }), el('img', { src: s.before, alt: c.widgetName + ' before, ' + s.caption })]),
            el('figure', {}, [el('figcaption', { text: 'After' }), el('img', { src: s.after, alt: c.widgetName + ' after, ' + s.caption })]),
          ]),
        ]);
      });
      var approve = el('button', { class: 'approve', 'aria-pressed': String(d && d.choice === 'approve'), text: 'Approve', onclick: function () { pick(c.id, 'approve'); } });
      var skip = el('button', { class: 'skip', 'aria-pressed': String(d && d.choice === 'skip'), text: 'Skip', onclick: function () { pick(c.id, 'skip'); } });
      if (locked || !artifactApi) { approve.disabled = true; skip.disabled = true; }
      var note = null;
      if (d && d.choice === 'skip') {
        note = el('input', { class: 'note', type: 'text', placeholder: 'Why skip? (optional)', 'aria-label': 'Why skip ' + c.widgetName });
        note.value = d.note || '';
        if (locked) note.disabled = true;
        note.addEventListener('input', function (e) { setNote(c.id, e.target.value); });
      }
      kids.push(el('section', { class: 'fix' }, [
        el('h2', { text: c.widgetName }),
        el('p', { text: c.summary }),
        gains ? el('div', { class: 'gains', text: 'Judge scores: ' + gains }) : null,
      ].concat(shots).concat([el('div', { class: 'choices' }, [approve, skip]), note])));
    });
    if (total && !locked) {
      var ready = decided() === total;
      var btn = el('button', { class: 'primary', text: 'Send to Claude', onclick: send });
      btn.disabled = !ready || sending || !artifactApi;
      kids.push(el('div', { class: 'send' }, [
        btn,
        el('div', { class: 'status', text: message || (artifactApi
          ? decided() + ' of ' + total + ' decided'
          : 'Open this page signed in as its owner to approve fixes.') }),
      ]));
    }
    app.replaceChildren.apply(app, kids);
  }

  render();
  if (window.claude && window.claude.use) {
    window.claude.use('artifact').then(function (a) { artifactApi = a; render(); });
  }
})();
`;

export function buildPage(state: ReviewState): string {
  return [
    '<title>Widget Fixes</title>',
    `<style id="review-style">${STYLE}</style>`,
    '<main id="app"></main>',
    `<script type="application/json" id="review-state">${embedJson(state)}</script>`,
    `<script id="review-main">${SCRIPT}</script>`,
  ].join('\n');
}

function main(argv: string[]): void {
  const arg = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  if (argv[0] === 'build') {
    const file = arg('candidates');
    const out = arg('out');
    if (!file || !out) {
      console.error(
        'usage: review.ts build --candidates <file.json> --out <dir>'
      );
      process.exit(2);
    }
    const input = JSON.parse(readFileSync(file, 'utf8')) as {
      weekId: string;
      candidates: ReviewCandidate[];
    };
    const state: ReviewState = {
      weekId: input.weekId,
      candidates: inlineShots(input.candidates, dirname(resolve(file))),
      decisions: {},
      sentAt: null,
    };
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, 'index.html'), buildPage(state));
    console.log(join(out, 'index.html'));
    return;
  }
  if (argv[0] === 'decisions') {
    const page = arg('page');
    if (!page) {
      console.error('usage: review.ts decisions --page <index.html>');
      process.exit(2);
    }
    const s = readState(readFileSync(page, 'utf8'));
    console.log(
      JSON.stringify(
        {
          weekId: s.weekId,
          sentAt: s.sentAt,
          decisions: s.candidates.map((c) => ({
            id: c.id,
            widgetType: c.widgetType,
            branch: c.branch,
            ...(s.decisions[c.id] ?? { choice: null }),
          })),
        },
        null,
        2
      )
    );
    return;
  }
  console.error('usage: review.ts build|decisions');
  process.exit(2);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main(process.argv.slice(2));
