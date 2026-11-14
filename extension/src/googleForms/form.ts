// The Google Forms Platform reader: a form's questions from its page data, with the pictures the page shows.

import {
  GOOGLE_FORM_ID,
  GOOGLE_FORMS_PLATFORM,
  IMPORT_MAX_BLOCKS,
  IMPORT_MAX_FORM_ITEMS,
  IMPORT_MAX_FORM_OPTIONS,
  IMPORT_MAX_FORM_TEXT_CHARS,
  IMPORT_MAX_TITLE_CHARS,
  type ImportBlock,
  type ImportForm,
  type ImportFormItem,
  type ImportFormLeftOut,
  type ImportFormOption,
  type ImportFormQuestion,
  type ImportFormQuestionKind,
} from '@/utils/import/contract';

export { GOOGLE_FORMS_PLATFORM };

export type FormPage = { kind: 'edit'; formId: string } | { kind: 'view' };

/** The editor (`/forms/d/<id>/edit`) or a responder page (`/forms/d/e/<id>/viewform`); null elsewhere. */
export function googleFormPage(href: string): FormPage | null {
  try {
    const u = new URL(href);
    if (u.hostname !== 'docs.google.com') return null;
    const path = u.pathname.replace(/^\/forms\/u\/\d+\//, '/forms/');
    if (/^\/forms\/d\/e\/[A-Za-z0-9_-]+\/viewform\/?$/.test(path))
      return { kind: 'view' };
    const id = /^\/forms\/d\/([A-Za-z0-9_-]+)\/edit\/?$/.exec(path)?.[1];
    return id && GOOGLE_FORM_ID.test(id) ? { kind: 'edit', formId: id } : null;
  } catch {
    return null;
  }
}

type Arr = unknown[];
const arr = (v: unknown): Arr => (Array.isArray(v) ? v : []);
const str = (v: unknown): string =>
  typeof v === 'string' ? v.trim().slice(0, IMPORT_MAX_FORM_TEXT_CHARS) : '';

const MARKER = 'FB_PUBLIC_LOAD_DATA_';

/** The form's page data from a script tag; the content script can't read page variables. */
export function loadDataFrom(doc: Document): unknown {
  for (const script of Array.from(doc.scripts)) {
    const src = script.textContent ?? '';
    const at = src.indexOf(MARKER);
    if (at < 0) continue;
    const start = src.indexOf('[', at);
    const end = src.lastIndexOf(']');
    if (start < 0 || end <= start) continue;
    try {
      return JSON.parse(src.slice(start, end + 1)) as unknown;
    } catch {
      return null;
    }
  }
  return null;
}

const PICTURE_HOSTS =
  /^https:\/\/(docs\.google\.com\/forms-images-rt\/|lh\d+(-[a-z]+)?\.googleusercontent\.com\/)/;

/** Each item's pictures in page order, keyed by the item id the page renders on its card. */
export function itemPictures(doc: Document): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const card of Array.from(doc.querySelectorAll('[data-item-id]'))) {
    const id = card.getAttribute('data-item-id') ?? '';
    const urls = Array.from(card.querySelectorAll('img'))
      .map((img) => img.getAttribute('src') ?? '')
      .filter((src) => PICTURE_HOSTS.test(src) && src.length <= 2048);
    if (id && urls.length) out.set(id, urls);
  }
  return out;
}

// Google's own item type numbers in the page data.
const KIND_BY_TYPE: Record<number, ImportFormQuestionKind> = {
  0: 'short',
  1: 'paragraph',
  2: 'choice',
  3: 'dropdown',
  4: 'checkbox',
  5: 'scale',
  7: 'grid',
  18: 'rating',
};
const LEFT_OUT_BY_TYPE: Record<number, ImportFormLeftOut> = {
  9: 'date',
  10: 'time',
  12: 'video',
  13: 'fileUpload',
};
const IMAGE_ITEM = 11;

export type FormRead =
  | {
      ok: true;
      title: string;
      form: ImportForm;
      blocks: ImportBlock[];
      questions: number;
    }
  | { ok: false; reason: string };

