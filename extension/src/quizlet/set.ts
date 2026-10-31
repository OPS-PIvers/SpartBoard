// The Quizlet Platform reader (docs/plans/IMPORT.md D38): a set's terms, definitions and side languages.

import {
  IMPORT_CARD_LANGUAGE,
  IMPORT_MAX_CARDS,
  IMPORT_MAX_CARD_TEXT_CHARS,
  IMPORT_MAX_TABLE_ROWS,
  IMPORT_MAX_TITLE_CHARS,
  type ImportBlock,
  type ImportCardSet,
  type ImportCardsLeftOut,
} from '@/utils/import/contract';

export const QUIZLET_PLATFORM = 'quizlet';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

// Quizlet's media types on a card side.
const TEXT = 1;
const PICTURE = 2;
const AUDIO = 4;
const DIAGRAM = 5;

/** The set id on a Quizlet set page (`/123/name-flash-cards/`, `/gb/123/...`, `/123/learn`); null elsewhere. */
export function quizletSetId(href: string): string | null {
  try {
    const u = new URL(href);
    if (u.hostname !== 'quizlet.com' && u.hostname !== 'www.quizlet.com')
      return null;
    return (
      /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(\d{3,15})(?:\/|$)/i.exec(
        u.pathname
      )?.[1] ?? null
    );
  } catch {
    return null;
  }
}

/** The set name from the tab title, without Quizlet's own suffix. */
export function quizletTitle(pageTitle: string): string {
  const title = pageTitle
    .replace(/\s*\|\s*Quizlet\s*$/i, '')
    .replace(/\s+Flashcards$/i, '')
    .trim();
  return (title || 'Quizlet set').slice(0, IMPORT_MAX_TITLE_CHARS);
}

const sideText = (media: Obj[]): string =>
  media
    .filter((m) => m.type === TEXT && typeof m.plainText === 'string')
    .map((m) => (m.plainText as string).trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, IMPORT_MAX_CARD_TEXT_CHARS);

const sideLanguage = (media: Obj[]): string | undefined => {
  const code = media.find(
    (m) => m.type === TEXT && typeof m.languageCode === 'string'
  )?.languageCode;
  return typeof code === 'string' && IMPORT_CARD_LANGUAGE.test(code)
    ? code
    : undefined;
};

/** The language most cards on a side use, so one odd card doesn't set it. */
function mostUsed(codes: (string | undefined)[]): string | undefined {
  const tally = new Map<string, number>();
  for (const c of codes) if (c) tally.set(c, (tally.get(c) ?? 0) + 1);
  let best: string | undefined;
  for (const [code, n] of tally)
    if (best === undefined || n > (tally.get(best) ?? 0)) best = code;
  return best;
}

export type QuizletRead =
  { ok: true; set: ImportCardSet } | { ok: false; reason: string };

