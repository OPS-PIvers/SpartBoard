/**
 * MiniApp Import Adapter.
 *
 * Implements `ImportAdapter<MiniAppImportData>` for the shared `ImportWizard`.
 * Teachers upload a single `.html` / `.htm` file; that file becomes one
 * mini-app row. The title is derived from the file's `<title>` tag (falling
 * back to the first `<h1>`, then to the filename stem).
 *
 * Writes to `/users/{uid}/miniapps/` with negative `order` values
 * (`index - total`) so imports land at the top of the library while
 * preserving their relative order (matches the pre-migration behavior).
 *
 * Magic Generator (Gemini) deliberately stays inside the editor body; it is
 * NOT surfaced here as `aiAssist`, per the original MiniApp brief.
 */

import React from 'react';
import { collection, doc, writeBatch } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { MiniAppItem } from '@/types';
import type {
  ImportAdapter,
  ImportParseResult,
  ImportSourcePayload,
  ImportValidationResult,
} from '@/components/common/library/types';

/** Row shape used internally by the wizard after parsing. */
export interface MiniAppImportRow {
  title: string;
  html: string;
}

/** What the adapter hands the wizard across parse → validate → save. */
export interface MiniAppImportData {
  rows: MiniAppImportRow[];
}

const MAX_TITLE_LENGTH = 100;

/** Strip a filename down to a reasonable fallback title. */
function titleFromFileName(name: string | undefined): string {
  if (!name) return 'Untitled App';
  const stem = name.replace(/\.[^.]+$/, '').trim();
  return stem ? stem.slice(0, MAX_TITLE_LENGTH) : 'Untitled App';
}

/**
 * Extract a human-readable title from an HTML document. Tries `<title>`, then
 * the first `<h1>`. Returns an empty string if neither is present.
 *
 * Uses `DOMParser` so nested/malformed tags in an `<h1>` are handled by the
 * browser's HTML parser (safer than regex-based tag stripping, which can be
 * bypassed by patterns like `<scr<b>ipt>`).
 */
function titleFromHtml(html: string): string {
  if (typeof DOMParser === 'undefined') return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');

  const titleText = doc.querySelector('title')?.textContent;
  const normalizedTitle = titleText?.replace(/\s+/g, ' ').trim();
  if (normalizedTitle) return normalizedTitle.slice(0, MAX_TITLE_LENGTH);

  const h1Text = doc.querySelector('h1')?.textContent;
  const normalizedH1 = h1Text?.replace(/\s+/g, ' ').trim();
  if (normalizedH1) return normalizedH1.slice(0, MAX_TITLE_LENGTH);

  return '';
}

async function readSourceAsHtml(
  source: ImportSourcePayload
): Promise<{ text: string; fileName?: string }> {
  if (source.kind === 'html') {
    return { text: source.text, fileName: source.fileName };
  }
  if (source.kind === 'file') {
    const text = await source.file.text();
    return { text, fileName: source.file.name };
  }
  throw new Error(
    `MiniApp import only accepts HTML files. Got source kind: ${source.kind}.`
  );
}

async function parseMiniAppImport(
  source: ImportSourcePayload
): Promise<ImportParseResult<MiniAppImportData>> {
  const { text, fileName } = await readSourceAsHtml(source);

  const trimmed = text.trim();
  if (trimmed.length === 0) {
    throw new Error('The selected file is empty.');
  }

  // Light sanity check — warn (not block) if it doesn't look like HTML. An
  // iframe srcdoc can still render a bare fragment, so we don't reject.
  const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(trimmed);
  const warnings: string[] = [];
  if (!looksLikeHtml) {
    warnings.push(
      "That file doesn't look like HTML, but we'll try to run it anyway."
    );
  }

  const derivedTitle = titleFromHtml(trimmed) || titleFromFileName(fileName);

  const row: MiniAppImportRow = { title: derivedTitle, html: text };
  return { data: { rows: [row] }, warnings };
}

function validateMiniAppImport(
  data: MiniAppImportData
): ImportValidationResult {
  if (data.rows.length === 0) {
    return {
      ok: false,
      errors: ['No importable app was found in the selected file.'],
    };
  }
  return { ok: true, errors: [] };
}

function renderMiniAppPreview(data: MiniAppImportData): React.ReactElement {
  return React.createElement(
    'div',
    { className: 'flex flex-col gap-2' },
    React.createElement(
      'p',
      { className: 'text-sm font-bold text-slate-700' },
      `${data.rows.length} ${data.rows.length === 1 ? 'app' : 'apps'} ready to import`
    ),
    React.createElement(
      'ul',
      { className: 'flex flex-col gap-1.5' },
      ...data.rows.map((row, idx) =>
        React.createElement(
          'li',
          {
            key: `miniapp-import-${idx}`,
            className:
              'flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700',
          },
          React.createElement(
            'span',
            {
              className:
                'shrink-0 rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-indigo-600 border border-indigo-100',
            },
            'HTML'
          ),
          React.createElement(
            'span',
            { className: 'truncate font-medium' },
            row.title
          ),
          React.createElement(
            'span',
            { className: 'ml-auto shrink-0 text-xs font-mono text-slate-400' },
            `${(row.html.length / 1024).toFixed(1)} KB`
          )
        )
      )
    )
  );
}

/**
 * Build the adapter for the currently signed-in teacher. `userId` is bound
 * in at construction time so the wizard has everything it needs for `save()`.
 */
export function createMiniAppImportAdapter(
  userId: string
): ImportAdapter<MiniAppImportData> {
  return {
    widgetLabel: 'Mini App',
    supportedSources: ['html'],
    parse: parseMiniAppImport,
    validate: validateMiniAppImport,
    renderPreview: renderMiniAppPreview,
    async save(data, title) {
      if (!userId) throw new Error('Not authenticated');
      if (data.rows.length === 0) return;

      const appsRef = collection(db, 'users', userId, 'miniapps');
      const batch = writeBatch(db);
      const total = data.rows.length;

      data.rows.forEach((row, index) => {
        const id = crypto.randomUUID();
        // When the user typed a title in the confirm step, apply it to the
        // single-row import. For multi-row (future) we leave per-row titles.
        const resolvedTitle =
          total === 1 && title && title.trim()
            ? title.trim().slice(0, MAX_TITLE_LENGTH)
            : row.title;
        const appData: MiniAppItem = {
          id,
          title: resolvedTitle,
          html: row.html,
          createdAt: Date.now(),
          // New imports land at the top by taking strictly smaller `order`
          // values than anything existing (matches pre-migration behavior).
          order: index - total,
        };
        batch.set(doc(appsRef, id), appData);
      });

      await batch.commit();
    },
  };
}
