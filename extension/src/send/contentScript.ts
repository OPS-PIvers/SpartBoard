// The Send to SpartBoard edge tab on every page (IMPORT D14, D15): a Platform reader where one matches, the generic read elsewhere.

import { pageUrl, readPage, readSelectionText } from './readPage';
import {
  parseSendTabMessage,
  SEND_HOST_ID,
  type SendPageMessage,
  type SendReply,
  type SendStateReply,
} from './messages';
import { SEND_SETTINGS_KEY } from './settings';
import { sendNote, type SendNote } from './sendNote';
import { singleItem } from '../schoology/singleItem';
import { sendItem } from '../schoology/sendItem';
import type { SchoologyMessage } from '../schoology/messages';
import {
  EDPUZZLE_PLATFORM,
  edpuzzleLessonId,
  readEdpuzzleLesson,
} from '../edpuzzle/lesson';
import type { ImportReaderFailure } from '@/utils/import/contract';

const ask = <T>(message: SendPageMessage) =>
  chrome.runtime.sendMessage<SendPageMessage, T>(message);

const STYLE = `
:host { all: initial; }
[hidden] { display: none !important; }
.wrap { position: fixed; right: 0; bottom: 96px; z-index: 2147483000; font: 14px/1.4 Lexend, system-ui, sans-serif; color: #0f172a; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
.tab { all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 10px; height: 44px; max-width: 40px; padding: 0 12px; overflow: hidden; white-space: nowrap; cursor: pointer; background: #2d3f89; color: #fff; font-weight: 600; border-radius: 10px 0 0 10px; box-shadow: 0 4px 14px rgb(15 23 42 / .25); transition: max-width 160ms cubic-bezier(.2,.8,.2,1); }
.tab svg { flex: none; width: 16px; height: 16px; }
.tab .label { opacity: 0; transition: opacity 120ms ease-out; }
.tab:hover, .tab:focus-visible, .tab[aria-busy="true"] { max-width: 260px; }
.tab:hover .label, .tab:focus-visible .label, .tab[aria-busy="true"] .label { opacity: 1; }
.tab:focus-visible { outline: 3px solid #93c5fd; outline-offset: 2px; }
.tab[aria-busy="true"] { cursor: default; }
.note { box-sizing: border-box; margin-right: 12px; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 12px 10px 14px; width: 300px; box-shadow: 0 8px 24px rgb(15 23 42 / .18); display: flex; flex-direction: column; gap: 8px; }
.note.bad .text { color: #ad2122; }
.note .row { display: flex; gap: 8px; justify-content: flex-end; }
.note button { all: unset; box-sizing: border-box; cursor: pointer; border-radius: 8px; min-height: 36px; padding: 0 12px; font-weight: 600; }
.note button:focus-visible { outline: 3px solid #93c5fd; outline-offset: 2px; }
.note .open { background: #2d3f89; color: #fff; }
.note .close { color: #2d3f89; }
@media (prefers-reduced-motion: reduce) { .tab, .tab .label { transition: none; } }
`;

// Built node by node: pages that require Trusted Types (Gmail, YouTube, Docs) refuse an innerHTML assignment.
const ICON_PATHS = [
  'M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z',
  'm21.854 2.147-10.94 10.939',
];

