// Package writer: the only module that knows the file layout (plan M31). Align it with the package type when that lands.
import JSZip from 'jszip';
import { slug } from './html.mjs';

export const PACKAGE_FORMAT = 'spartboard-package';
export const PACKAGE_VERSION = 1;

/**
 * Writes one zip: `package.json`, `banks/<name>.bank.json` and `pictures/<file>`.
 * @param {{ banks: object[], pictures: Map<string, Buffer>, meta: { title: string, generatedAt: number, source: object } }} input
 *   banks come from `convertItems`; pictures are keyed by the path stimuli use (`pictures/x.png`).
 * @returns {Promise<Buffer>}
 */
export async function writePackage({ banks, pictures, meta }) {
  const zip = new JSZip();
  const date = new Date(meta.generatedAt);
  const add = (path, data) => zip.file(path, data, { date });
  const entries = [];
  const used = new Set();
  for (const b of banks) {
    const missing = b.pictures.filter((p) => !pictures.has(p));
    if (missing.length) {
      throw new Error(`"${b.title}" is missing pictures: ${missing.join(', ')}`);
    }
    let name = slug(b.title);
    while (used.has(name)) name += '-x';
    used.add(name);
    const path = `banks/${name}.bank.json`;
    add(path, JSON.stringify(b.bank, null, 1));
    const withResults = b.entries.filter((e) => e.resultsPicture);
    for (const e of withResults) {
      if (!pictures.has(e.resultsPicture)) {
        throw new Error(`Missing results picture ${e.resultsPicture}`);
      }
    }
    entries.push({
      kind: 'questionBank',
      id: b.id,
      title: b.title,
      path,
      questionCount: b.bank.questions.length,
      pictures: [...new Set([...b.pictures, ...withResults.map((e) => e.resultsPicture)])],
      questions: b.entries.map((e) => ({
        id: e.id,
        attribution: e.attribution,
        resultsPicture: e.resultsPicture,
      })),
    });
  }
  for (const [path, data] of pictures) add(path, data);
  add(
    'package.json',
    JSON.stringify(
      {
        format: PACKAGE_FORMAT,
        version: PACKAGE_VERSION,
        title: meta.title,
        generatedAt: meta.generatedAt,
        source: meta.source,
        entries,
      },
      null,
      1
    )
  );
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
