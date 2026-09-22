/**
 * Reads a Common Cartridge (.imscc) — the export an LMS like Schoology gives
 * you — into the same `ExtractedQuiz` every other reader produces.
 *
 * A cartridge is not a document: it is a zip whose `imsmanifest.xml` points at
 * QTI 1.2 XML files, one `<item>` per question. That is a better source than a
 * printed test, because QTI records which choice is correct, so the answer key
 * comes with the questions rather than having to be found in the prose.
 */

import JSZip from 'jszip';
import type {
  ExtractedImage,
  ExtractedOption,
  ExtractedQuestion,
  ExtractedQuiz,
} from './types';
import type { QuizQuestionType } from '@/types';
import { DocumentTooLargeError, MAX_CARTRIDGE_UNZIPPED_BYTES } from './limits';

const MANIFEST = 'imsmanifest.xml';
const FILE_BASE = /\$IMS-?CC-?FILEBASE\$\/?/gi;

/** Extensions Quiz can show as an image stimulus. */
const IMAGE_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
};

const localName = (el: Element): string =>
  el.tagName.includes(':') ? el.tagName.split(':')[1] : el.tagName;

const descendants = (root: Element | Document, name: string): Element[] =>
  Array.from(root.getElementsByTagName('*')).filter(
    (el) => localName(el) === name
  );

const firstDescendant = (
  root: Element | Document,
  name: string
): Element | null => descendants(root, name)[0] ?? null;

const childrenNamed = (root: Element, name: string): Element[] =>
  Array.from(root.children).filter((el) => localName(el) === name);

/** `<mattext texttype="text/html">` holds escaped HTML; take its words only. */
function materialText(root: Element | null): {
  text: string;
  imageSrcs: string[];
} {
  if (!root) return { text: '', imageSrcs: [] };
  const parts: string[] = [];
  const imageSrcs: string[] = [];
  for (const mattext of descendants(root, 'mattext')) {
    const raw = mattext.textContent ?? '';
    if (!raw.trim()) continue;
    if ((mattext.getAttribute('texttype') ?? '').includes('html')) {
      const html = new DOMParser().parseFromString(raw, 'text/html');
      for (const img of Array.from(html.getElementsByTagName('img'))) {
        const src = img.getAttribute('src');
        if (src) imageSrcs.push(src);
      }
      parts.push(html.body.textContent ?? '');
    } else {
      parts.push(raw);
    }
  }
  return {
    text: parts.join(' ').replace(/\s+/g, ' ').trim(),
    imageSrcs,
  };
}

/** The `question_type` an LMS writes into the item's metadata. */
function metadataField(item: Element, label: string): string {
  for (const field of descendants(item, 'qtimetadatafield')) {
    const name = firstDescendant(field, 'fieldlabel')?.textContent?.trim();
    if (name === label) {
      return firstDescendant(field, 'fieldentry')?.textContent?.trim() ?? '';
    }
  }
  return '';
}

/**
 * The idents a scoring condition accepts. QTI marks the right answer by
 * pointing a `respcondition` that sets a score at a choice's ident, so this is
 * where the answer key lives.
 */
function correctIdents(item: Element): Map<string, string[]> {
  const byResponse = new Map<string, string[]>();
  const processing = firstDescendant(item, 'resprocessing');
  if (!processing) return byResponse;

  for (const condition of descendants(processing, 'respcondition')) {
    const scores = descendants(condition, 'setvar').some((setvar) => {
      const name = (setvar.getAttribute('varname') ?? '').toLowerCase();
      const value = Number.parseFloat(setvar.textContent ?? '');
      return name.includes('score') && Number.isFinite(value) && value > 0;
    });
    if (!scores) continue;
    // A condition under `<not>` names a wrong answer, not a right one.
    if (descendants(condition, 'not').length > 0) continue;

    for (const equal of descendants(condition, 'varequal')) {
      const respident = equal.getAttribute('respident') ?? '';
      const value = (equal.textContent ?? '').trim();
      if (!value) continue;
      byResponse.set(respident, [...(byResponse.get(respident) ?? []), value]);
    }
  }
  return byResponse;
}