function sendIcon(): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  for (const [k, v] of Object.entries({
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '2',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
  }))
    svg.setAttribute(k, v);
  for (const d of ICON_PATHS) {
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

const LABEL = 'Send to SpartBoard';

interface Ui {
  tab: HTMLButtonElement;
  label: HTMLSpanElement;
  note: HTMLDivElement;
}

let ui: Ui | null = null;
let shown = false;
let busy = false;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function mount(): Ui {
  if (ui?.tab.isConnected) return ui;
  document.getElementById(SEND_HOST_ID)?.remove();
  const host = el('div', { id: SEND_HOST_ID });
  const root = host.attachShadow({ mode: 'closed' });
  const label = el('span', { className: 'label', textContent: LABEL });
  const tab = el('button', { className: 'tab', type: 'button', title: LABEL });
  tab.setAttribute('aria-label', LABEL);
  tab.append(sendIcon(), label);
  tab.onclick = () => void send(false);
  const note = el('div', { className: 'note', hidden: true });
  note.setAttribute('role', 'status');
  root.append(
    el('style', { textContent: STYLE }),
    el('div', { className: 'wrap' }, note, tab)
  );
  document.documentElement.append(host);
  ui = { tab, label, note };
  return ui;
}

function render() {
  if (!shown && !busy && (!ui || ui.note.hidden)) {
    document.getElementById(SEND_HOST_ID)?.remove();
    ui = null;
    return;
  }
  const { tab } = mount();
  tab.hidden = !shown && !busy;
}

function progress(text: string | null) {
  const { tab, label } = mount();
  busy = text !== null;
  tab.setAttribute('aria-busy', String(busy));
  tab.disabled = busy;
  label.textContent = text ?? LABEL;
  render();
}

function showNote(n: SendNote) {
  const { note } = mount();
  note.className = n.ok ? 'note' : 'note bad';
  const close = el('button', {
    className: 'close',
    type: 'button',
    textContent: 'Close',
    onclick: () => {
      note.hidden = true;
      render();
    },
  });
  const row = el('div', { className: 'row' }, close);
  if (n.open)
    row.append(
      el('button', {
        className: 'open',
        type: 'button',
        textContent: 'Open in SpartBoard',
        onclick: () => {
          note.hidden = true;
          render();
          void (n.open === 'schoology'
            ? chrome.runtime.sendMessage<SchoologyMessage>({
                type: 'schoology/open',
              })
            : ask({ type: 'send/open' }));
        },
      })
    );
  note.replaceChildren(
    el('div', { className: 'text', textContent: n.text }),
    row
  );
  note.hidden = false;
  render();
}

/** The generic read, sent to the Import inbox; `failure` says which reader fell back (D18). */
async function sendGeneric(
  failure?: ImportReaderFailure,
  frameText?: string
): Promise<SendNote> {
  progress('Reading…');
  const request = frameText
    ? readSelectionText(window, frameText)
    : readPage(window);
  if (!request.blocks.length)
    return sendNote({ kind: 'empty', selectionOnly: request.selectionOnly });
  progress('Sending…');
  const reply = await ask<SendReply>({
    type: 'send/page',
    request: failure ? { ...request, readerFailure: failure } : request,
  }).catch(() => undefined);
  return sendNote({
    kind: 'reply',
    reply,
    selectionOnly: request.selectionOnly,
    fellBack:
      failure?.platform === EDPUZZLE_PLATFORM ? EDPUZZLE_PLATFORM : !!failure,
  });
}

/** An Edpuzzle lesson as a video lesson (D30-D33); an unreadable one falls back to the page text. */
async function sendEdpuzzle(id: string): Promise<SendNote> {
  progress('Reading…');
  const read = await readEdpuzzleLesson(id);
  if (!read.ok && read.why === 'not-youtube')
    return sendNote({ kind: 'not-youtube' });
  if (!read.ok) {
    return sendGeneric({
      platform: EDPUZZLE_PLATFORM,
      reason: read.reason.slice(0, 500),
    });
  }
  progress('Sending…');
  const reply = await ask<SendReply>({
    type: 'send/page',
    request: {
      url: pageUrl(location.href),
      title: read.title,
      platform: EDPUZZLE_PLATFORM,
      selectionOnly: false,
      blocks: read.blocks,
      images: [],
      video: read.video,
    },
  }).catch(() => undefined);
  return sendNote({ kind: 'reply', reply, lesson: { skipped: read.skipped } });
}

async function send(blocked: boolean, frameText?: string) {
  if (busy) return;
  if (blocked) {
    showNote(sendNote({ kind: 'blocked' }));
    return;
  }
  ui?.note.setAttribute('hidden', '');
  try {
    if (frameText) {
      showNote(await sendGeneric(undefined, frameText));
      return;
    }
    // Platform readers first; a selection always means the teacher wants just that text.
    const selected = !!window.getSelection()?.toString().trim();
    const state = await ask<SendStateReply>({ type: 'send/state' }).catch(
      () => undefined
    );
    const schoology =
      selected || !state?.schoology
        ? null
        : singleItem(document, location.href);
    if (schoology) {
      progress('Reading…');
      const outcome = await sendItem(
        schoology.item,
        schoology.courseName,
        (done, total) =>
          progress(
            done < total ? `Reading ${done + 1} of ${total}…` : 'Sending…'
          )
      );
      if (outcome.readError) {
        showNote(
          await sendGeneric({
            platform: 'schoology',
            reason: outcome.readError.slice(0, 500),
          })
        );
        return;
      }
      showNote({ ...outcome, open: outcome.ok ? 'schoology' : undefined });
      return;
    }
    const lessonId = selected ? null : edpuzzleLessonId(location.href);
    if (lessonId) {
      showNote(await sendEdpuzzle(lessonId));
      return;
    }
    showNote(await sendGeneric());
  } catch {
    showNote(sendNote({ kind: 'reply', reply: undefined }));
  } finally {
    progress(null);
  }
}

async function recheck() {
  const state = await ask<SendStateReply>({ type: 'send/state' }).catch(
    () => undefined
  );
  shown = state?.show === true;
  render();
}

// The worker may inject again on the same document; one set of listeners is enough.
const injected = globalThis as { spartSendListening?: boolean };
if (!injected.spartSendListening) {
  injected.spartSendListening = true;
  chrome.runtime.onMessage.addListener((raw: unknown, sender) => {
    if (sender.id !== chrome.runtime.id || sender.tab) return false;
    const msg = parseSendTabMessage(raw);
    if (msg?.type === 'send/now') void send(msg.blocked, msg.selectionText);
    if (msg?.type === 'send/recheck') void recheck();
    return false;
  });
  chrome.storage.onChanged.addListener((changes) => {
    if (SEND_SETTINGS_KEY in changes) void recheck();
  });
  void recheck();
}
