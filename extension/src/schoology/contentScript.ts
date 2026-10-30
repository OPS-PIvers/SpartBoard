// The Send to SpartBoard button on Schoology quiz and bank pages, and the checklist on Materials and Resources folders (SCHOOLOGY_QUIZ_IMPORT Q4, Q5).

import { readFromSchoology, type ReadDeps } from './fetchRead';
import type { SchoologyMessage, SendReply } from './messages';
import {
  courseOf,
  isClassicBankPage,
  isClassicQuizPage,
  materialsItems,
  pageTitle,
  resourcesCrumbs,
  resourcesItems,
  schoologyPage,
  type SchoologyItem,
} from './page';
import { collectPictures, inboxRequest } from './payload';
import { sendOutcome, type SendOutcome } from './sendOutcome';

const HOST_ID = 'spartboard-schoology-import';
const PAUSE_MS = 250;

const get = (path: string) =>
  fetch(path, { credentials: 'include', headers: { Accept: '*/*' } });

const readDeps = (onProgress?: ReadDeps['onProgress']): ReadDeps => ({
  get,
  origin: location.origin,
  pause: () => new Promise((r) => setTimeout(r, PAUSE_MS)),
  onProgress,
});

const ask = <T>(message: SchoologyMessage) =>
  chrome.runtime.sendMessage<SchoologyMessage, T>(message);

function itemUrl(item: SchoologyItem): string {
  if (item.kind === 'testQuiz')
    return `${location.origin}/assignment/${item.itemId}`;
  if (item.kind === 'questionBank')
    return item.bank === 'item'
      ? `${location.origin}/common-assessment-question-banks/${item.itemId}`
      : `${location.origin}/resources/my/${item.collectionId ?? ''}?f=${item.itemId}`;
  return `${location.origin}/course/${item.sectionId ?? ''}/assessments/${item.itemId}`;
}

/** Reads one quiz, copies its pictures and posts it to the inbox. */
async function sendItem(
  item: SchoologyItem,
  courseName: string | null,
  onProgress?: ReadDeps['onProgress']
): Promise<SendOutcome> {
  try {
    const read = await readFromSchoology(item, readDeps(onProgress));
    const pictures = await collectPictures(
      read.imageUrls,
      get,
      location.origin
    );
    const reply = await ask<SendReply>({
      type: 'schoology/send',
      request: inboxRequest(item, read, courseName, pictures, itemUrl(item)),
    });
    return sendOutcome(reply);
  } catch (error) {
    return sendOutcome(error);
  }
}

const STYLE = `
:host { all: initial; }
.wrap { position: fixed; right: 20px; bottom: 20px; z-index: 2147483000; font: 14px/1.4 Lexend, system-ui, sans-serif; color: #0f172a; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
button { font: inherit; cursor: pointer; border-radius: 10px; border: 0; min-height: 44px; padding: 0 16px; }
button:disabled { cursor: default; opacity: .6; }
button:focus-visible { outline: 3px solid #93c5fd; outline-offset: 2px; }
.main { background: #2d3f89; color: #fff; font-weight: 600; box-shadow: 0 6px 20px rgb(15 23 42 / .25); }
.ghost { background: transparent; color: #2d3f89; font-weight: 600; }
.panel { background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; box-shadow: 0 12px 32px rgb(15 23 42 / .2); width: 340px; max-height: 60vh; display: flex; flex-direction: column; }
.panel header { padding: 14px 16px 8px; font-weight: 600; display: flex; justify-content: space-between; align-items: center; }
.list { overflow-y: auto; padding: 0 8px 8px; }
.row { display: flex; align-items: center; gap: 10px; padding: 8px; border-radius: 8px; min-height: 28px; }
.row input { width: 18px; height: 18px; accent-color: #2d3f89; }
.row .state { margin-left: auto; font-size: 12px; color: #475569; white-space: nowrap; }
.row .bad { color: #ad2122; }
.reason { color: #ad2122; font-size: 12px; padding: 0 8px 6px 36px; }
.panel footer { padding: 8px 16px 14px; display: flex; gap: 8px; justify-content: flex-end; border-top: 1px solid #f1f5f9; }
.note { background: #fff; border-radius: 10px; padding: 10px 14px; max-width: 320px; box-shadow: 0 6px 20px rgb(15 23 42 / .2); }
.note.bad { color: #ad2122; }
`;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function mount(): HTMLDivElement {
  document.getElementById(HOST_ID)?.remove();
  const host = el('div', { id: HOST_ID });
  const root = host.attachShadow({ mode: 'closed' });
  root.append(el('style', { textContent: STYLE }));
  const wrap = el('div', { className: 'wrap' });
  root.append(wrap);
  document.body.append(host);
  return wrap;
}

const reviewButton = () =>
  el('button', {
    className: 'main',
    textContent: 'Review in SpartBoard',
    onclick: () => void ask({ type: 'schoology/open' }),
  });

function singleButton(
  wrap: HTMLDivElement,
  item: SchoologyItem,
  courseName: string | null
) {
  const note = el('div', { className: 'note', hidden: true });
  const button = el('button', {
    className: 'main',
    textContent: 'Send to SpartBoard',
  });
  button.onclick = async () => {
    button.disabled = true;
    note.hidden = true;
    button.textContent = 'Reading…';
    const outcome = await sendItem(item, courseName, (done, total) => {
      button.textContent =
        done < total ? `Reading ${done + 1} of ${total}…` : 'Sending…';
    });
    button.disabled = false;
    if (outcome.ok) {
      note.className = 'note';
      note.textContent = outcome.text;
      note.hidden = false;
      button.replaceWith(reviewButton());
    } else {
      note.className = 'note bad';
      note.textContent = outcome.text;
      note.hidden = false;
      button.textContent = 'Send to SpartBoard';
    }
  };
  wrap.append(note, button);
}