interface Choice {
  ident: string;
  text: string;
}

/** One `<response_lid>`: the prompt it belongs to and the choices under it. */
function choicesOf(responseLid: Element): Choice[] {
  return descendants(responseLid, 'response_label').map((label) => ({
    ident: label.getAttribute('ident') ?? '',
    text: materialText(label).text,
  }));
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const asOptions = (choices: Choice[]): ExtractedOption[] =>
  choices.map((choice, index) => ({
    letter: LETTERS[index] ?? '',
    text: choice.text,
  }));

/** Common Cartridge states the type as a `cc_profile`; Canvas writes `question_type`. */
function typeFromProfile(profile: string): QuizQuestionType | null {
  const kind = profile.toLowerCase();
  if (!kind.startsWith('cc.')) return null;
  if (kind.includes('essay')) return 'free-response';
  if (kind.includes('fib') || kind.includes('pattern_match')) return 'FIB';
  if (
    kind.includes('multiple_choice') ||
    kind.includes('multiple_response') ||
    kind.includes('true_false')
  ) {
    return 'MC';
  }
  return null;
}

/** Question types an LMS writes; anything unknown is decided by its shape. */
function typeOf(
  declared: string,
  profile: string,
  responseLids: Element[]
): QuizQuestionType {
  const kind = declared.toLowerCase();
  if (kind.includes('essay')) return 'free-response';
  if (kind.includes('matching')) return 'Matching';
  if (kind.includes('ordering')) return 'Ordering';
  if (kind.includes('short_answer') || kind.includes('numerical')) return 'FIB';
  if (kind.includes('fill_in') || kind.includes('fib')) return 'FIB';
  const fromProfile = typeFromProfile(profile);
  if (fromProfile) return fromProfile;
  if (responseLids.length > 1) return 'Matching';
  if (responseLids.length === 1) return 'MC';
  return 'free-response';
}

/** Matching comes back as the pipe-separated pairs `QuizQuestion` stores. */
function matchingPairs(
  item: Element,
  responseLids: Element[],
  correct: Map<string, string[]>
): { answer: string; warnings: string[] } {
  const pairs: string[] = [];
  const warnings: string[] = [];
  for (const lid of responseLids) {
    const ident = lid.getAttribute('ident') ?? '';
    // The term sits in the material beside its own choice list.
    // The term is the material directly under the prompt; `descendants` would
    // swallow the choice list with it.
    const term = childrenNamed(lid, 'material')
      .map((m) => materialText(m).text)
      .join(' ')
      .trim();
    const wanted = correct.get(ident)?.[0];
    const choice = choicesOf(lid).find((c) => c.ident === wanted);
    if (!term || !choice) continue;
    if (term.includes(':') || term.includes('|') || choice.text.includes('|')) {
      warnings.push(
        'A matching pair contains a colon or a pipe, which this quiz uses to separate pairs — check it in the editor.'
      );
      continue;
    }
    pairs.push(`${term}:${choice.text}`);
  }
  if (pairs.length === 0) {
    warnings.push(
      'This came in as a matching question, but its pairs could not be read — rebuild it in the editor.'
    );
  }
  return { answer: pairs.join('|'), warnings };
}

function toQuestion(item: Element, number: number): ExtractedQuestion {
  const warnings: string[] = [];
  const presentation = firstDescendant(item, 'presentation');
  const responseLids = presentation
    ? descendants(presentation, 'response_lid')
    : [];
  const declared = metadataField(item, 'question_type');
  const profile = metadataField(item, 'cc_profile');
  const type = typeOf(declared, profile, responseLids);

  // The stem is the material that is not inside a choice list.
  const stemHolders = presentation
    ? childrenNamed(presentation, 'material')
    : [];
  const stem = stemHolders
    .map((holder) => materialText(holder))
    .reduce<{ text: string; imageSrcs: string[] }>(
      (all, part) => ({
        text: [all.text, part.text].filter(Boolean).join(' '),
        imageSrcs: [...all.imageSrcs, ...part.imageSrcs],
      }),
      { text: '', imageSrcs: [] }
    );

  const correct = correctIdents(item);
  let options: ExtractedOption[] = [];
  let correctAnswer = '';

  if (type === 'Matching') {
    const matched = matchingPairs(item, responseLids, correct);
    correctAnswer = matched.answer;
    warnings.push(...matched.warnings);
  } else if (type === 'MC' && responseLids.length === 1) {
    const choices = choicesOf(responseLids[0]);
    options = asOptions(choices);
    const ident = responseLids[0].getAttribute('ident') ?? '';
    const wanted = correct.get(ident) ?? [...correct.values()][0] ?? [];
    if (wanted.length > 1) {
      // Quiz scores one right answer, so guessing which would mark students
      // wrong on the others.
      warnings.push(
        'This question had more than one correct answer in the export, so none was kept — pick one in the editor.'
      );
    } else if (wanted.length === 1) {
      const hit = choices.find((c) => c.ident === wanted[0]);
      if (hit) correctAnswer = hit.text;
      else
        warnings.push(
          'The export marks an answer this question does not offer, so it was left blank.'
        );
    }
  } else if (type === 'Ordering') {
    warnings.push(
      'This came in as an ordering question; the export does not record the order, so put the items in order in the editor.'
    );
  } else if (type === 'FIB') {
    const accepted = [...correct.values()].flat();
    correctAnswer = accepted[0] ?? '';
    if (accepted.length > 1) {
      warnings.push(
        `The export accepted ${accepted.length} answers here (${accepted.join(', ')}); the first was kept.`
      );
    }
  }

  if (!stem.text) warnings.push('No question text was found.');

  return {
    number,
    text: stem.text,
    type,
    options,
    correctAnswer,
    imageIds: stem.imageSrcs,
    warnings,
  };
}

/** Unpacked bytes still allowed for this import, shared across every entry. */
interface UnzipBudget {
  remaining: number;
}

/** JSZip's `internalStream`, which its type definitions leave out. */
interface ZipStream {
  on(event: 'data', cb: (chunk: Uint8Array<ArrayBuffer>) => void): ZipStream;
  on(event: 'error', cb: (err: Error) => void): ZipStream;
  on(event: 'end', cb: () => void): ZipStream;
  pause(): ZipStream;
  resume(): ZipStream;
}

/** Streams an entry out of the zip and stops once the budget runs out. */
function unzipCapped(
  entry: JSZip.JSZipObject,
  budget: UnzipBudget
): Promise<Uint8Array<ArrayBuffer>[]> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    const stream = (
      entry as unknown as {
        internalStream: (type: 'uint8array') => ZipStream;
      }
    ).internalStream('uint8array');
    stream
      .on('data', (chunk: Uint8Array<ArrayBuffer>) => {
        budget.remaining -= chunk.length;
        if (budget.remaining < 0) {
          stream.pause();
          reject(
            new DocumentTooLargeError(
              `This export unpacks to more than ${Math.round(MAX_CARTRIDGE_UNZIPPED_BYTES / 1024 / 1024)} MB. Export the test on its own from your LMS and try again.`
            )
          );
          return;
        }
        chunks.push(chunk);
      })
      .on('error', reject)
      .on('end', () => resolve(chunks))
      .resume();
  });
}