/** Quizlet's `studiableItem` list as a card set; pictures, recorded audio and diagrams are counted, not kept. */
export function cardSetFromItems(items: unknown[]): QuizletRead {
  const cards: ImportCardSet['cards'] = [];
  const termLangs: (string | undefined)[] = [];
  const definitionLangs: (string | undefined)[] = [];
  const leftOut: Partial<Record<ImportCardsLeftOut, number>> = {};
  const count = (kind: ImportCardsLeftOut, n = 1) => {
    if (n > 0) leftOut[kind] = (leftOut[kind] ?? 0) + n;
  };
  const sorted = items
    .filter(isObj)
    .map((item, i) => ({
      item,
      rank: typeof item.rank === 'number' ? item.rank : i,
    }))
    .sort((a, b) => a.rank - b.rank);
  for (const { item } of sorted) {
    const sides = list(item.cardSides).filter(isObj);
    if (!sides.length) continue;
    const side = (label: string, index: number) =>
      sides.find((s) => s.label === label) ?? sides[index];
    const mediaOf = (s: Obj | undefined) => list(s?.media).filter(isObj);
    const word = mediaOf(side('word', 0));
    const definition = mediaOf(side('definition', 1));
    const all = sides.flatMap(mediaOf);
    count('picture', all.filter((m) => m.type === PICTURE).length);
    count('audio', all.filter((m) => m.type === AUDIO).length);
    if (
      sides.some((s) => s.label === 'location') ||
      all.some((m) => m.type === DIAGRAM)
    )
      count('diagram');
    termLangs.push(sideLanguage(word));
    definitionLangs.push(sideLanguage(definition));
    // A picture-only side still goes over, so the review can say it was skipped.
    cards.push({ term: sideText(word), definition: sideText(definition) });
    if (cards.length >= IMPORT_MAX_CARDS) break;
  }
  if (!cards.length) return { ok: false, reason: 'no cards in the set data' };
  const termLanguage = mostUsed(termLangs);
  const definitionLanguage = mostUsed(definitionLangs);
  return {
    ok: true,
    set: {
      cards,
      ...(termLanguage ? { termLanguage } : {}),
      ...(definitionLanguage ? { definitionLanguage } : {}),
      ...(Object.keys(leftOut).length ? { leftOut } : {}),
    },
  };
}

// Under half the server's 900 KB Send cap, since the table repeats the card set.
export const CARD_TABLE_MAX_BYTES = 400_000;

/** The set as page text too, as two-column tables, so the other Import targets can still read it. */
export function cardSetBlocks(
  title: string,
  set: ImportCardSet
): ImportBlock[] {
  const blocks: ImportBlock[] = [{ type: 'heading', level: 1, text: title }];
  const bytes = new TextEncoder().encode(JSON.stringify(set.cards)).length;
  if (bytes > CARD_TABLE_MAX_BYTES) return blocks;
  const rows = set.cards
    .filter((c) => c.term || c.definition)
    .map((c) => ({ cells: [c.term, c.definition] }));
  for (let i = 0; i < rows.length; i += IMPORT_MAX_TABLE_ROWS)
    blocks.push({
      type: 'table',
      rows: rows.slice(i, i + IMPORT_MAX_TABLE_ROWS),
    });
  return blocks;
}

const PER_PAGE = 500;

const itemsUrl = (id: string, page: number, token: string) =>
  'https://quizlet.com/webapi/3.4/studiable-item-documents?' +
  new URLSearchParams({
    'filters[studiableContainerId]': id,
    'filters[studiableContainerType]': '1',
    perPage: String(PER_PAGE),
    page: String(page),
    ...(token ? { pagingToken: token } : {}),
  }).toString();

/** Reads the open set with the teacher's own Quizlet session; only a click calls this. */
export async function readQuizletSet(
  id: string,
  fetchJson: (url: string) => Promise<unknown> = async (url) => {
    const res = await fetch(url, {
      credentials: 'include',
      headers: { accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Quizlet answered ${res.status}`);
    return res.json() as Promise<unknown>;
  }
): Promise<QuizletRead> {
  const items: unknown[] = [];
  let token = '';
  try {
    for (let page = 1; items.length < IMPORT_MAX_CARDS; page += 1) {
      const raw = await fetchJson(itemsUrl(id, page, token));
      const reply = isObj(raw) ? list(raw.responses)[0] : undefined;
      if (!isObj(reply) || !isObj(reply.models))
        return { ok: false, reason: 'unexpected set data' };
      const batch = list(reply.models.studiableItem);
      items.push(...batch);
      const paging = isObj(reply.paging) ? reply.paging : {};
      token = typeof paging.token === 'string' ? paging.token : '';
      const total = typeof paging.total === 'number' ? paging.total : null;
      if (
        batch.length < PER_PAGE ||
        !token ||
        (total !== null && items.length >= total)
      )
        break;
    }
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'fetch failed',
    };
  }
  return cardSetFromItems(items);
}
