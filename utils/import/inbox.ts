// Reads a stored Send (`users/{uid}/import_inbox/{id}`) defensively; the server already checked it on the way in.
import {
  IMPORT_CARDS_LEFT_OUT,
  IMPORT_CARD_LANGUAGE,
  GOOGLE_FORM_ID,
  IMPORT_FORM_LEFT_OUT,
  IMPORT_FORM_QUESTION_KINDS,
  IMPORT_VIDEO_LEFT_OUT,
  YOUTUBE_VIDEO_ID,
  type ImportBlock,
  type ImportCardSet,
  type ImportForm,
  type ImportFormItem,
  type ImportFormOption,
  type ImportFormQuestion,
  type ImportImage,
  type ImportInboxItem,
  type ImportVideoLesson,
  type ImportVideoStop,
} from './contract';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): v is string => typeof v === 'string';

function parseBlock(v: unknown): ImportBlock | null {
  if (!isObj(v)) return null;
  if (v.type === 'table') {
    if (!Array.isArray(v.rows)) return null;
    const rows = v.rows.filter(isObj).map((r) => ({
      cells: Array.isArray(r.cells) ? r.cells.filter(str) : [],
    }));
    return { type: 'table', rows };
  }
  if (!str(v.text)) return null;
  if (v.type === 'heading')
    return {
      type: 'heading',
      level: typeof v.level === 'number' ? v.level : 2,
      text: v.text,
    };
  if (v.type === 'paragraph' || v.type === 'listItem' || v.type === 'quote')
    return { type: v.type, text: v.text };
  return null;
}

function parseImage(v: unknown): ImportImage | null {
  if (!isObj(v) || !str(v.url)) return null;
  return str(v.alt) ? { url: v.url, alt: v.alt } : { url: v.url };
}

const time = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;

const httpsImage = (v: unknown): { image?: string } =>
  str(v) && v.startsWith('https://') ? { image: v } : {};

function parseStop(v: unknown): ImportVideoStop | null {
  if (!isObj(v) || !str(v.text)) return null;
  const t = time(v.time);
  if (t === null) return null;
  if (v.kind === 'open' || v.kind === 'note')
    return { kind: v.kind, time: t, text: v.text, ...httpsImage(v.image) };
  if (v.kind !== 'choice' || !Array.isArray(v.choices)) return null;
  const choices = v.choices
    .filter(isObj)
    .filter((c) => str(c.text))
    .map((c) => ({ text: c.text as string, correct: c.correct === true }));
  return choices.length
    ? { kind: 'choice', time: t, text: v.text, choices, ...httpsImage(v.image) }
    : null;
}

function parseVideo(v: unknown): ImportVideoLesson | null {
  if (!isObj(v) || !str(v.youtubeId) || !YOUTUBE_VIDEO_ID.test(v.youtubeId))
    return null;
  const start = time(v.start);
  const end = time(v.end);
  const leftOut: NonNullable<ImportVideoLesson['leftOut']> = {};
  if (isObj(v.leftOut))
    for (const kind of IMPORT_VIDEO_LEFT_OUT) {
      const n = v.leftOut[kind];
      if (typeof n === 'number' && Number.isInteger(n) && n > 0)
        leftOut[kind] = n;
    }
  return {
    ...(Object.keys(leftOut).length ? { leftOut } : {}),
    youtubeId: v.youtubeId,
    ...(start !== null ? { start } : {}),
    ...(end !== null ? { end } : {}),
    stops: Array.isArray(v.stops)
      ? v.stops.map(parseStop).filter((s): s is ImportVideoStop => s !== null)
      : [],
  };
}

const language = (v: unknown): string | null =>
  str(v) && IMPORT_CARD_LANGUAGE.test(v) ? v : null;