/** The page data as a form; `pictures` comes from `itemPictures`, so a picture the page didn't draw is counted as left out. */
export function formFromLoadData(
  data: unknown,
  pictures: ReadonlyMap<string, string[]> = new Map(),
  formId?: string
): FormRead {
  const root = arr(data);
  const body = arr(root[1]);
  const rawItems = arr(body[1]);
  if (!rawItems.length) return { ok: false, reason: 'no form items' };
  const title =
    (str(body[8]) || str(root[3]) || 'Google Form').slice(
      0,
      IMPORT_MAX_TITLE_CHARS
    ) || 'Google Form';
  const leftOut: Partial<Record<ImportFormLeftOut, number>> = {};
  const count = (kind: ImportFormLeftOut, n = 1) => {
    if (n > 0) leftOut[kind] = (leftOut[kind] ?? 0) + n;
  };
  const items: ImportFormItem[] = [];
  for (const raw of rawItems) {
    if (items.length >= IMPORT_MAX_FORM_ITEMS) break;
    const it = arr(raw);
    const type = typeof it[3] === 'number' ? it[3] : -1;
    const id =
      typeof it[0] === 'number' || typeof it[0] === 'string'
        ? String(it[0])
        : '';
    const text = str(it[1]);
    const shown = [...(pictures.get(id) ?? [])];
    if (LEFT_OUT_BY_TYPE[type]) {
      count(LEFT_OUT_BY_TYPE[type]);
      continue;
    }
    if (type === IMAGE_ITEM) {
      const image = shown[0];
      if (image) items.push({ kind: 'image', text, image });
      else count('picture');
      continue;
    }
    let kind = KIND_BY_TYPE[type];
    if (!kind) continue;
    const entries = arr(it[4]).map(arr);
    const first = entries[0] ?? [];
    const description = str(it[2]);
    const item: ImportFormQuestion = { kind, text };
    if (description) item.description = description;
    // The question's own pictures are drawn before its choices'.
    const questionPictures = arr(it[9]).length;
    if (questionPictures > 0) {
      const image = shown.splice(0, questionPictures)[0];
      if (image) item.image = image;
      else count('picture');
      count('picture', questionPictures - 1);
    }
    if (kind === 'grid') {
      if (arr(arr(first[11]))[0] === 1) kind = item.kind = 'checkboxGrid';
      item.rows = entries
        .map((e) => str(arr(e[3])[0]))
        .slice(0, IMPORT_MAX_FORM_OPTIONS);
      item.options = arr(first[1])
        .map((o) => ({ text: str(arr(o)[0]) }))
        .slice(0, IMPORT_MAX_FORM_OPTIONS);
    } else if (kind === 'scale' || kind === 'rating') {
      const steps = arr(first[1]).map((o) => Number(str(arr(o)[0])));
      const numbers = steps.filter((n) => Number.isFinite(n));
      item.low = numbers.length ? Math.min(...numbers) : 1;
      item.high = numbers.length
        ? Math.max(...numbers)
        : Math.max(steps.length, 5);
      const ends = arr(first[3]);
      if (str(ends[0])) item.lowLabel = str(ends[0]);
      if (str(ends[1])) item.highLabel = str(ends[1]);
    } else if (kind !== 'short' && kind !== 'paragraph') {
      // "Other" with its free text box isn't a choice a quiz or poll can hold.
      const choices = arr(first[1])
        .map(arr)
        .filter((o) => o[4] !== 1 && str(o[0]))
        .slice(0, IMPORT_MAX_FORM_OPTIONS);
      const pictured = choices.filter((o) => arr(o[5]).length > 0).length;
      // Choice pictures map in order only when the page drew exactly one for each.
      const usable = pictured > 0 && shown.length === pictured;
      if (pictured > 0 && !usable) count('picture', pictured);
      item.options = choices.map((o): ImportFormOption => {
        const option: ImportFormOption = { text: str(o[0]) };
        if (usable && arr(o[5]).length > 0) {
          const image = shown.shift();
          if (image) option.image = image;
        }
        return option;
      });
      if (!item.options.length) continue;
    }
    items.push(item);
  }
  const questions = items.filter((i) => i.kind !== 'image').length;
  if (!questions) return { ok: false, reason: 'no questions in the form' };
  const form: ImportForm = {
    ...(formId ? { formId } : {}),
    items,
    ...(Object.keys(leftOut).length ? { leftOut } : {}),
  };
  return { ok: true, title, form, blocks: formBlocks(title, items), questions };
}

/** The form as page text too, so the other Import targets can still read it. */
export function formBlocks(
  title: string,
  items: readonly ImportFormItem[]
): ImportBlock[] {
  const blocks: ImportBlock[] = [{ type: 'heading', level: 1, text: title }];
  let n = 0;
  for (const item of items) {
    if (item.kind === 'image' || !item.text) continue;
    n += 1;
    blocks.push({ type: 'paragraph', text: `${n}. ${item.text}` });
    for (const row of item.rows ?? [])
      blocks.push({ type: 'listItem', text: row });
    for (const option of item.options ?? [])
      if (option.text) blocks.push({ type: 'listItem', text: option.text });
  }
  return blocks.slice(0, IMPORT_MAX_BLOCKS);
}

/** Reads the open form; on the editor it reads the form's own responder page with the teacher's sign-in. */
export async function readGoogleForm(
  page: FormPage,
  doc: Document,
  fetchHtml: (url: string) => Promise<string> = async (url) => {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error(`Google Forms answered ${res.status}`);
    return res.text();
  }
): Promise<FormRead> {
  try {
    const source =
      page.kind === 'view'
        ? doc
        : new DOMParser().parseFromString(
            await fetchHtml(
              `https://docs.google.com/forms/d/${page.formId}/viewform`
            ),
            'text/html'
          );
    const data = loadDataFrom(source);
    if (!data) return { ok: false, reason: 'no form data on the page' };
    return formFromLoadData(
      data,
      itemPictures(source),
      page.kind === 'edit' ? page.formId : undefined
    );
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : 'form read failed',
    };
  }
}