async function unzipText(
  entry: JSZip.JSZipObject,
  budget: UnzipBudget
): Promise<string> {
  const decoder = new TextDecoder();
  const chunks = await unzipCapped(entry, budget);
  return (
    chunks.map((c) => decoder.decode(c, { stream: true })).join('') +
    decoder.decode()
  );
}

/** Every QTI item in one XML file, in the order the file lists them. */
function itemsIn(xml: string): { title: string; items: Element[] } | null {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) return null;
  if (!firstDescendant(doc, 'questestinterop')) return null;
  const holder =
    firstDescendant(doc, 'assessment') ?? firstDescendant(doc, 'objectbank');
  const items = descendants(doc, 'item');
  if (items.length === 0) return null;
  return { title: holder?.getAttribute('title')?.trim() ?? '', items };
}

/** A stray `%` in an export's path must not throw the whole import away. */
function decodePath(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** `$IMS-CC-FILEBASE$/media/a.png` and `../web_resources/a.png` alike. */
function zipPathFor(src: string, zip: JSZip): string | null {
  const cleaned = decodePath(src.replace(FILE_BASE, ''))
    .replace(/^\.{1,2}\//, '')
    .replace(/^\/+/, '')
    .split('?')[0];
  if (zip.file(cleaned)) return cleaned;
  const tail = cleaned.split('/').pop() ?? cleaned;
  const match = zip
    .file(/.*/)
    .find((entry) => entry.name.split('/').pop() === tail);
  return match ? match.name : null;
}

/**
 * Pulls the pictures the questions point at out of the zip and rewrites each
 * question's `imageIds` from the `src` it carried to the id of the picture.
 */
async function attachCartridgeImages(
  questions: ExtractedQuestion[],
  zip: JSZip,
  budget: UnzipBudget
): Promise<{ questions: ExtractedQuestion[]; images: ExtractedImage[] }> {
  const images: ExtractedImage[] = [];
  const idBySrc = new Map<string, string>();

  for (const question of questions) {
    for (const src of question.imageIds) {
      if (idBySrc.has(src)) continue;
      const path = zipPathFor(src, zip);
      if (!path) continue;
      const contentType =
        IMAGE_TYPES[path.split('.').pop()?.toLowerCase() ?? ''];
      const entry = zip.file(path);
      if (!entry || !contentType) continue;
      let blob: Blob;
      try {
        blob = new Blob(await unzipCapped(entry, budget), {
          type: contentType,
        });
      } catch (err) {
        if (err instanceof DocumentTooLargeError) throw err;
        // A picture that will not unzip is one row's note, not a failed import.
        console.warn('[quizDocumentImport] could not unzip a picture', err);
        continue;
      }
      const id = `img-${images.length + 1}`;
      idBySrc.set(src, id);
      images.push({ id, blob, contentType, name: path.split('/').pop() ?? id });
    }
  }

  return {
    questions: questions.map((question) => {
      const imageIds = question.imageIds
        .map((src) => idBySrc.get(src))
        .filter((id): id is string => typeof id === 'string');
      const missing = question.imageIds.length - imageIds.length;
      return {
        ...question,
        imageIds,
        warnings:
          missing > 0
            ? [
                ...question.warnings,
                `${missing === 1 ? 'A picture' : `${missing} pictures`} could not be taken out of the export — add ${missing === 1 ? 'it' : 'them'} in the editor.`,
              ]
            : question.warnings,
      };
    }),
    images,
  };
}

/** Reads the one test in a cartridge; several means the first is taken. */
export async function readCartridge(
  file: Blob,
  fallbackTitle: string,
  maxUnzippedBytes: number = MAX_CARTRIDGE_UNZIPPED_BYTES
): Promise<ExtractedQuiz> {
  const budget: UnzipBudget = { remaining: maxUnzippedBytes };
  const zip = await new JSZip().loadAsync(file);
  if (!zip.file(MANIFEST)) {
    throw new Error(
      'That doesn’t look like an LMS export. Upload the .imscc file the LMS gave you, not a zip you made yourself.'
    );
  }

  const found: Array<{ title: string; items: Element[] }> = [];
  for (const entry of zip.file(/\.xml$/i)) {
    if (entry.name.endsWith(MANIFEST)) continue;
    const parsed = itemsIn(await unzipText(entry, budget));
    if (parsed) found.push(parsed);
  }

  if (found.length === 0) {
    throw new Error(
      'No questions were found in that export. Export the test on its own from your LMS and try again.'
    );
  }

  const warnings: string[] = [];
  const [first, ...rest] = found;
  if (rest.length > 0) {
    warnings.push(
      `This export holds ${found.length} tests; “${first.title || fallbackTitle}” was brought in. Export the others one at a time.`
    );
  }

  const read = first.items.map((item, index) => toQuestion(item, index + 1));
  const { questions, images } = await attachCartridgeImages(read, zip, budget);

  return {
    title: first.title || fallbackTitle,
    questions,
    images,
    warnings,
  };
}