function checklist(
  wrap: HTMLDivElement,
  items: SchoologyItem[],
  courseName: string | null,
  labels: { open: string; header: string }
) {
  const opener = el('button', {
    className: 'main',
    textContent: labels.open,
  });
  const panel = el('div', { className: 'panel', hidden: true });
  const boxes = items.map((item) => {
    const box = el('input', { type: 'checkbox', checked: true });
    const state = el('span', { className: 'state' });
    const reason = el('div', { className: 'reason', hidden: true });
    const row = el(
      'div',
      {},
      el(
        'label',
        { className: 'row' },
        box,
        el('span', { textContent: item.title }),
        state
      ),
      reason
    );
    return { item, box, state, reason, row, sent: false };
  });
  const send = el('button', { className: 'main' });
  const review = reviewButton();
  review.hidden = true;
  const count = () => {
    const n = boxes.filter((b) => b.box.checked && !b.sent).length;
    send.textContent = `Send ${n}`;
    send.disabled = n === 0;
  };
  for (const b of boxes) b.box.onchange = count;
  count();
  const close = el('button', {
    className: 'ghost',
    textContent: 'Close',
    onclick: () => {
      panel.hidden = true;
      opener.hidden = false;
    },
  });
  const footer = el('footer', {}, close, send, review);
  panel.append(
    el('header', { textContent: labels.header }),
    el('div', { className: 'list' }, ...boxes.map((b) => b.row)),
    footer
  );
  opener.onclick = () => {
    opener.hidden = true;
    panel.hidden = false;
  };
  send.onclick = async () => {
    const chosen = boxes.filter((b) => b.box.checked && !b.sent);
    send.disabled = true;
    close.disabled = true;
    for (const b of boxes) b.box.disabled = true;
    // One at a time keeps Schoology's request rate low (Q5).
    for (const [i, b] of chosen.entries()) {
      send.textContent = `Sending ${i + 1} of ${chosen.length}…`;
      b.state.className = 'state';
      b.state.textContent = 'Reading…';
      b.reason.hidden = true;
      const outcome = await sendItem(b.item, courseName);
      b.sent = outcome.ok;
      b.state.className = outcome.ok ? 'state' : 'state bad';
      b.state.textContent = outcome.ok ? 'Sent' : 'Not sent';
      b.reason.textContent = outcome.ok ? '' : outcome.text;
      b.reason.hidden = outcome.ok;
    }
    close.disabled = false;
    // Sent rows stay locked; the rest can be sent again.
    for (const b of boxes) b.box.disabled = b.sent;
    review.hidden = !boxes.some((b) => b.sent);
    send.hidden = boxes.every((b) => b.sent);
    count();
  };
  wrap.append(panel, opener);
}

const QUIZ_LABELS = {
  open: 'Send quizzes to SpartBoard',
  header: 'Tests/Quizzes and Assessments',
};
const BANK_LABELS = {
  open: 'Send question banks to SpartBoard',
  header: 'Question banks',
};

/** Resources fills a folder in after the URL changes; waits up to 10 seconds for this folder's own links. */
function folderShown(folderId: string | undefined): Promise<boolean> {
  const ready = () =>
    !!document.querySelector(
      '#collection-view-contents, table.collection-question-bank'
    ) &&
    (!folderId ||
      !!document.querySelector(`a[href$="/bulk_move?f=${folderId}"]`));
  if (ready()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      if (!ready()) return;
      observer.disconnect();
      clearTimeout(timer);
      resolve(true);
    });
    const timer = setTimeout(() => {
      observer.disconnect();
      resolve(false);
    }, 10_000);
    observer.observe(document.body, { childList: true, subtree: true });
  });
}

let rendering = 0;

async function render() {
  const run = ++rendering;
  const page = schoologyPage(location.href);
  const course = courseOf(document);
  document.getElementById(HOST_ID)?.remove();
  if (!page) return;
  if (page.kind === 'materials') {
    const items = materialsItems(document, page.sectionId);
    if (items.length === 0) return;
    checklist(mount(), items, course?.name ?? null, QUIZ_LABELS);
    return;
  }
  if (page.kind === 'resources') {
    // Moving between folders swaps the content in place, so wait for this folder's.
    if (!(await folderShown(page.folderId)) || run !== rendering) return;
    if (isClassicBankPage(document)) {
      if (!page.folderId) return;
      const crumbs = resourcesCrumbs(document);
      singleButton(
        mount(),
        {
          kind: 'questionBank',
          bank: 'classic',
          itemId: page.folderId,
          collectionId: page.collectionId,
          title: crumbs.at(-1) ?? 'Question bank',
        },
        null
      );
      return;
    }
    const items = resourcesItems(document, page.collectionId);
    if (items.length === 0) return;
    checklist(mount(), items, null, BANK_LABELS);
    return;
  }
  if (page.kind === 'questionBank') {
    singleButton(mount(), { ...page, title: pageTitle(document) }, null);
    return;
  }
  if (page.kind === 'testQuiz' && !isClassicQuizPage(document, page.itemId))
    return;
  singleButton(
    mount(),
    {
      ...page,
      sectionId: page.sectionId ?? course?.sectionId,
      title: pageTitle(document),
    },
    course?.name ?? null
  );
}

// The service worker injects again after Resources moves to another folder in the page; one listener is enough.
const injected = globalThis as { spartSchoologyListening?: boolean };
if (!injected.spartSchoologyListening) {
  injected.spartSchoologyListening = true;
  addEventListener('hashchange', () => void render());
}
void render();