function parseCards(v: unknown): ImportCardSet | null {
  if (!isObj(v) || !Array.isArray(v.cards)) return null;
  const leftOut: NonNullable<ImportCardSet['leftOut']> = {};
  if (isObj(v.leftOut))
    for (const kind of IMPORT_CARDS_LEFT_OUT) {
      const n = v.leftOut[kind];
      if (typeof n === 'number' && Number.isInteger(n) && n > 0)
        leftOut[kind] = n;
    }
  const termLanguage = language(v.termLanguage);
  const definitionLanguage = language(v.definitionLanguage);
  return {
    cards: v.cards
      .filter(isObj)
      .filter((c) => str(c.term) && str(c.definition))
      .map((c) => ({
        term: c.term as string,
        definition: c.definition as string,
      })),
    ...(termLanguage ? { termLanguage } : {}),
    ...(definitionLanguage ? { definitionLanguage } : {}),
    ...(Object.keys(leftOut).length ? { leftOut } : {}),
  };
}

const FORM_KINDS: readonly string[] = IMPORT_FORM_QUESTION_KINDS;
const strings = (v: unknown): string[] | undefined =>
  Array.isArray(v) ? v.filter(str) : undefined;
const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

function parseFormItem(v: unknown): ImportFormItem | null {
  if (!isObj(v) || !str(v.text)) return null;
  if (v.kind === 'image') {
    const { image } = httpsImage(v.image);
    return image ? { kind: 'image', text: v.text, image } : null;
  }
  if (!str(v.kind) || !FORM_KINDS.includes(v.kind)) return null;
  const item: ImportFormQuestion = {
    kind: v.kind as ImportFormQuestion['kind'],
    text: v.text,
    ...httpsImage(v.image),
  };
  if (str(v.description)) item.description = v.description;
  if (Array.isArray(v.options))
    item.options = v.options
      .filter(isObj)
      .filter((o) => str(o.text))
      .map((o): ImportFormOption => ({
        text: o.text as string,
        ...httpsImage(o.image),
      }));
  const rows = strings(v.rows);
  if (rows) item.rows = rows;
  const correct = strings(v.correct);
  if (correct) item.correct = correct;
  for (const key of ['low', 'high', 'points'] as const) {
    const n = num(v[key]);
    if (n !== undefined) item[key] = n;
  }
  if (str(v.lowLabel)) item.lowLabel = v.lowLabel;
  if (str(v.highLabel)) item.highLabel = v.highLabel;
  return item;
}

function parseForm(v: unknown): ImportForm | null {
  if (!isObj(v) || !Array.isArray(v.items)) return null;
  const leftOut: NonNullable<ImportForm['leftOut']> = {};
  if (isObj(v.leftOut))
    for (const kind of IMPORT_FORM_LEFT_OUT) {
      const n = v.leftOut[kind];
      if (typeof n === 'number' && Number.isInteger(n) && n > 0)
        leftOut[kind] = n;
    }
  return {
    ...(str(v.formId) && GOOGLE_FORM_ID.test(v.formId)
      ? { formId: v.formId }
      : {}),
    items: v.items
      .map(parseFormItem)
      .filter((i): i is ImportFormItem => i !== null),
    ...(Object.keys(leftOut).length ? { leftOut } : {}),
  };
}

export function parseImportInboxItem(
  id: string,
  data: unknown
): ImportInboxItem | null {
  if (!isObj(data) || !str(data.url) || !str(data.title)) return null;
  const video = parseVideo(data.video);
  const cards = parseCards(data.cards);
  const form = parseForm(data.form);
  return {
    id,
    url: data.url,
    title: data.title,
    platform: str(data.platform) ? data.platform : 'generic',
    selectionOnly: data.selectionOnly === true,
    blocks: Array.isArray(data.blocks)
      ? data.blocks.map(parseBlock).filter((b): b is ImportBlock => b !== null)
      : [],
    images: Array.isArray(data.images)
      ? data.images.map(parseImage).filter((i): i is ImportImage => i !== null)
      : [],
    receivedAt: typeof data.receivedAt === 'number' ? data.receivedAt : 0,
    ...(video ? { video } : {}),
    ...(cards ? { cards } : {}),
    ...(form ? { form } : {}),
  };
}
